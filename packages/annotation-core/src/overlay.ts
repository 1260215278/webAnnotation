import { ANNOTATION_UI_ATTR } from "./selector"

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
}

/**
 * A small floating panel with a textarea, anchored next to the locked element.
 * Enter submits, Shift+Enter inserts a newline, Esc cancels.
 */
export function createOverlay(doc: Document, callbacks: OverlayCallbacks): Overlay {
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
  textarea.placeholder = "Describe the change… (Enter to submit, Esc to cancel)"
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
  hint.textContent = "Enter submit · Shift+Enter newline · Esc cancel"

  const error = doc.createElement("div")
  Object.assign(error.style, {
    marginTop: "6px",
    fontSize: "11px",
    color: "#dc2626",
    display: "none",
  })

  panel.appendChild(textarea)
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
      panel.style.display = "block"
      position(el)
      textarea.focus()
    },
    close() {
      panel.style.display = "none"
    },
    destroy() {
      textarea.removeEventListener("keydown", handleKeydown)
      panel.remove()
    },
    setSubmitting(submitting) {
      textarea.disabled = submitting
      hint.textContent = submitting
        ? "Submitting…"
        : "Enter submit · Shift+Enter newline · Esc cancel"
    },
    setError(message) {
      error.textContent = message
      error.style.display = message ? "block" : "none"
    },
  }
}
