import { afterEach, describe, expect, it, vi } from "vitest"
import { submitPayload } from "../src/submit"
import type { AnnotationPayload, AnnotatorOptions } from "../src/types"

const payload: AnnotationPayload = {
  version: "v1",
  project: { projectId: "p" },
  page: {
    url: "https://x/",
    route: "/",
    title: "x",
    viewport: { width: 1, height: 1 },
  },
  annotationGroup: { id: "group_1", mode: "single" },
  annotations: [],
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("submitPayload priority", () => {
  it("prefers submitAnnotation over endpoint", async () => {
    const custom = vi.fn().mockResolvedValue(undefined)
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    const options: AnnotatorOptions = {
      projectId: "p",
      endpoint: "https://api.example.com/annotations",
      submitAnnotation: custom,
    }

    await submitPayload(options, payload)

    expect(custom).toHaveBeenCalledWith(payload)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("falls back to endpoint and attaches the bearer token", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal("fetch", fetchSpy)

    const options: AnnotatorOptions = {
      projectId: "p",
      endpoint: "https://api.example.com/annotations",
      getAuthToken: () => "short-lived-token",
    }

    await submitPayload(options, payload)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.example.com/annotations")
    expect(init.method).toBe("POST")
    const headers = init.headers as Record<string, string>
    expect(headers["Authorization"]).toBe("Bearer short-lived-token")
    expect(headers["Content-Type"]).toBe("application/json")
    expect(init.body).toBe(JSON.stringify(payload))
  })

  it("throws on a non-ok endpoint response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    await expect(
      submitPayload({ projectId: "p", endpoint: "https://api.example.com/x" }, payload),
    ).rejects.toThrow(/status 500/)
  })

  it("throws when no submission strategy is configured", async () => {
    await expect(submitPayload({ projectId: "p" }, payload)).rejects.toThrow(
      /no submission strategy/,
    )
  })
})
