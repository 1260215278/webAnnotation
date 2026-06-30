import { afterEach, describe, expect, it, vi } from "vitest"
import { createAnnotator } from "../src/annotator"
import { ANNOTATION_UI_ATTR } from "../src/selector"
import type { AnnotationPayload } from "../src/types"

afterEach(() => {
  document.body.innerHTML = ""
})

describe("createAnnotator", () => {
  it("locks a clicked element and submits a v1 payload on Enter", async () => {
    document.body.innerHTML = `<button id="save">Submit</button>`
    const submitAnnotation = vi.fn<(payload: AnnotationPayload) => void>()
    const annotator = createAnnotator({ projectId: "p", submitAnnotation })

    annotator.enable()

    const target = document.querySelector<HTMLButtonElement>("#save")!
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    const input = document.querySelector<HTMLTextAreaElement>(
      `[${ANNOTATION_UI_ATTR}='overlay-input']`,
    )!
    input.value = "Change button text"
    input.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    }))

    await Promise.resolve()
    await Promise.resolve()

    expect(submitAnnotation).toHaveBeenCalledTimes(1)
    const payload = submitAnnotation.mock.calls[0]![0]
    expect(payload.version).toBe("v1")
    expect(payload.project.projectId).toBe("p")
    expect(payload.annotations[0]?.message).toBe("Change button text")
    expect(payload.annotations[0]?.target.tagName).toBe("button")
    expect(payload.annotations[0]?.target.text).toBe("Submit")

    annotator.destroy()
  })

  const flush = async (): Promise<void> => {
    for (let i = 0; i < 10; i++) await Promise.resolve()
  }

  function selectFile(name = "shot.png", type = "image/png", bytes = "bytes"): void {
    const fileInput = document.querySelector<HTMLInputElement>(
      `[${ANNOTATION_UI_ATTR}='overlay-image-input']`,
    )!
    const file = new File([bytes], name, { type })
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true })
    fileInput.dispatchEvent(new Event("change", { bubbles: true }))
  }

  function pressEnter(message: string): void {
    const input = document.querySelector<HTMLTextAreaElement>(
      `[${ANNOTATION_UI_ATTR}='overlay-input']`,
    )!
    input.value = message
    input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }))
  }

  it("uploads a selected image and includes the attachment in the payload", async () => {
    document.body.innerHTML = `<button id="save">Submit</button>`
    const attachment = {
      id: "att_x",
      kind: "image" as const,
      name: "shot.png",
      mimeType: "image/png",
      size: 5,
      storage: { provider: "server" as const, url: "https://cdn/shot.png" },
    }
    const uploadImage = vi.fn().mockResolvedValue(attachment)
    const submitAnnotation = vi.fn<(payload: AnnotationPayload) => void>()
    const annotator = createAnnotator({
      projectId: "p",
      submitAnnotation,
      attachments: { images: true, uploadImage },
    })

    annotator.enable()
    document
      .querySelector("#save")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    selectFile()
    expect(document.querySelector(`[${ANNOTATION_UI_ATTR}='overlay-image-item']`)).not.toBeNull()

    pressEnter("look at this button")
    await flush()

    expect(uploadImage).toHaveBeenCalledTimes(1)
    expect(submitAnnotation).toHaveBeenCalledTimes(1)
    const payload = submitAnnotation.mock.calls[0]![0]
    expect(payload.annotations[0]?.attachments).toEqual([attachment])

    annotator.destroy()
  })

  it("does not submit when an image upload fails, then submits after the image is removed", async () => {
    document.body.innerHTML = `<button id="save">Submit</button>`
    const uploadImage = vi.fn().mockRejectedValue(new Error("network down"))
    const submitAnnotation = vi.fn<(payload: AnnotationPayload) => void>()
    const annotator = createAnnotator({
      projectId: "p",
      submitAnnotation,
      attachments: { images: true, uploadImage },
    })

    annotator.enable()
    document
      .querySelector("#save")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    selectFile()
    pressEnter("look here")
    await flush()

    expect(uploadImage).toHaveBeenCalledTimes(1)
    expect(submitAnnotation).not.toHaveBeenCalled()
    const errorEl = document.querySelector<HTMLElement>(`[${ANNOTATION_UI_ATTR}='overlay-error']`)!
    expect(errorEl.textContent).toContain("Image upload failed")

    // Remove the failed image, then submit again with no attachments.
    document
      .querySelector<HTMLButtonElement>(`[${ANNOTATION_UI_ATTR}='overlay-image-remove']`)!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    expect(document.querySelector(`[${ANNOTATION_UI_ATTR}='overlay-image-item']`)).toBeNull()

    pressEnter("look here")
    await flush()

    expect(submitAnnotation).toHaveBeenCalledTimes(1)
    const payload = submitAnnotation.mock.calls[0]![0]
    expect(payload.annotations[0]?.attachments).toBeUndefined()

    annotator.destroy()
  })

  it("does not re-upload an already-uploaded image when the submission is retried", async () => {
    document.body.innerHTML = `<button id="save">Submit</button>`
    const attachment = {
      id: "att_x",
      kind: "image" as const,
      name: "shot.png",
      mimeType: "image/png",
      size: 5,
      storage: { provider: "server" as const, url: "https://cdn/shot.png" },
    }
    const uploadImage = vi.fn().mockResolvedValue(attachment)
    const submitAnnotation = vi
      .fn<(payload: AnnotationPayload) => Promise<void>>()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(undefined)
    const annotator = createAnnotator({
      projectId: "p",
      submitAnnotation,
      attachments: { images: true, uploadImage },
    })

    annotator.enable()
    document
      .querySelector("#save")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    selectFile()
    pressEnter("look here")
    await flush()
    expect(uploadImage).toHaveBeenCalledTimes(1)
    expect(submitAnnotation).toHaveBeenCalledTimes(1)

    // Retry: the image is cached, so it is not re-uploaded; the submit now succeeds.
    pressEnter("look here")
    await flush()
    expect(uploadImage).toHaveBeenCalledTimes(1)
    expect(submitAnnotation).toHaveBeenCalledTimes(2)
    const payload = submitAnnotation.mock.calls[1]![0]
    expect(payload.annotations[0]?.attachments).toEqual([attachment])

    annotator.destroy()
  })

  it("refuses to submit images when no uploader is configured", async () => {
    document.body.innerHTML = `<button id="save">Submit</button>`
    const submitAnnotation = vi.fn<(payload: AnnotationPayload) => void>()
    const annotator = createAnnotator({
      projectId: "p",
      submitAnnotation,
      attachments: { images: true },
    })

    annotator.enable()
    document
      .querySelector("#save")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    selectFile()
    pressEnter("no uploader here")
    await flush()

    expect(submitAnnotation).not.toHaveBeenCalled()
    const errorEl = document.querySelector<HTMLElement>(`[${ANNOTATION_UI_ATTR}='overlay-error']`)!
    expect(errorEl.textContent).toContain("Image upload is not configured.")

    annotator.destroy()
  })

  it("rejects an oversized image at selection time without an uploader call", async () => {
    document.body.innerHTML = `<button id="save">Submit</button>`
    const uploadImage = vi.fn()
    const annotator = createAnnotator({
      projectId: "p",
      submitAnnotation: () => undefined,
      attachments: { images: true, uploadImage, maxImageBytes: 4 },
    })

    annotator.enable()
    document
      .querySelector("#save")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    selectFile("big.png", "image/png", "way-too-many-bytes")
    expect(document.querySelector(`[${ANNOTATION_UI_ATTR}='overlay-image-item']`)).toBeNull()
    const errorEl = document.querySelector<HTMLElement>(`[${ANNOTATION_UI_ATTR}='overlay-error']`)!
    expect(errorEl.textContent).toContain("Image is too large.")
    expect(uploadImage).not.toHaveBeenCalled()

    annotator.destroy()
  })

  it("does not intercept elements marked as SDK UI", () => {
    document.body.innerHTML = `<button ${ANNOTATION_UI_ATTR}="host-toggle">Toggle</button>`
    const annotator = createAnnotator({
      projectId: "p",
      submitAnnotation: () => undefined,
    })

    annotator.enable()

    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    document.querySelector("button")!.dispatchEvent(event)
    const panel = document.querySelector<HTMLElement>(`[${ANNOTATION_UI_ATTR}='overlay']`)!

    expect(event.defaultPrevented).toBe(false)
    expect(panel.style.display).toBe("none")

    annotator.destroy()
  })
})
