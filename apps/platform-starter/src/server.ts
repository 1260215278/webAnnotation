import { createServer } from "node:http"
import type { IncomingMessage, Server, ServerResponse } from "node:http"
import { randomUUID } from "node:crypto"
import {
  AnnotationPayloadError,
  assertAnnotationPayload,
  buildPatchPromptContext,
  collectRepoSourceContext,
  resolvePayloadSources,
  validateSourceManifest,
  validateUnifiedDiffTargetFiles,
} from "@web-annotation/node"
import type { RepoSourceContextOptions } from "@web-annotation/node"
import { DEFAULT_MAX_IMAGE_BYTES } from "@web-annotation/core"
import { createTaskStore } from "./store"
import type { Task, TaskStore } from "./store"
import { validateImageUpload } from "./imageStorage"
import type { ImageStorageProvider } from "./imageStorage"
import { buildMockPatchProposal } from "./mockPatch"
import {
  buildPatchProviderInput,
  buildProviderPatchProposal,
  validatePatchProviderResult,
} from "./patchProvider"
import type { PatchProvider, PatchProviderResult } from "./patchProvider"
import {
  PATCH_REVIEW_DECISIONS,
  buildPatchReview,
  isPatchReviewDecision,
  taskStatusForDecision,
} from "./patchReview"
import type { PatchReviewInput } from "./patchReview"
import { buildPatchArtifact } from "./patchArtifact"
import { createGitHeadCommitReader } from "./repoMetadata"
import type { RepoHeadCommitReader } from "./repoMetadata"
import { renderConsoleHtml } from "./console"

export interface PlatformSourceContextOptions {
  contextLines?: RepoSourceContextOptions["contextLines"]
  maxFiles?: RepoSourceContextOptions["maxFiles"]
  maxBytesPerFile?: RepoSourceContextOptions["maxBytesPerFile"]
}

export interface PlatformRuntimeOptions {
  /** Absolute path to the repository root used for source-context collection. */
  repoRoot?: string
  /** Optional limits for repository source-context collection. */
  sourceContext?: PlatformSourceContextOptions
  /** Optional AI/provider integration hook. The starter never calls a model by default. */
  patchProvider?: PatchProvider
  /**
   * Read-only adapter that resolves the repository HEAD commit when `repoRoot` is
   * set. `createPlatformServer` defaults this to a read-only git reader; tests
   * inject a fake reader so unit tests never depend on real git.
   */
  readRepoHeadCommit?: RepoHeadCommitReader
  /**
   * Pluggable image storage for `POST /api/uploads/images`. The host can back it
   * with a real object store (e.g. OSS) without exposing secrets to the browser.
   * When absent, the upload endpoint returns `409`.
   */
  imageStorageProvider?: ImageStorageProvider
  /** Max decoded image size in bytes for uploads. Default: 5 MiB. */
  maxImageBytes?: number
}

