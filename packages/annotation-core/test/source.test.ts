import { afterEach, describe, expect, it } from "vitest"
import { readSourceMetadata, SOURCE_ATTR } from "../src/source"
import { createAnnotator } from "../src/annotator"
import type { AnnotationPayload } from "../src/types"

function appendButton(): HTMLButtonElement {
  const button = document.createElement("button")
  button.textContent = "Save"
  button.setAttribute(SOURCE_ATTR.id, "s_abc")
  button.setAttribute(SOURCE_ATTR.mode, "source")
  button.setAttribute(SOURCE_ATTR.file, "src/App.tsx")
  button.setAttribute(SOURCE_ATTR.line, "12")
  button.setAttribute(SOURCE_ATTR.column, "5")
  button.setAttribute(SOURCE_ATTR.component, "App")
  button.setAttribute(SOURCE_ATTR.framework, "react")
  document.body.appendChild(button)
  return button
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("readSourceMetadata", () => {
  it("returns full metadata in source mode", () => {
    const button = appendButton()
    expect(readSourceMetadata(button)).toEqual({
      mode: "source",
      sourceId: "s_abc",
      file: "src/App.tsx",
      line: 12,
      column: 5,
      component: "App",
      framework: "react",
    })
  })

  it("returns only the anonymous id in safe mode", () => {
    document.body.innerHTML = `
      <button
        ${SOURCE_ATTR.id}="s_safe"
        ${SOURCE_ATTR.mode}="safe"
      >Save</button>`
    const button = document.querySelector("button")!
    expect(readSourceMetadata(button)).toEqual({ mode: "safe", sourceId: "s_safe" })
  })

  it("walks up to the nearest annotated ancestor", () => {
    const button = appendButton()
    const icon = document.createElement("span")
    button.appendChild(icon)
    expect(readSourceMetadata(icon)?.sourceId).toBe("s_abc")
  })

  it("returns undefined when no plugin attributes exist", () => {
    document.body.innerHTML = `<button>Save</button>`
    expect(readSourceMetadata(document.querySelector("button")!)).toBeUndefined()
  })
})

describe("runtime writes source metadata into the payload", () => {
  it("fills target.source from injected attributes on submit", async () => {
    const button = appendButton()
    let captured: AnnotationPayload | undefined

    const annotator = createAnnotator(
      {
        projectId: "p",
        submitAnnotation: async (payload) => {
          captured = payload
        },
      },
      window,
    )
    annotator.enable()

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-annotation-ui="overlay-input"]',
    )!
    textarea.value = "Change this label"
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))

    // Flush the async submit handler.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(captured?.annotations[0]?.target.source).toEqual({
      mode: "source",
      sourceId: "s_abc",
      file: "src/App.tsx",
      line: 12,
      column: 5,
      component: "App",
      framework: "react",
    })

    annotator.destroy()
  })

  it("omits target.source when source metadata capture is disabled", async () => {
    const button = appendButton()
    let captured: AnnotationPayload | undefined

    const annotator = createAnnotator(
      {
        projectId: "p",
        capture: { sourceMetadata: "disabled" },
        submitAnnotation: async (payload) => {
          captured = payload
        },
      },
      window,
    )
    annotator.enable()

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-annotation-ui="overlay-input"]',
    )!
    textarea.value = "Change this label"
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(captured?.annotations[0]?.target.source).toBeUndefined()

    annotator.destroy()
  })
})
