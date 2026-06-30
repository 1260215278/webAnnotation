import { describe, expect, it } from "vitest"
import {
  describePatchProviderStartup,
  resolvePatchProviderKind,
} from "../src/env"

const HTTP_URL = "https://http-provider.example.com/patch"
const MODEL_URL = "https://api.example.com/v1/chat/completions"

describe("resolvePatchProviderKind", () => {
  it("returns 'none' when no patch provider env var is set", () => {
    expect(resolvePatchProviderKind({})).toBe("none")
  })

  it("returns 'http' for the third-party HTTP provider URL", () => {
    expect(resolvePatchProviderKind({ WEB_ANNOTATION_PATCH_PROVIDER_URL: HTTP_URL })).toBe("http")
  })

  it("returns 'model' for the OpenAI-compatible model provider URL", () => {
    expect(resolvePatchProviderKind({ WEB_ANNOTATION_MODEL_PROVIDER_URL: MODEL_URL })).toBe("model")
  })

  it("ignores whitespace-only values", () => {
    expect(
      resolvePatchProviderKind({
        WEB_ANNOTATION_PATCH_PROVIDER_URL: "   ",
        WEB_ANNOTATION_MODEL_PROVIDER_URL: "  ",
      }),
    ).toBe("none")
  })

  it("throws when both the HTTP and model provider URLs are configured", () => {
    expect(() =>
      resolvePatchProviderKind({
        WEB_ANNOTATION_PATCH_PROVIDER_URL: HTTP_URL,
        WEB_ANNOTATION_MODEL_PROVIDER_URL: MODEL_URL,
      }),
    ).toThrow(/only one patch provider/)
  })
})

describe("describePatchProviderStartup", () => {
  it("distinguishes the three patch provider startup states", () => {
    expect(describePatchProviderStartup("none")).toBe("patch provider disabled")
    expect(describePatchProviderStartup("http")).toBe("external HTTP patch provider enabled")
    expect(describePatchProviderStartup("model")).toBe("model patch provider enabled")
  })
})
