import { describe, expect, it } from "vitest"
import type { AnnotationImageAttachment } from "@web-annotation/core"
import {
  AnnotationPayloadError,
  assertAnnotationPayload,
  validateAnnotationPayload,
  validateSourceManifest,
} from "../src/index"
import { makeImageAttachment, makeManifest, makeSourcePayload } from "./fixtures"

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

describe("validateAnnotationPayload (image attachments)", () => {
  it("accepts a payload whose annotation carries a valid image attachment", () => {
    const payload = makeSourcePayload()
    payload.annotations[0].attachments = [makeImageAttachment()]
    const result = validateAnnotationPayload(payload)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payload.annotations[0].attachments?.[0].storage.url).toBe(
        "https://cdn.example.com/uploads/att_1.png",
      )
    }
  })

  it("accepts an annotation without attachments (backward compatible)", () => {
    const result = validateAnnotationPayload(makeSourcePayload())
    expect(result.ok).toBe(true)
  })

  it("rejects an attachments value that is not an array", () => {
    const payload = makeSourcePayload()
    // @ts-expect-error wrong attachments type on purpose
    payload.annotations[0].attachments = { kind: "image" }
    const result = validateAnnotationPayload(payload)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "annotations[0].attachments",
        message: "expected array or undefined, got object",
      })
    }
  })

  it("rejects a non-image attachment kind", () => {
    const payload = makeSourcePayload()
    payload.annotations[0].attachments = [
      { ...makeImageAttachment(), kind: "video" } as unknown as AnnotationImageAttachment,
    ]
    const result = validateAnnotationPayload(payload)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "annotations[0].attachments[0].kind",
        message: 'expected "image", got string',
      })
    }
  })

  it("rejects an unsupported mime type", () => {
    const payload = makeSourcePayload()
    payload.annotations[0].attachments = [{ ...makeImageAttachment(), mimeType: "image/svg+xml" }]
    const result = validateAnnotationPayload(payload)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "annotations[0].attachments[0].mimeType",
        message: 'unsupported image type "image/svg+xml"',
      })
    }
  })

  it("rejects a non-positive-integer size", () => {
    const payload = makeSourcePayload()
    payload.annotations[0].attachments = [{ ...makeImageAttachment(), size: 0 }]
    const result = validateAnnotationPayload(payload)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "annotations[0].attachments[0].size",
        message: "expected positive integer, got number",
      })
    }
  })

  it("rejects an empty url string", () => {
    const payload = makeSourcePayload()
    payload.annotations[0].attachments = [
      { ...makeImageAttachment(), storage: { provider: "server", url: "", objectKey: "k.png" } },
    ]
    const result = validateAnnotationPayload(payload)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "annotations[0].attachments[0].storage.url",
        message: "must not be empty",
      })
    }
  })

  it("rejects storage that references neither url nor objectKey", () => {
    const payload = makeSourcePayload()
    payload.annotations[0].attachments = [
      { ...makeImageAttachment(), storage: { provider: "oss" } },
    ]
    const result = validateAnnotationPayload(payload)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "annotations[0].attachments[0].storage",
        message: "must reference an uploaded image via a non-empty url or objectKey",
      })
    }
  })

  it("rejects an invalid storage provider", () => {
    const payload = makeSourcePayload()
    payload.annotations[0].attachments = [
      {
        ...makeImageAttachment(),
        storage: { provider: "ftp", url: "https://x/y.png" },
      } as unknown as AnnotationImageAttachment,
    ]
    const result = validateAnnotationPayload(payload)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "annotations[0].attachments[0].storage.provider",
        message: 'expected "server" | "oss" | "custom", got string',
      })
    }
  })

  it("rejects raw image content smuggled into the attachment", () => {
    const payload = makeSourcePayload()
    payload.annotations[0].attachments = [
      { ...makeImageAttachment(), base64: "ZGF0YQ==" } as unknown as AnnotationImageAttachment,
    ]
    const result = validateAnnotationPayload(payload)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "annotations[0].attachments[0].base64",
        message: "raw image content must not be carried in the payload",
      })
    }
  })

  it("rejects raw image content smuggled into nested metadata", () => {
    const payload = makeSourcePayload()
    payload.annotations[0].attachments = [
      { ...makeImageAttachment(), metadata: { data: "ZGF0YQ==" } },
    ]
    const result = validateAnnotationPayload(payload)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "annotations[0].attachments[0].metadata.data",
        message: "raw image content must not be carried in the payload",
      })
    }
  })

  it("rejects a data: URL that inlines raw bytes in storage.url", () => {
    const payload = makeSourcePayload()
    payload.annotations[0].attachments = [
      {
        ...makeImageAttachment(),
        storage: { provider: "server", url: "data:image/png;base64,ZGF0YQ==" },
      },
    ]
    const result = validateAnnotationPayload(payload)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "annotations[0].attachments[0].storage.url",
        message: "must not be a data: URL carrying raw image content",
      })
    }
  })

  it("rejects a missing storage reference", () => {
    const payload = makeSourcePayload()
    const att = makeImageAttachment()
    payload.annotations[0].attachments = [
      { id: att.id, kind: att.kind, name: att.name, mimeType: att.mimeType, size: att.size } as
        unknown as AnnotationImageAttachment,
    ]
    const result = validateAnnotationPayload(payload)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual({
        path: "annotations[0].attachments[0].storage",
        message: "missing required field",
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
