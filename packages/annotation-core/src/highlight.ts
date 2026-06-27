import { ANNOTATION_UI_ATTR } from "./selector"

const Z_INDEX_HIGHLIGHT = "2147483646"

export interface Highlighter {
  show: (el: Element) => void
  hide: () => void
  destroy: () => void
}

/** A single fixed-position box that tracks the bounding rect of an element. */
export function createHighlighter(doc: Document): Highlighter {
  const box = doc.createElement("div")
  box.setAttribute(ANNOTATION_UI_ATTR, "highlight")
  Object.assign(box.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: Z_INDEX_HIGHLIGHT,
    border: "2px solid #3b82f6",
    background: "rgba(59, 130, 246, 0.12)",
    borderRadius: "2px",
    boxSizing: "border-box",
    display: "none",
    transition: "left 0.04s ease-out, top 0.04s ease-out, width 0.04s ease-out, height 0.04s ease-out",
  })
  doc.body.appendChild(box)

  return {
    show(el) {
      const rect = el.getBoundingClientRect()
      Object.assign(box.style, {
        display: "block",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      })
    },
    hide() {
      box.style.display = "none"
    },
    destroy() {
      box.remove()
    },
  }
}
