import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { AnnotationImageAttachment } from "@web-annotation/core"
import { createMemoryImageStorage, createPlatformServer } from "../src/index"
import type { PatchProvider, PlatformServer } from "../src/index"
import { makeSourcePayload } from "./fixtures"

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01])
const PNG_BASE64 = PNG_BYTES.toString("base64")

describe("image upload HTTP smoke", () => {
  let platform: PlatformServer
  let base: string
  let providerSawAttachment: { name: string; mimeType: string } | undefined

  const capturingProvider: PatchProvider = {
    generatePatch(input) {
      const attachment = input.promptContext.annotations[0]?.attachments?.[0]
      providerSawAttachment = attachment
        ? { name: attachment.name, mimeType: attachment.mimeType }
        : undefined
      return {
        summary: "Smoke patch using the attachment context.",
        suggestedFiles: ["src/App.tsx"],
        diffPreview: "--- a/src/App.tsx\n+++ b/src/App.tsx\n@@\n- Submit\n+ Save",
        metadata: { provider: "smoke" },
      }
    },
  }

  beforeAll(async () => {
    platform = createPlatformServer({
      imageStorageProvider: createMemoryImageStorage(),
      patchProvider: capturingProvider,
    })
    await new Promise<void>((resolve, reject) => {
      platform.server.once("error", reject)
      platform.server.listen(0, "127.0.0.1", () => resolve())
    })
    const { port } = platform.server.address() as AddressInfo
    base = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => platform.server.close(() => resolve()))
  })

  it("uploads an image, submits a payload with it, and the provider + artifact read the attachment", async () => {
    // 1. Upload an image over HTTP.
    const upload = await fetch(`${base}/api/uploads/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "shot.png", mimeType: "image/png", data: PNG_BASE64 }),
    })
    expect(upload.status).toBe(201)
    const { attachment } = (await upload.json()) as { attachment: AnnotationImageAttachment }
    expect(attachment.storage.provider).toBe("server")
    expect(attachment.storage.objectKey).toBeTruthy()

    // 1b. The returned URL actually resolves to the stored image bytes.
    const served = await fetch(`${base}${attachment.storage.url}`)
    expect(served.status).toBe(200)
    expect(served.headers.get("content-type")).toContain("image/png")
    const servedBytes = new Uint8Array(await served.arrayBuffer())
    expect(servedBytes.length).toBe(PNG_BYTES.length)

    // 2. Submit an annotation payload that references the uploaded image.
    const payload = makeSourcePayload()
    payload.annotations[0].attachments = [attachment]
    const ingest = await fetch(`${base}/api/annotations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    expect(ingest.status).toBe(201)
    const { taskId } = (await ingest.json()) as { taskId: string }

    // 3. Task detail shows the attachment.
    const detail = await fetch(`${base}/api/tasks/${taskId}`)
    const { task } = (await detail.json()) as {
      task: { promptContext: { annotations: Array<{ attachments?: Array<{ name: string }> }> } }
    }
    expect(task.promptContext.annotations[0].attachments?.[0].name).toBe("shot.png")

    // 4. The patch provider reads the attachment summary from the prompt context.
    const patch = await fetch(`${base}/api/tasks/${taskId}/patch`, { method: "POST" })
    expect(patch.status).toBe(201)
    expect(providerSawAttachment).toEqual({ name: "shot.png", mimeType: "image/png" })

    // 5. The exported artifact carries the attachment metadata, without raw bytes.
    const artifactRes = await fetch(`${base}/api/tasks/${taskId}/patch-artifact`)
    expect(artifactRes.status).toBe(200)
    const { artifact } = (await artifactRes.json()) as {
      artifact: { annotations: Array<{ attachments?: Array<{ name: string }> }> }
    }
    expect(artifact.annotations[0].attachments?.[0].name).toBe("shot.png")
    expect(JSON.stringify(artifact)).not.toContain(PNG_BASE64)
  })
})
