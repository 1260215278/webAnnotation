import { beforeEach, describe, expect, it } from "vitest"
import type { AnnotationImageAttachment } from "@web-annotation/core"
import { handlePlatformRequest } from "../src/server"
import { createTaskStore } from "../src/store"
import type { TaskStore } from "../src/store"
import { createMemoryImageStorage } from "../src/imageStorage"
import { makeSourcePayload } from "./fixtures"

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])
const PNG_BASE64 = PNG_BYTES.toString("base64")

let store: TaskStore
beforeEach(() => {
  store = createTaskStore()
})

describe("POST /api/uploads/images", () => {
  it("returns 409 when no image storage is configured", async () => {
    const res = await handlePlatformRequest(
      {
        method: "POST",
        path: "/api/uploads/images",
        body: { name: "a.png", mimeType: "image/png", data: PNG_BASE64 },
      },
      store,
    )
    expect(res.status).toBe(409)
  })

  it("stores an image and returns the attachment reference (no raw bytes)", async () => {
    const res = await handlePlatformRequest(
      {
        method: "POST",
        path: "/api/uploads/images",
        body: { name: "a.png", mimeType: "image/png", data: PNG_BASE64 },
      },
      store,
      { imageStorageProvider: createMemoryImageStorage() },
    )
    expect(res.status).toBe(201)
    const body = res.body as { attachment: AnnotationImageAttachment }
    expect(body.attachment.kind).toBe("image")
    expect(body.attachment.storage.provider).toBe("server")
    expect(body.attachment.size).toBe(PNG_BYTES.length)
    expect(JSON.stringify(res.body)).not.toContain(PNG_BASE64)
  })

  it("rejects an unsupported mime type with 400", async () => {
    const res = await handlePlatformRequest(
      {
        method: "POST",
        path: "/api/uploads/images",
        body: { name: "a.svg", mimeType: "image/svg+xml", data: PNG_BASE64 },
      },
      store,
      { imageStorageProvider: createMemoryImageStorage() },
    )
    expect(res.status).toBe(400)
  })

  it("rejects non-image bytes with 400", async () => {
    const res = await handlePlatformRequest(
      {
        method: "POST",
        path: "/api/uploads/images",
        body: {
          name: "a.png",
          mimeType: "image/png",
          data: Buffer.from("not an image at all").toString("base64"),
        },
      },
      store,
      { imageStorageProvider: createMemoryImageStorage() },
    )
    expect(res.status).toBe(400)
  })

  it("rejects an oversized image with 413", async () => {
    const res = await handlePlatformRequest(
      {
        method: "POST",
        path: "/api/uploads/images",
        body: { name: "a.png", mimeType: "image/png", data: PNG_BASE64 },
      },
      store,
      { imageStorageProvider: createMemoryImageStorage(), maxImageBytes: 4 },
    )
    expect(res.status).toBe(413)
  })
})

describe("GET /api/uploads/images/:key", () => {
  it("serves the stored image bytes for the in-memory provider", async () => {
    const provider = createMemoryImageStorage()
    const upload = await handlePlatformRequest(
      {
        method: "POST",
        path: "/api/uploads/images",
        body: { name: "a.png", mimeType: "image/png", data: PNG_BASE64 },
      },
      store,
      { imageStorageProvider: provider },
    )
    const { attachment } = upload.body as { attachment: AnnotationImageAttachment }
    const objectKey = attachment.storage.objectKey!

    const serve = await handlePlatformRequest(
      { method: "GET", path: `/api/uploads/images/${objectKey}` },
      store,
      { imageStorageProvider: provider },
    )
    expect(serve.status).toBe(200)
    expect(serve.contentType).toBe("image/png")
    expect(serve.body).toBeInstanceOf(Uint8Array)
    expect(Buffer.from(serve.body as Uint8Array).equals(PNG_BYTES)).toBe(true)
  })

  it("returns 404 for an unknown object key", async () => {
    const serve = await handlePlatformRequest(
      { method: "GET", path: "/api/uploads/images/missing.png" },
      store,
      { imageStorageProvider: createMemoryImageStorage() },
    )
    expect(serve.status).toBe(404)
  })

  it("returns 404 when no image storage is configured", async () => {
    const serve = await handlePlatformRequest(
      { method: "GET", path: "/api/uploads/images/x.png" },
      store,
    )
    expect(serve.status).toBe(404)
  })
})

describe("patch artifact attachment metadata", () => {
  it("carries attachment metadata into the exported artifact without raw image content", async () => {
    const payload = makeSourcePayload()
    payload.annotations[0].attachments = [
      {
        id: "att_1",
        kind: "image",
        name: "screenshot.png",
        mimeType: "image/png",
        size: 4096,
        storage: { provider: "server", url: "https://cdn.example.com/screenshot.png", objectKey: "screenshot.png" },
      },
    ]

    const ingest = await handlePlatformRequest(
      { method: "POST", path: "/api/annotations", body: payload },
      store,
    )
    const taskId = (ingest.body as { taskId: string }).taskId

    await handlePlatformRequest(
      { method: "POST", path: `/api/tasks/${taskId}/mock-patch` },
      store,
    )
    const artifactRes = await handlePlatformRequest(
      { method: "GET", path: `/api/tasks/${taskId}/patch-artifact` },
      store,
    )

    expect(artifactRes.status).toBe(200)
    const artifact = (artifactRes.body as { artifact: { annotations: Array<{ attachments?: unknown[] }> } })
      .artifact
    const attachments = artifact.annotations[0].attachments as Array<{
      name: string
      storage: { url?: string }
    }>
    expect(attachments[0].name).toBe("screenshot.png")
    expect(attachments[0].storage.url).toBe("https://cdn.example.com/screenshot.png")
    // No raw base64 image content anywhere in the artifact.
    expect(JSON.stringify(artifact)).not.toContain("data:image")
    expect(JSON.stringify(artifact)).not.toContain("base64")
  })
})
