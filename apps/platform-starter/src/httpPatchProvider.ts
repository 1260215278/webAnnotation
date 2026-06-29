import { validatePatchProviderResult } from "./patchProvider"
import type { PatchProvider, PatchProviderInput } from "./patchProvider"

export interface HttpPatchProviderOptions {
  endpoint: string
  getAuthToken?: () => string | Promise<string>
  headers?: Record<string, string>
  fetch?: typeof fetch
  timeoutMs?: number
}

function sanitize(text: string, token: string | undefined): string {
  const redacted = token ? text.split(token).join("[redacted]") : text
  return redacted.length > 1000 ? `${redacted.slice(0, 1000)}...` : redacted
}

function buildBody(input: PatchProviderInput): string {
  return JSON.stringify({
    taskId: input.task.id,
    task: input.task,
    promptContext: input.promptContext,
    sourceContext: input.sourceContext,
  })
}

export function createHttpPatchProvider(options: HttpPatchProviderOptions): PatchProvider {
  const endpoint = options.endpoint.trim()
  if (!endpoint) {
    throw new Error("patch provider endpoint is required")
  }
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (!fetchImpl) {
    throw new Error("patch provider fetch implementation is required")
  }

  return {
    async generatePatch(input) {
      const token = options.getAuthToken ? await options.getAuthToken() : undefined
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...options.headers,
      }
      if (token) {
        headers.authorization = `Bearer ${token}`
      }

      const controller = options.timeoutMs ? new AbortController() : undefined
      const timeout = controller
        ? setTimeout(() => controller.abort(), options.timeoutMs)
        : undefined
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers,
          body: buildBody(input),
          signal: controller?.signal,
        })

        if (!response.ok) {
          const text = sanitize(await response.text(), token)
          throw new Error(`patch provider request failed with status ${response.status}: ${text}`)
        }

        let json: unknown
        try {
          json = await response.json()
        } catch {
          throw new Error("patch provider response is not valid JSON")
        }
        return validatePatchProviderResult(json)
      } finally {
        if (timeout) clearTimeout(timeout)
      }
    },
  }
}
