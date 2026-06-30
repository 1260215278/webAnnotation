import { ANNOTATION_UI_ATTR } from "./selector"
import type { RuntimeLabels } from "./i18n"

const Z_INDEX_WIDGET = "2147483645"

export interface Widget {
  setActive: (active: boolean) => void
  destroy: () => void
}

/** A floating toggle button anchored to the bottom-right corner. */
export function createWidget(doc: Document, onToggle: () => void, labels: RuntimeLabels): Widget {
  const button = doc.createElement("button")
  button.type = "button"
  button.setAttribute(ANNOTATION_UI_ATTR, "widget")
  button.textContent = labels.widgetEnable
  Object.assign(button.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: Z_INDEX_WIDGET,
    padding: "8px 14px",
    background: "#111827",
    color: "#ffffff",
    border: "none",
    borderRadius: "999px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
    font: "13px/1 system-ui, -apple-system, sans-serif",
    cursor: "pointer",
  })

  function handleClick(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    onToggle()
  }

  button.addEventListener("click", handleClick)
  doc.body.appendChild(button)

  return {
    setActive(active) {
      button.style.background = active ? "#2563eb" : "#111827"
      button.textContent = active ? labels.widgetActive : labels.widgetEnable
    },
    destroy() {
      button.removeEventListener("click", handleClick)
      button.remove()
    },
  }
}
