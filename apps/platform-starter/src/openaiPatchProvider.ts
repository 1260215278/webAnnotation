import type { PatchPromptContext } from "@web-annotation/node"
import { validatePatchProviderResult } from "./patchProvider"
import type { PatchProvider, PatchProviderInput } from "./patchProvider"

/**
 * Options for an OpenAI-compatible chat-completions patch provider. `endpoint`
 * and `model` are required and never guessed. The API key is optional and is only
 * ever sent to the configured endpoint as a bearer token — never exposed to the
 * browser SDK or logged.
 */
export interface OpenAICompatiblePatchProviderOptions {
  /** Full chat-completions URL, e.g. https://api.openai.com/v1/chat/completions. */
  endpoint: string
  /** Model id, e.g. "gpt-4o-mini". Required; no default is assumed. */
  model: string
  /** Static API key. Prefer `getApiKey` for short-lived keys. */
  apiKey?: string
  /** Resolve an API key at call time. Takes precedence over `apiKey`. */
  getApiKey?: () => string | Promise<string>
  /** Extra request headers. */
  headers?: Record<string, string>
  /** Injectable fetch for tests. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch
  /** Optional request timeout in milliseconds. */
  timeoutMs?: number
  /** Optional sampling temperature; only sent when provided. */
  temperature?: number
}

const SYSTEM_PROMPT =
  "You are a code-patch assistant for the webAnnotation toolkit. Given annotation " +
  "context, propose a minimal patch. Respond ONLY with a single JSON object of the " +
  'shape { "summary": string, "suggestedFiles": string[], "diffPreview": string, ' +
  '"metadata"?: object }. Do not include any text outside the JSON.'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown model provider error"
}

function sanitize(text: string, secret: string | undefined): string {
  const redacted = secret ? text.split(secret).join("[redacted]") : text
  return redacted.length > 1000 ? `${redacted.slice(0, 1000)}...` : redacted
}

interface ImageAttachmentDigest {
  annotationId: string
  id: string
  name: string
  mimeType: string
  size: number
  width?: number
  height?: number
  storage: { provider: string; url?: string; objectKey?: string }
}

/** Flatten the image-attachment summaries already present in the prompt context. */
function collectImageAttachments(promptContext: PatchPromptContext): ImageAttachmentDigest[] {
  const digests: ImageAttachmentDigest[] = []
  for (const annotation of promptContext.annotations) {
    if (!annotation.attachments) continue
    for (const attachment of annotation.attachments) {
      digests.push({ annotationId: annotation.id, ...attachment })
    }
  }
  return digests
}

function buildUserContent(input: PatchProviderInput): string {
  return JSON.stringify({
    task: { id: input.task.id, status: input.task.status },
    promptContext: input.promptContext,
    sourceContext: input.sourceContext,
    imageAttachments: collectImageAttachments(input.promptContext),
  })
}

function buildRequestBody(
  input: PatchProviderInput,
  model: string,
  temperature: number | undefined,
): string {
  const body: {
    model: string
    messages: Array<{ role: string; content: string }>
    response_format: { type: string }
    temperature?: number
  } = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserContent(input) },
    ],
    response_format: { type: "json_object" },
  }
  if (temperature !== undefined) body.temperature = temperature
  return JSON.stringify(body)
}

/** Extract the assistant message content from an OpenAI-compatible response. */
function extractMessageContent(json: unknown): string {
  if (!isObject(json)) {
    throw new Error("model patch provider response must be an object")
  }
  const choices = json.choices
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("model patch provider response has no choices")
  }
  const first = choices[0]
  if (!isObject(first) || !isObject(first.message)) {
    throw new Error("model patch provider response is missing a message")
  }
  const content = first.message.content
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("model patch provider response is missing message content")
  }
  return content
}

/**
 * Create a patch provider backed by an OpenAI-compatible chat-completions API. It
 * uses an injectable fetch (no real SDK), requires an explicit endpoint and model,
 * sends the task / prompt context / source context / image-attachment digest as a
 * JSON user message, and only accepts the declared JSON result shape, validated by
 * `validatePatchProviderResult`. Errors are sanitized so the API key never leaks.
 */
export function createOpenAICompatiblePatchProvider(
  options: OpenAICompatiblePatchProviderOptions,
): PatchProvider {
  const endpoint = options.endpoint.trim()
  if (!endpoint) {
    throw new Error("model patch provider endpoint is required")
  }
  const model = options.model.trim()
  if (!model) {
    throw new Error("model patch provider model is required")
  }
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (!fetchImpl) {
    throw new Error("model patch provider fetch implementation is required")
  }
  const resolveApiKey =
    options.getApiKey ?? (options.apiKey ? () => options.apiKey as string : undefined)

  return {
    async generatePatch(input) {
      const apiKey = resolveApiKey ? await resolveApiKey() : undefined
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...options.headers,
      }
      if (apiKey) {
        headers.authorization = `Bearer ${apiKey}`
      }

      const controller = options.timeoutMs ? new AbortController() : undefined
      const timeout = controller
        ? setTimeout(() => controller.abort(), options.timeoutMs)
        : undefined
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers,
          body: buildRequestBody(input, model, options.temperature),
          signal: controller?.signal,
        })

        if (!response.ok) {
          const text = sanitize(await response.text(), apiKey)
          throw new Error(
            `model patch provider request failed with status ${response.status}: ${text}`,
          )
        }

        let json: unknown
        try {
          json = await response.json()
        } catch {
          throw new Error("model patch provider response is not valid JSON")
        }

        const content = extractMessageContent(json)
        let parsed: unknown
        try {
          parsed = JSON.parse(content)
        } catch {
          throw new Error("model patch provider returned non-JSON content")
        }

        try {
          return validatePatchProviderResult(parsed)
        } catch (error) {
          throw new Error(`model patch provider result is invalid: ${errorMessage(error)}`)
        }
      } finally {
        if (timeout) clearTimeout(timeout)
      }
    },
  }
}
