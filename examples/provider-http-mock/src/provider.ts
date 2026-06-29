import { createServer } from "node:http"
import type { IncomingMessage, Server, ServerResponse } from "node:http"
import type { PatchPromptAnnotation, PatchPromptContext } from "@web-annotation/node"
import type { PatchProviderResult } from "@web-annotation/platform-starter"

/**
 * The JSON body that `createHttpPatchProvider()` POSTs to a provider endpoint.
 * Only `promptContext` is needed to build a deterministic mock proposal.
 */
export interface MockProviderRequest {
  taskId: string
  task: unknown
  promptContext: PatchPromptContext
  sourceContext?: unknown
}

/**
 * Locator for an annotation: the real source file when available, otherwise a
 * stable mock file. The fallback is intentionally a repository-like path rather
 * than a CSS selector, so downstream CLI checks see a valid file target.
 */
function locatorFor(annotation: PatchPromptAnnotation): string {
  const sourceFile = annotation.source?.file?.trim()
  if (sourceFile) return sourceFile
  const safeId = annotation.id.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  return `mock-unmapped/${safeId || "annotation"}.md`
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

/** A deterministic, readable unified-diff hunk for one annotation. */
function hunkFor(annotation: PatchPromptAnnotation): string {
  const { source, target } = annotation
  const locator = locatorFor(annotation)
  const line = source?.line ?? 1
  const current = target.text
    ? `<${target.tagName}>${oneLine(target.text)}</${target.tagName}>`
    : `<${target.tagName} />`
  return [
    `--- a/${locator}`,
    `+++ b/${locator}`,
    `@@ -${line},1 +${line},1 @@`,
    `- {/* current: ${current} */}`,
    `+ {/* web-annotation: ${oneLine(annotation.message)} */}`,
  ].join("\n")
}

/**
 * Build a deterministic `PatchProviderResult` from a provider request. The diff
 * only ever targets the files listed in `suggestedFiles`, so it passes the
 * platform's diff-target safety check. This calls no AI and reads no files.
 */
export function buildMockProviderResult(request: MockProviderRequest): PatchProviderResult {
  const annotations = request.promptContext.annotations
  if (annotations.length === 0) {
    throw new Error("promptContext.annotations must include at least one annotation")
  }
  const suggestedFiles = [...new Set(annotations.map(locatorFor))]
  const diffPreview = annotations.map(hunkFor).join("\n\n")
  const summary = `Mock HTTP provider proposing ${annotations.length} change(s) across ${suggestedFiles.length} file(s).`

  return {
    summary,
    suggestedFiles,
    diffPreview,
    metadata: { provider: "example-http-mock", annotationCount: annotations.length },
  }
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = ""
    req.on("data", (chunk) => {
      raw += typeof chunk === "string" ? chunk : chunk.toString("utf8")
    })
    req.on("end", () => {
      try {
        resolve(raw.trim() === "" ? undefined : JSON.parse(raw))
      } catch {
        reject(new Error("request body is not valid JSON"))
      }
    })
    req.on("error", reject)
  })
}

/**
 * A minimal HTTP server that speaks the patch-provider protocol: it accepts the
 * request body from `createHttpPatchProvider()` and replies with a deterministic
 * `PatchProviderResult`. It uses no model SDK, makes no outbound network calls,
 * and reads no API keys — it exists to show how a third-party backend connects.
 */
export function createMockProviderServer(): Server {
  return createServer((req, res) => {
    void handle(req, res)
  })
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method not allowed" })
    return
  }
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "invalid request" })
    return
  }
  if (!isMockProviderRequest(body)) {
    sendJson(res, 400, { error: "request must include a promptContext with annotations" })
    return
  }
  try {
    sendJson(res, 200, buildMockProviderResult(body))
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "invalid provider request" })
  }
}

function isMockProviderRequest(value: unknown): value is MockProviderRequest {
  if (typeof value !== "object" || value === null) return false
  const promptContext = (value as { promptContext?: unknown }).promptContext
  if (typeof promptContext !== "object" || promptContext === null) return false
  return Array.isArray((promptContext as { annotations?: unknown }).annotations)
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  res.end(JSON.stringify(body))
}
