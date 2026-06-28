import type {
  Annotator,
  AnnotatorOptions,
  AnnotationTarget,
  ProjectInfo,
} from "./types"
import { ANNOTATION_UI_ATTR, buildSelector, buildCssPath } from "./selector"
import { createId } from "./id"
import { sanitizeDomSnapshot } from "./snapshot"
import { readSourceMetadata } from "./source"
import { buildAnnotationItem, buildAnnotationPayload, buildPageInfo } from "./payload"
import { submitPayload } from "./submit"
import { createHighlighter, type Highlighter } from "./highlight"
import { createOverlay, type Overlay } from "./overlay"
import { createWidget, type Widget } from "./widget"

const MAX_TEXT_LENGTH = 200

type WindowWithConstructors = Window & typeof globalThis

function toElement(node: EventTarget | null, win: Window): Element | null {
  const ElementCtor = (win as WindowWithConstructors).Element
  return node instanceof ElementCtor ? node : null
}

function isOwnUi(node: Element | null): boolean {
  return node?.closest(`[${ANNOTATION_UI_ATTR}]`) !== null
}

class BrowserAnnotator implements Annotator {
  private readonly options: AnnotatorOptions
  private readonly win: Window
  private readonly doc: Document

  private highlighter: Highlighter | null = null
  private overlay: Overlay | null = null
  private widget: Widget | null = null

  private enabled = false
  private lockedTarget: Element | null = null

  constructor(options: AnnotatorOptions, win: Window) {
    this.options = options
    this.win = win
    this.doc = win.document
  }

  isEnabled(): boolean {
    return this.enabled
  }

  enable(): void {
    if (this.enabled) return
    this.enabled = true

    this.highlighter = createHighlighter(this.doc)
    this.overlay = createOverlay(this.doc, {
      onSubmit: (message) => void this.handleSubmit(message),
      onCancel: () => this.unlock(),
    })

    this.doc.addEventListener("mouseover", this.handleMouseOver, true)
    this.doc.addEventListener("click", this.handleClick, true)

    this.widget?.setActive(true)
  }

  disable(): void {
    if (!this.enabled) return
    this.enabled = false

    this.doc.removeEventListener("mouseover", this.handleMouseOver, true)
    this.doc.removeEventListener("click", this.handleClick, true)

    this.lockedTarget = null
    this.highlighter?.destroy()
    this.highlighter = null
    this.overlay?.destroy()
    this.overlay = null

    this.widget?.setActive(false)
  }

  mountWidget(): void {
    if (this.widget) return
    this.widget = createWidget(this.doc, () => {
      if (this.enabled) {
        this.disable()
      } else {
        this.enable()
      }
    })
    this.widget.setActive(this.enabled)
  }

  destroy(): void {
    this.disable()
    this.widget?.destroy()
    this.widget = null
  }

  private readonly handleMouseOver = (event: MouseEvent): void => {
    if (this.lockedTarget) return
    const target = toElement(event.target, this.win)
    if (isOwnUi(target) || !target) {
      this.highlighter?.hide()
      return
    }
    this.highlighter?.show(target)
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = toElement(event.target, this.win)
    if (isOwnUi(target)) return
    // While an overlay is open, swallow page clicks but do not re-lock.
    event.preventDefault()
    event.stopPropagation()
    if (this.lockedTarget) return
    if (!target) return

    this.lockedTarget = target
    this.highlighter?.show(target)
    this.overlay?.open(target)
  }

  private unlock(): void {
    this.lockedTarget = null
    this.overlay?.close()
    this.highlighter?.hide()
  }

  private buildProject(): ProjectInfo {
    const project: ProjectInfo = { projectId: this.options.projectId }
    if (this.options.environment !== undefined) project.environment = this.options.environment
    if (this.options.release !== undefined) project.release = this.options.release
    if (this.options.commit !== undefined) project.commit = this.options.commit
    return project
  }

  private buildTarget(el: Element): AnnotationTarget {
    const rect = el.getBoundingClientRect()
    const target: AnnotationTarget = {
      selector: buildSelector(el, createId("el")),
      cssPath: buildCssPath(el),
      tagName: el.tagName.toLowerCase(),
      text: (el.textContent ?? "").trim().slice(0, MAX_TEXT_LENGTH),
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    }
    // DOM snapshot defaults on.
    if (this.options.capture?.domSnapshot !== false) {
      target.domSnapshot = sanitizeDomSnapshot(el)
    }
    if (this.options.capture?.sourceMetadata !== "disabled") {
      const source = readSourceMetadata(el)
      if (source) {
        target.source = source
      }
    }
    return target
  }

  private async handleSubmit(message: string): Promise<void> {
    const el = this.lockedTarget
    const overlay = this.overlay
    if (!el || !overlay) return
    if (!message) {
      overlay.setError("Please enter an annotation before submitting.")
      return
    }

    const payload = buildAnnotationPayload({
      project: this.buildProject(),
      page: buildPageInfo(this.win),
      annotations: [buildAnnotationItem({ message, target: this.buildTarget(el) })],
    })

    overlay.setSubmitting(true)
    overlay.setError("")
    try {
      await submitPayload(this.options, payload)
      overlay.setSubmitting(false)
      this.unlock()
    } catch (err) {
      overlay.setSubmitting(false)
      const reason = err instanceof Error ? err.message : "submission failed"
      overlay.setError(`${reason} — press Enter to retry.`)
    }
  }
}

/** Create a browser annotator bound to the current (or given) window. */
export function createAnnotator(options: AnnotatorOptions, win: Window = window): Annotator {
  return new BrowserAnnotator(options, win)
}