export interface PlatformServerOptions extends PlatformRuntimeOptions {
  /** Inject a custom store (e.g. for tests or a future persistent backend). */
  store?: TaskStore
  /** Max accepted HTTP JSON body size in bytes for non-upload routes. Default: 1 MiB. */
  maxBodyBytes?: number
  /** Max accepted HTTP body size in bytes for the image upload route. Default: 8 MiB. */
  maxUploadBytes?: number
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
const DEFAULT_MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const IMAGE_UPLOAD_PATH = "/api/uploads/images"

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

async function handleImageUpload(
  body: unknown,
  options: PlatformRuntimeOptions,
): Promise<PlatformResponse> {
  const provider = options.imageStorageProvider
  if (!provider) {
    return { status: 409, body: { error: "image storage is not configured" } }
  }
  const maxImageBytes = options.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES
  const validation = validateImageUpload(body, maxImageBytes)
  if (!validation.ok) {
    return { status: validation.status, body: { error: validation.error } }
  }
  const attachment = await provider.store(validation.input)
  return { status: 201, body: { attachment } }
}

async function serveUploadedImage(
  path: string,
  options: PlatformRuntimeOptions,
): Promise<PlatformResponse> {
  const provider = options.imageStorageProvider
  if (!provider || !provider.retrieve) {
    return { status: 404, body: { error: "not found" } }
  }
  const objectKey = decodeURIComponent(path.slice(`${IMAGE_UPLOAD_PATH}/`.length))
  if (objectKey === "") {
    return { status: 404, body: { error: "not found" } }
  }
  const stored = await provider.retrieve(objectKey)
  if (!stored) {
    return { status: 404, body: { error: "image not found", objectKey } }
  }
  return { status: 200, contentType: stored.mimeType, body: stored.data }
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

function collectTaskSourceContext(
  id: string,
  store: TaskStore,
  options: PlatformRuntimeOptions = {},
): PlatformResponse {
  const task = store.get(id)
  if (!task) {
    return { status: 404, body: { error: "task not found", id } }
  }
  if (!options.repoRoot) {
    return { status: 409, body: { error: "repo root is not configured", id } }
  }

  const sourceContext = collectRepoSourceContext(task.promptContext, {
    rootDir: options.repoRoot,
    ...options.sourceContext,
  })
  const status = task.sourceContext ? 200 : 201
  const updated: Task = { ...task, sourceContext }
  store.add(updated)
  return { status, body: { taskId: updated.id, sourceContext } }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown provider error"
}

async function proposeProviderPatch(
  id: string,
  store: TaskStore,
  options: PlatformRuntimeOptions = {},
): Promise<PlatformResponse> {
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
  if (!options.patchProvider) {
    return { status: 409, body: { error: "patch provider is not configured", id } }
  }

  let rawResult: unknown
  try {
    rawResult = await options.patchProvider.generatePatch(buildPatchProviderInput(task))
  } catch (error) {
    return {
      status: 502,
      body: { error: "patch provider failed", message: errorMessage(error), id },
    }
  }

  let result: PatchProviderResult
  try {
    result = validatePatchProviderResult(rawResult)
  } catch (error) {
    return {
      status: 502,
      body: { error: "patch provider response is invalid", message: errorMessage(error), id },
    }
  }

  // Guard against a provider diff that touches files outside its suggestedFiles
  // (absolute paths, `..` traversal, or undeclared targets). Unsafe proposals are
  // rejected with a fixed readable error and never stored.
  const diffSafety = validateUnifiedDiffTargetFiles(result.diffPreview, result.suggestedFiles)
  if (!diffSafety.ok) {
    return {
      status: 422,
      body: { error: "patch provider returned an unsafe diff", issues: diffSafety.issues, id },
    }
  }

  const patchProposal = buildProviderPatchProposal(task, result, new Date().toISOString())
  const updated: Task = { ...task, status: "patch_proposed", patchProposal }
  store.add(updated)
  return {
    status: 201,
    body: { taskId: updated.id, status: updated.status, patchProposal },
  }
}

function reviewPatchProposal(
  id: string,
  body: unknown,
  store: TaskStore,
  decidedAt: string,
): PlatformResponse {
  const task = store.get(id)
  if (!task) {
    return { status: 404, body: { error: "task not found", id } }
  }
  if (!task.patchProposal) {
    return { status: 409, body: { error: "patch proposal does not exist", id } }
  }

  const decision = isObject(body) ? body.decision : undefined
  if (!isPatchReviewDecision(decision)) {
    return { status: 400, body: { error: "invalid decision", allowed: PATCH_REVIEW_DECISIONS, id } }
  }

  const input: PatchReviewInput = { decision }
  const reviewer = isObject(body) ? body.reviewer : undefined
  if (typeof reviewer === "string" && reviewer.trim() !== "") input.reviewer = reviewer.trim()
  const note = isObject(body) ? body.note : undefined
  if (typeof note === "string" && note.trim() !== "") input.note = note.trim()

  // A repeat review overrides the previous decision; the latest decision wins.
  const patchReview = buildPatchReview(input, decidedAt)
  const updated: Task = { ...task, status: taskStatusForDecision(decision), patchReview }
  store.add(updated)
  return { status: 200, body: { taskId: updated.id, status: updated.status, patchReview } }
}

async function exportPatchArtifact(
  id: string,
  store: TaskStore,
  exportedAt: string,
  options: PlatformRuntimeOptions = {},
): Promise<PlatformResponse> {
  const task = store.get(id)
  if (!task) {
    return { status: 404, body: { error: "task not found", id } }
  }
  if (!task.patchProposal) {
    return { status: 409, body: { error: "patch proposal does not exist", id } }
  }

  // Only resolve a base commit when repoRoot is configured. Without repoRoot the
  // export succeeds and never adds project.commit.
  let commit: string | undefined
  if (options.repoRoot) {
    const readRepoHeadCommit = options.readRepoHeadCommit ?? createGitHeadCommitReader()
    let resolved: string
    try {
      resolved = await readRepoHeadCommit(options.repoRoot)
    } catch {
      return { status: 409, body: { error: "failed to read repo head commit", id } }
    }
    const trimmed = typeof resolved === "string" ? resolved.trim() : ""
    if (trimmed === "") {
      // Never export a fake/empty commit; fail loudly instead.
      return { status: 409, body: { error: "failed to read repo head commit", id } }
    }
    commit = trimmed
  }

  return { status: 200, body: { artifact: buildPatchArtifact(task, exportedAt, commit) } }
}

export async function handlePlatformRequest(
  input: PlatformRequest,
  store: TaskStore,
  options: PlatformRuntimeOptions = {},
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
  if (method === "POST" && path === IMAGE_UPLOAD_PATH) {
    return handleImageUpload(input.body, options)
  }
  if (method === "GET" && path.startsWith(`${IMAGE_UPLOAD_PATH}/`)) {
    return serveUploadedImage(path, options)
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
  if (method === "POST" && path.startsWith("/api/tasks/") && path.endsWith("/source-context")) {
    const id = decodeURIComponent(
      path.slice("/api/tasks/".length, path.length - "/source-context".length),
    )
    return collectTaskSourceContext(id, store, options)
  }
  if (method === "POST" && path.startsWith("/api/tasks/") && path.endsWith("/patch-review")) {
    const id = decodeURIComponent(
      path.slice("/api/tasks/".length, path.length - "/patch-review".length),
    )
    return reviewPatchProposal(id, input.body, store, new Date().toISOString())
  }
  if (method === "POST" && path.startsWith("/api/tasks/") && path.endsWith("/patch")) {
    const id = decodeURIComponent(path.slice("/api/tasks/".length, path.length - "/patch".length))
    return proposeProviderPatch(id, store, options)
  }
  if (method === "GET" && path.startsWith("/api/tasks/") && path.endsWith("/patch-artifact")) {
    const id = decodeURIComponent(
      path.slice("/api/tasks/".length, path.length - "/patch-artifact".length),
    )
    return exportPatchArtifact(id, store, new Date().toISOString(), options)
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
  maxUploadBytes: number,
  options: PlatformRuntimeOptions,
): Promise<void> {
  const method = req.method ?? "GET"
  const path = new URL(req.url ?? "/", "http://localhost").pathname
  let body: unknown

  if (method === "POST") {
    // The upload route accepts a larger base64 body; other routes keep the small cap.
    const cap = path === IMAGE_UPLOAD_PATH ? maxUploadBytes : maxBodyBytes
    try {
      body = await readJsonBody(req, cap)
    } catch (error) {
      if (error instanceof HttpRequestError) {
        sendJson(res, error.status, { error: error.message })
        return
      }
      throw error
    }
  }

  const response = await handlePlatformRequest({ method, path, body }, store, options)
  const contentType = response.contentType ?? "application/json; charset=utf-8"
  res.writeHead(response.status, { "content-type": contentType })
  if (response.body instanceof Uint8Array) {
    res.end(Buffer.from(response.body))
  } else if (contentType.startsWith("application/json")) {
    res.end(JSON.stringify(response.body))
  } else {
    res.end(String(response.body))
  }
}

/**
 * Create the platform ingest HTTP server. The returned `server` is a standard
 * `http.Server` (call `.listen()`); `store` exposes the in-memory tasks. No port
 * is bound until the caller listens, which keeps it easy to test on port `0`.
 */
export function createPlatformServer(options: PlatformServerOptions = {}): PlatformServer {
  const store = options.store ?? createTaskStore()
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const maxUploadBytes = options.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES
  const runtimeOptions: PlatformRuntimeOptions = {
    repoRoot: options.repoRoot,
    sourceContext: options.sourceContext,
    patchProvider: options.patchProvider,
    readRepoHeadCommit: options.readRepoHeadCommit ?? createGitHeadCommitReader(),
    imageStorageProvider: options.imageStorageProvider,
    maxImageBytes: options.maxImageBytes,
  }
  const server = createServer((req, res) => {
    handleHttpRequest(req, res, store, maxBodyBytes, maxUploadBytes, runtimeOptions).catch((error) => {
      console.error("[platform-starter] request failed", error)
      if (!res.headersSent) {
        sendJson(res, 500, { error: "internal server error" })
      }
    })
  })
  return { server, store }
}
