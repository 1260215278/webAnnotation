import type { AnnotationPayload, AnnotatorOptions } from "./types"

async function submitViaEndpoint(
  endpoint: string,
  payload: AnnotationPayload,
  getAuthToken: AnnotatorOptions["getAuthToken"],
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  if (getAuthToken) {
    const token = await getAuthToken()
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`[web-annotation] submit failed with status ${response.status}`)
  }
}

/**
 * Submit a payload using the configured strategy.
 * `submitAnnotation` takes precedence over `endpoint`. If neither is set, throws.
 */
export async function submitPayload(
  options: AnnotatorOptions,
  payload: AnnotationPayload,
): Promise<void> {
  if (options.submitAnnotation) {
    await options.submitAnnotation(payload)
    return
  }

  if (options.endpoint) {
    await submitViaEndpoint(options.endpoint, payload, options.getAuthToken)
    return
  }

  throw new Error(
    "[web-annotation] no submission strategy: provide either `endpoint` or `submitAnnotation`",
  )
}
