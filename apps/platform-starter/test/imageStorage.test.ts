import { describe, expect, it } from "vitest"
import { createMemoryImageStorage, validateImageUpload } from "../src/imageStorage"

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])
const PNG_BASE64 = PNG_BYTES.toString("base64")

describe("validateImageUpload", () => {
  it("accepts a valid png upload and decodes its bytes", () => {
    const result = validateImageUpload(
      { name: "a.png", mimeType: "image/png", size: PNG_BYTES.length, data: PNG_BASE64 },
      5 * 1024 * 1024,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.input.mimeType).toBe("image/png")
      expect(result.input.size).toBe(PNG_BYTES.length)
      expect(result.input.data.length).toBe(PNG_BYTES.length)
    }
  })

  it("rejects an unsupported mime type", () => {
    const result = validateImageUpload(
      { name: "a.svg", mimeType: "image/svg+xml", data: PNG_BASE64 },
      1000,
    )
    expect(result).toEqual({ ok: false, status: 400, error: "unsupported image type" })
  })

  it("rejects invalid base64", () => {
    const result = validateImageUpload(
      { name: "a.png", mimeType: "image/png", data: "***not base64***" },
      1000,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.error).toMatch(/base64/)
    }
  })

  it("rejects non-image bytes", () => {
    const result = validateImageUpload(
      { name: "a.png", mimeType: "image/png", data: Buffer.from("hello world").toString("base64") },
      1000,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.error).toMatch(/not a valid image/)
    }
  })

  it("rejects bytes whose type does not match the declared mime", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString("base64")
    const result = validateImageUpload({ name: "a.png", mimeType: "image/png", data: jpeg }, 1000)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/do not match/)
    }
  })

  it("rejects an oversized image with 413", () => {
    const result = validateImageUpload(
      { name: "a.png", mimeType: "image/png", size: PNG_BYTES.length, data: PNG_BASE64 },
      4,
    )
    expect(result).toEqual({ ok: false, status: 413, error: "image exceeds the maximum allowed size" })
  })
})

describe("createMemoryImageStorage", () => {
  it("stores bytes and returns a retrievable server attachment reference without raw bytes", () => {
    const storage = createMemoryImageStorage()
    const attachment = storage.store({
      name: "a.png",
      mimeType: "image/png",
      size: PNG_BYTES.length,
      data: new Uint8Array(PNG_BYTES),
      width: 10,
      height: 20,
    })

    expect(attachment.kind).toBe("image")
    expect(attachment.storage.provider).toBe("server")
    expect(attachment.storage.objectKey).toBeTruthy()
    expect(attachment.storage.url).toContain("/api/uploads/images/")
    expect(attachment.width).toBe(10)
    expect(attachment.height).toBe(20)
    expect(JSON.stringify(attachment)).not.toContain(PNG_BASE64)

    const stored = storage.retrieve(attachment.storage.objectKey!)
    expect(stored?.mimeType).toBe("image/png")
    expect(stored?.data.length).toBe(PNG_BYTES.length)
  })
})
