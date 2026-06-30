import type {
  Annotator,
  AnnotatorOptions,
  AnnotationImageAttachment,
  AnnotationTarget,
  ImageAttachmentsOptions,
  ProjectInfo,
  UploadImageContext,
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
import {
  DEFAULT_MAX_IMAGES,
  DEFAULT_MAX_IMAGE_BYTES,
  IMAGE_ATTACHMENT_MIME_TYPES,
  uploadAnnotationImage,
} from "./attachments"
import type { ImageListConfig, ImageListItem } from "./imageList"
import { getRuntimeLabels, resolveAnnotationLocale, type RuntimeLabels } from "./i18n"

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
  private readonly labels: RuntimeLabels

  private highlighter: Highlighter | null = null
  private overlay: Overlay | null = null
  private widget: Widget | null = null

  private enabled = false
  private lockedTarget: Element | null = null
  /** Attachments already uploaded for the current locked target, keyed by image id. */
  private readonly uploadedCache = new Map<string, AnnotationImageAttachment>()

  constructor(options: AnnotatorOptions, win: Window) {
    this.options = options
    this.win = win
    this.doc = win.document
    this.labels = getRuntimeLabels(resolveAnnotationLocale(win, options.locale))
  }

  private buildImageConfig(): ImageListConfig | undefined {
    const attachments = this.options.attachments
    if (!attachments?.images) return undefined
    return {
      acceptedImageTypes: attachments.acceptedImageTypes ?? [...IMAGE_ATTACHMENT_MIME_TYPES],
      maxImages: attachments.maxImages ?? DEFAULT_MAX_IMAGES,
      maxImageBytes: attachments.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES,
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  enable(): void {
    if (this.enabled) return
    this.enabled = true

    this.highlighter = createHighlighter(this.doc)
    this.overlay = createOverlay(
      this.doc,
      {
        onSubmit: (message) => void this.handleSubmit(message),
        onCancel: () => this.unlock(),
      },
      this.labels,
      this.buildImageConfig(),
    )

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
    this.widget = createWidget(
      this.doc,
      () => {
        if (this.enabled) {
          this.disable()
        } else {
          this.enable()
        }
      },
      this.labels,
    )
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
    this.uploadedCache.clear()
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

  private buildUploadContext(): UploadImageContext {
    const page = buildPageInfo(this.win)
    const context: UploadImageContext = {
      projectId: this.options.projectId,
      page: { url: page.url, route: page.route, title: page.title },
    }
    if (this.options.environment !== undefined) context.environment = this.options.environment
    return context
  }

  /**
   * Upload every selected image, surfacing per-image status. Throws on the first
   * failure (marking that image failed) so the annotation is not submitted with a
   * missing attachment; the user can remove the failed image and resubmit.
   */
  private async uploadImages(
    images: ImageListItem[],
    attachments: ImageAttachmentsOptions,
    overlay: Overlay,
  ): Promise<AnnotationImageAttachment[]> {
    const context = this.buildUploadContext()
    const uploaded: AnnotationImageAttachment[] = []
    for (const image of images) {
      // Reuse a prior successful upload so a submit retry never re-uploads the
      // same image (which would orphan duplicate objects in real storage).
      const cached = this.uploadedCache.get(image.id)
      if (cached) {
        overlay.setImageStatus(image.id, "idle")
        uploaded.push(cached)
        continue
      }
      overlay.setImageStatus(image.id, "uploading")
      try {
        const attachment = await uploadAnnotationImage(image.file, attachments, context)
        overlay.setImageStatus(image.id, "idle")
        this.uploadedCache.set(image.id, attachment)
        uploaded.push(attachment)
      } catch (err) {
        const reason = err instanceof Error ? err.message : "upload failed"
        overlay.setImageStatus(image.id, "failed", reason)
        throw err
      }
    }
    return uploaded
  }

  private async handleSubmit(message: string): Promise<void> {
    const el = this.lockedTarget
    const overlay = this.overlay
    if (!el || !overlay) return
    if (!message) {
      overlay.setError(this.labels.emptyError)
      return
    }

    const images = overlay.getImages()
    overlay.setSubmitting(true)
    overlay.setError("")

    let attachments: AnnotationImageAttachment[] = []
    if (images.length > 0) {
      const attachmentsOptions = this.options.attachments
      if (
        !attachmentsOptions ||
        (!attachmentsOptions.uploadImage && !attachmentsOptions.uploadEndpoint)
      ) {
        overlay.setSubmitting(false)
        overlay.setError(this.labels.uploadNotConfigured)
        return
      }
      try {
        attachments = await this.uploadImages(images, attachmentsOptions, overlay)
      } catch {
        overlay.setSubmitting(false)
        overlay.setError(this.labels.uploadFailed)
        return
      }
    }

    const payload = buildAnnotationPayload({
      project: this.buildProject(),
      page: buildPageInfo(this.win),
      annotations: [buildAnnotationItem({ message, target: this.buildTarget(el), attachments })],
    })

    try {
      await submitPayload(this.options, payload)
      overlay.setSubmitting(false)
      this.unlock()
    } catch (err) {
      overlay.setSubmitting(false)
      const reason = err instanceof Error ? err.message : "submission failed"
      overlay.setError(`${reason}${this.labels.submitRetrySuffix}`)
    }
  }
}

/** Create a browser annotator bound to the current (or given) window. */
export function createAnnotator(options: AnnotatorOptions, win: Window = window): Annotator {
  return new BrowserAnnotator(options, win)
}
