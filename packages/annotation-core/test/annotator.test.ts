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
