import { describe, expect, it } from "vitest"
import {
  AnnotationPayloadError,
  assertAnnotationPayload,
  validateAnnotationPayload,
  validateSourceManifest,
} from "../src/index"
import { makeManifest, makeSourcePayload } from "./fixtures"

describe("validateAnnotationPayload", () => {
  it("accepts a fully valid payload", () => {
    const result = validateAnnotationPayload(makeSourcePayload())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.annotations[0].target.source?.file).toBe("src/App.tsx")
    }
  })

  it("rejects non-objects with a readable issue", () => {
    const result = validateAnnotationPayload(null)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toEqual([{ path: "", message: "expected object, got null" }])
    }
  })

  it("reports missing version/project/page/annotations as separate issues", () => {
    const result = validateAnnotationPayload({})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const paths = result.issues.map((issue) => issue.path)
      expect(paths).toContain("version")
      expect(paths).toContain("project")
      expect(paths).toContain("page")
      expect(paths).toContain("annotationGroup")
      expect(paths).toContain("annotations")
    }
  })

  it("points at the exact invalid nested field", () => {
    const payload = makeSourcePayload()
    // @ts-expect-error intentionally break a nested field for the test
    payload.annotations[0].target.rect.width = "wide"
    const result = validateAnnotationPayload(payload)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "annotations[0].target.rect.width",
        message: "expected finite number, got string",
      })
    }
  })

  it("requires source line and column to be positive integers when present", () => {
    const payload = makeSourcePayload()
    payload.annotations[0].target.source!.line = 0
    payload.annotations[0].target.source!.column = 1.5

    const result = validateAnnotationPayload(payload)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "annotations[0].target.source.line",
        message: "expected positive integer or undefined, got number",
      })
      expect(result.issues).toContainEqual({
        path: "annotations[0].target.source.column",
        message: "expected positive integer or undefined, got number",
      })
    }
  })

  it("rejects an unknown version", () => {
    const payload = makeSourcePayload()
    // @ts-expect-error wrong version on purpose
    payload.version = "v2"
    const result = validateAnnotationPayload(payload)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "version",
        message: 'expected "v1", got string',
      })
    }
  })
})

describe("assertAnnotationPayload", () => {
  it("returns the payload when valid", () => {
    const payload = assertAnnotationPayload(makeSourcePayload())
    expect(payload.version).toBe("v1")
  })

  it("throws AnnotationPayloadError carrying issues when invalid", () => {
    try {
      assertAnnotationPayload({})
      throw new Error("should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(AnnotationPayloadError)
      const typed = error as AnnotationPayloadError
      expect(typed.issues.length).toBeGreaterThan(0)
      expect(typed.message).toContain("Invalid AnnotationPayload")
    }
  })
})

describe("validateSourceManifest", () => {
  it("accepts a valid manifest", () => {
    const result = validateSourceManifest(makeManifest())
    expect(result.ok).toBe(true)
  })

  it("rejects entries whose sourceId does not match the key", () => {
    const manifest = makeManifest()
    manifest.s_19cu8m6.sourceId = "s_other"
    const result = validateSourceManifest(manifest)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: '["s_19cu8m6"].sourceId',
        message: 'sourceId "s_other" does not match manifest key "s_19cu8m6"',
      })
    }
  })

  it("rejects entries missing required fields", () => {
    const result = validateSourceManifest({ s_1: { sourceId: "s_1" } })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const paths = result.issues.map((issue) => issue.path)
      expect(paths).toContain('["s_1"].file')
      expect(paths).toContain('["s_1"].line')
      expect(paths).toContain('["s_1"].framework')
    }
  })

  it("requires manifest line and column to be positive integers", () => {
    const manifest = makeManifest()
    manifest.s_19cu8m6.line = -1
    manifest.s_19cu8m6.column = 2.25

    const result = validateSourceManifest(manifest)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: '["s_19cu8m6"].line',
        message: "expected positive integer, got number",
      })
      expect(result.issues).toContainEqual({
        path: '["s_19cu8m6"].column',
        message: "expected positive integer, got number",
      })
    }
  })
})
