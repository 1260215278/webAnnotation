import { describe, expect, it, vi } from "vitest"
import { uploadAnnotationImage } from "../src/attachments"
import type {
  AnnotationImageAttachment,
  ImageAttachmentsOptions,
  UploadImageContext,
} from "../src/types"

const context: UploadImageContext = {
  projectId: "p",
  page: { url: "https://x/", route: "/", title: "x" },
}

function makeFile(): File {
  return new File(["bytes"], "shot.png", { type: "image/png" })
}

const attachment: AnnotationImageAttachment = {
  id: "att_1",
  kind: "image",
  name: "shot.png",
  mimeType: "image/png",
  size: 5,
  storage: { provider: "server", url: "https://cdn/shot.png" },
}

describe("uploadAnnotationImage", () => {
  it("prefers uploadImage over uploadEndpoint", async () => {
    const uploadImage = vi.fn().mockResolvedValue(attachment)
    const fetchSpy = vi.fn()
    const options: ImageAttachmentsOptions = {
      uploadImage,
      uploadEndpoint: "https://up",
    }

    const result = await uploadAnnotationImage(makeFile(), options, context, {
      fetch: fetchSpy as unknown as typeof fetch,
    })

    expect(result).toBe(attachment)
    expect(uploadImage).toHaveBeenCalledTimes(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("uploads via endpoint with a base64 body and bearer token, returning the stored reference", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ attachment }),
    })
    const options: ImageAttachmentsOptions = {
      uploadEndpoint: "https://up/images",
      getUploadAuthToken: () => "tok",
    }

    const result = await uploadAnnotationImage(makeFile(), options, context, {
      fetch: fetchSpy as unknown as typeof fetch,
      toBase64: async () => "YmFzZTY0",
    })

    expect(result).toEqual(attachment)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://up/images")
    const headers = init.headers as Record<string, string>
    expect(headers["Authorization"]).toBe("Bearer tok")
    const body = JSON.parse(init.body as string)
    expect(body.data).toBe("YmFzZTY0")
    expect(body.name).toBe("shot.png")
    expect(body.mimeType).toBe("image/png")
    expect(body.size).toBe(makeFile().size)
    // The payload-facing result carries no base64 image content.
    expect(JSON.stringify(result)).not.toContain("YmFzZTY0")
  })

  it("throws on a non-ok upload response", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 413, json: async () => ({}) })
    await expect(
      uploadAnnotationImage(makeFile(), { uploadEndpoint: "https://up" }, context, {
        fetch: fetchSpy as unknown as typeof fetch,
        toBase64: async () => "x",
      }),
    ).rejects.toThrow(/status 413/)
  })

  it("throws when the response is missing `attachment`", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    await expect(
      uploadAnnotationImage(makeFile(), { uploadEndpoint: "https://up" }, context, {
        fetch: fetchSpy as unknown as typeof fetch,
        toBase64: async () => "x",
      }),
    ).rejects.toThrow(/attachment/)
  })

  it("throws when no upload strategy is configured", async () => {
    await expect(uploadAnnotationImage(makeFile(), {}, context)).rejects.toThrow(
      /no image upload strategy/,
    )
  })
})
