import { describe, expect, it } from "vitest"
import { validatePatchProviderResult } from "../src/index"

describe("validatePatchProviderResult", () => {
  it("accepts a valid provider result and trims top-level string fields", () => {
    const result = validatePatchProviderResult({
      summary: "  Update submit copy  ",
      suggestedFiles: [" src/App.tsx ", "src/Button.tsx"],
      diffPreview: "  --- a/src/App.tsx\n+++ b/src/App.tsx\n@@\n-a\n+b  ",
      metadata: { provider: "test" },
    })

    expect(result).toEqual({
      summary: "Update submit copy",
      suggestedFiles: ["src/App.tsx", "src/Button.tsx"],
      diffPreview: "--- a/src/App.tsx\n+++ b/src/App.tsx\n@@\n-a\n+b",
      metadata: { provider: "test" },
    })
  })

  it("rejects non-object provider results", () => {
    expect(() => validatePatchProviderResult(null)).toThrow(
      "patch provider response is invalid: response must be an object",
    )
  })

  it("rejects empty summary", () => {
    expect(() =>
      validatePatchProviderResult({
        summary: " ",
        suggestedFiles: ["src/App.tsx"],
        diffPreview: "--- a/src/App.tsx\n+++ b/src/App.tsx",
      }),
    ).toThrow("patch provider response is invalid: summary must not be empty")
  })

  it("rejects empty suggestedFiles", () => {
    expect(() =>
      validatePatchProviderResult({
        summary: "Update submit copy",
        suggestedFiles: [],
        diffPreview: "--- a/src/App.tsx\n+++ b/src/App.tsx",
      }),
    ).toThrow("patch provider response is invalid: suggestedFiles must not be empty")
  })

  it("rejects non-string or empty suggestedFiles entries", () => {
    expect(() =>
      validatePatchProviderResult({
        summary: "Update submit copy",
        suggestedFiles: [" "],
        diffPreview: "--- a/src/App.tsx\n+++ b/src/App.tsx",
      }),
    ).toThrow("patch provider response is invalid: suggestedFiles must contain non-empty strings")
    expect(() =>
      validatePatchProviderResult({
        summary: "Update submit copy",
        suggestedFiles: ["src/App.tsx", 42],
        diffPreview: "--- a/src/App.tsx\n+++ b/src/App.tsx",
      }),
    ).toThrow("patch provider response is invalid: suggestedFiles must contain non-empty strings")
  })

  it("rejects empty diffPreview and array metadata", () => {
    expect(() =>
      validatePatchProviderResult({
        summary: "Update submit copy",
        suggestedFiles: ["src/App.tsx"],
        diffPreview: " ",
      }),
    ).toThrow("patch provider response is invalid: diffPreview must not be empty")
    expect(() =>
      validatePatchProviderResult({
        summary: "Update submit copy",
        suggestedFiles: ["src/App.tsx"],
        diffPreview: "--- a/src/App.tsx\n+++ b/src/App.tsx",
        metadata: [],
      }),
    ).toThrow("patch provider response is invalid: metadata must be an object")
  })
})
