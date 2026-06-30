import { ANNOTATION_UI_ATTR } from "./selector"
import { createImageList, type ImageList } from "./imageList"
import type { ImageItemStatus, ImageListConfig, ImageListItem } from "./imageList"
import type { RuntimeLabels } from "./i18n"

const Z_INDEX_OVERLAY = "2147483647"
const GAP = 8
const PANEL_WIDTH = 280

export interface OverlayCallbacks {
  onSubmit: (message: string) => void
  onCancel: () => void
}

export interface Overlay {
  open: (el: Element) => void
  close: () => void
  destroy: () => void
  setSubmitting: (submitting: boolean) => void
  setError: (message: string) => void
  /** Currently selected images, in insertion order. Empty when images are disabled. */
  getImages: () => ImageListItem[]
  /** Update the per-image upload status indicator. */
  setImageStatus: (id: string, status: ImageItemStatus, message?: string) => void
}

/**
 * A small floating panel with a textarea, anchored next to the locked element.
 * Enter submits, Shift+Enter inserts a newline, Esc cancels. When `imageConfig`
 * is provided, an image picker with thumbnails is shown below the textarea.
 */
export function createOverlay(
  doc: Document,
  callbacks: OverlayCallbacks,
  labels: RuntimeLabels,
  imageConfig?: ImageListConfig,
): Overlay {
  const panel = doc.createElement("div")
  panel.setAttribute(ANNOTATION_UI_ATTR, "overlay")
  Object.assign(panel.style, {
    position: "fixed",
    zIndex: Z_INDEX_OVERLAY,
    width: `${PANEL_WIDTH}px`,
    boxSizing: "border-box",
    padding: "10px",
    background: "#ffffff",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
    font: "13px/1.4 system-ui, -apple-system, sans-serif",
    color: "#111827",
    display: "none",
  })

  const textarea = doc.createElement("textarea")
  textarea.setAttribute(ANNOTATION_UI_ATTR, "overlay-input")
  textarea.placeholder = labels.placeholder
  Object.assign(textarea.style, {
    width: "100%",
    minHeight: "64px",
    boxSizing: "border-box",
    resize: "vertical",
    padding: "6px 8px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    font: "inherit",
    color: "inherit",
    outline: "none",
  })

  const hint = doc.createElement("div")
  Object.assign(hint.style, {
    marginTop: "6px",
    fontSize: "11px",
    color: "#6b7280",
  })
  hint.textContent = labels.hint

  const error = doc.createElement("div")
  error.setAttribute(ANNOTATION_UI_ATTR, "overlay-error")
  Object.assign(error.style, {
    marginTop: "6px",
    fontSize: "11px",
    color: "#dc2626",
    display: "none",
  })

  panel.appendChild(textarea)

  let imageList: ImageList | null = null
  if (imageConfig) {
    imageList = createImageList(doc, labels, imageConfig, (message) => {
      error.textContent = message
      error.style.display = "block"
    })
    panel.appendChild(imageList.element)
  }

  panel.appendChild(hint)
  panel.appendChild(error)
  doc.body.appendChild(panel)

  function position(el: Element): void {
    const rect = el.getBoundingClientRect()
    const win = doc.defaultView
    const viewportWidth = win ? win.innerWidth : PANEL_WIDTH
    const viewportHeight = win ? win.innerHeight : 0

    let left = rect.left
    if (left + PANEL_WIDTH > viewportWidth - GAP) {
      left = Math.max(GAP, viewportWidth - PANEL_WIDTH - GAP)
    }

    // Prefer placing below the element; flip above if there is no room.
    const panelHeight = panel.offsetHeight || 110
    let top = rect.bottom + GAP
    if (top + panelHeight > viewportHeight - GAP) {
      top = Math.max(GAP, rect.top - panelHeight - GAP)
    }

    panel.style.left = `${left}px`
    panel.style.top = `${top}px`
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      callbacks.onSubmit(textarea.value.trim())
      return
    }
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      callbacks.onCancel()
    }
  }

  textarea.addEventListener("keydown", handleKeydown)

  return {
    open(el) {
      error.style.display = "none"
      error.textContent = ""
      textarea.value = ""
      textarea.disabled = false
      imageList?.reset()
      imageList?.setDisabled(false)
      panel.style.display = "block"
      position(el)
      textarea.focus()
    },
    close() {
      panel.style.display = "none"
      imageList?.reset()
    },
    destroy() {
      textarea.removeEventListener("keydown", handleKeydown)
      imageList?.destroy()
      panel.remove()
    },
    setSubmitting(submitting) {
      textarea.disabled = submitting
      imageList?.setDisabled(submitting)
      hint.textContent = submitting ? labels.submitting : labels.hint
    },
    setError(message) {
      error.textContent = message
      error.style.display = message ? "block" : "none"
    },
    getImages() {
      return imageList ? imageList.getItems() : []
    },
    setImageStatus(id, status, message) {
      imageList?.setStatus(id, status, message)
    },
  }
}
