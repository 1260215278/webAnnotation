import { createServer } from "node:http"
import type { IncomingMessage, Server, ServerResponse } from "node:http"
import { randomUUID } from "node:crypto"
import {
  AnnotationPayloadError,
  assertAnnotationPayload,
  buildPatchPromptContext,
  resolvePayloadSources,
  validateSourceManifest,
} from "@web-annotation/node"
import { createTaskStore } from "./store"
import type { Task, TaskStore } from "./store"
import { buildMockPatchProposal } from "./mockPatch"
import { renderConsoleHtml } from "./console"

export interface PlatformServerOptions {
  /** Inject a custom store (e.g. for tests or a future persistent backend). */
  store?: TaskStore
  /** Max accepted HTTP JSON body size in bytes. Default: 1 MiB. */
  maxBodyBytes?: number
}

export interface PlatformServer {
  server: Server
  store: TaskStore
}

export interface PlatformRequest {
  method?: string
  path: string
  body?: unknown
}

export interface PlatformResponse {
  status: number
  body: unknown
  /** Response content type. Defaults to JSON; set to text/html for the console page. */
  contentType?: string
}

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  res.end(JSON.stringify(body))
}

class HttpRequestError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "HttpRequestError"
    this.status = status
  }
}

function readJsonBody(req: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = ""
    let received = 0
    let settled = false

    req.on("data", (chunk) => {
      if (settled) return
      const part = typeof chunk === "string" ? chunk : chunk.toString("utf8")
      received += Buffer.byteLength(part)
      if (received > maxBodyBytes) {
        settled = true
        req.pause()
        reject(new HttpRequestError(413, "request body too large"))
        return
      }
      raw += part
    })
    req.on("end", () => {
      if (settled) return
      settled = true
      const trimmed = raw.trim()
      if (trimmed === "") {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(trimmed))
      } catch {
        reject(new HttpRequestError(400, "request body is not valid JSON"))
      }
    })
    req.on("error", (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}

function createAnnotationTask(body: unknown, store: TaskStore): PlatformResponse {
  // The body is either a bare payload, or `{ payload, manifest }`.
  let rawPayload: unknown = body
  let rawManifest: unknown
  if (isObject(body) && "payload" in body) {
    rawPayload = body.payload
    rawManifest = body.manifest
  }

  let manifest
  if (rawManifest !== undefined) {
    const result = validateSourceManifest(rawManifest)
    if (!result.ok) {
      return { status: 400, body: { error: "invalid manifest", issues: result.issues } }
    }
    manifest = result.manifest
  }

  let payload
  try {
    payload = assertAnnotationPayload(rawPayload)
  } catch (error) {
    if (error instanceof AnnotationPayloadError) {
      return { status: 400, body: { error: "invalid payload", issues: error.issues } }
    }
    throw error
  }

  const resolved = manifest ? resolvePayloadSources(payload, manifest) : payload
  const task: Task = {
    id: `task_${randomUUID()}`,
    status: "received",
    createdAt: new Date().toISOString(),
    payload: resolved,
    promptContext: buildPatchPromptContext(resolved),
  }
  store.add(task)
  return { status: 201, body: { taskId: task.id, status: task.status } }
}

function proposeMockPatch(id: string, store: TaskStore): PlatformResponse {
  const task = store.get(id)
  if (!task) {
    return { status: 404, body: { error: "task not found", id } }
  }
  // Idempotent: an existing proposal is returned as-is, never regenerated.
  if (task.patchProposal) {
    return {
      status: 200,
      body: { taskId: task.id, status: task.status, patchProposal: task.patchProposal },
    }
  }

  const patchProposal = buildMockPatchProposal(task, new Date().toISOString())
  const updated: Task = { ...task, status: "patch_proposed", patchProposal }
  store.add(updated)
  return {
    status: 201,
    body: { taskId: updated.id, status: updated.status, patchProposal },
  }
}

export async function handlePlatformRequest(
  input: PlatformRequest,
  store: TaskStore,
): Promise<PlatformResponse> {
  const method = input.method ?? "GET"
  const path = input.path

  if (method === "GET" && (path === "/" || path === "/console")) {
    return { status: 200, contentType: "text/html; charset=utf-8", body: renderConsoleHtml() }
  }
  if (method === "GET" && path === "/health") {
    return { status: 200, body: { ok: true } }
  }
  if (method === "POST" && path === "/api/annotations") {
    return createAnnotationTask(input.body, store)
  }
  if (method === "GET" && path === "/api/tasks") {
    return { status: 200, body: { tasks: store.list() } }
  }
  if (method === "POST" && path.startsWith("/api/tasks/") && path.endsWith("/mock-patch")) {
    const id = decodeURIComponent(
      path.slice("/api/tasks/".length, path.length - "/mock-patch".length),
    )
    return proposeMockPatch(id, store)
  }
  if (method === "GET" && path.startsWith("/api/tasks/")) {
    const id = decodeURIComponent(path.slice("/api/tasks/".length))
    const task = store.get(id)
    if (!task) {
      return { status: 404, body: { error: "task not found", id } }
    }
    return { status: 200, body: { task } }
  }

  return { status: 404, body: { error: "not found" } }
}

async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  store: TaskStore,
  maxBodyBytes: number,
): Promise<void> {
  const method = req.method ?? "GET"
  const path = new URL(req.url ?? "/", "http://localhost").pathname
  let body: unknown

  if (method === "POST") {
    try {
      body = await readJsonBody(req, maxBodyBytes)
    } catch (error) {
      if (error instanceof HttpRequestError) {
        sendJson(res, error.status, { error: error.message })
        return
      }
      throw error
    }
  }

  const response = await handlePlatformRequest({ method, path, body }, store)
  const contentType = response.contentType ?? "application/json; charset=utf-8"
  res.writeHead(response.status, { "content-type": contentType })
  res.end(
    contentType.startsWith("application/json")
      ? JSON.stringify(response.body)
      : String(response.body),
  )
}

/**
 * Create the platform ingest HTTP server. The returned `server` is a standard
 * `http.Server` (call `.listen()`); `store` exposes the in-memory tasks. No port
 * is bound until the caller listens, which keeps it easy to test on port `0`.
 */
export function createPlatformServer(options: PlatformServerOptions = {}): PlatformServer {
  const store = options.store ?? createTaskStore()
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const server = createServer((req, res) => {
    handleHttpRequest(req, res, store, maxBodyBytes).catch((error) => {
      console.error("[platform-starter] request failed", error)
      if (!res.headersSent) {
        sendJson(res, 500, { error: "internal server error" })
      }
    })
  })
  return { server, store }
}
