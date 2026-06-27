import {
  ANNOTATION_UI_ATTR,
  createAnnotator,
  type AnnotationPayload,
} from "@web-annotation/core"

const output = document.querySelector<HTMLPreElement>("#output")!
const toggle = document.querySelector<HTMLButtonElement>("#toggle")!
const status = document.querySelector<HTMLSpanElement>("#status")!

toggle.setAttribute(ANNOTATION_UI_ATTR, "example-toggle")

function renderPayload(payload: AnnotationPayload): void {
  output.textContent = JSON.stringify(payload, null, 2)
}

const annotator = createAnnotator({
  projectId: "playground",
  environment: "local",
  capture: { domSnapshot: true },
  // Mock submission: log the payload instead of hitting a real backend.
  submitAnnotation: async (payload) => {
    // eslint-disable-next-line no-console
    console.log("[web-annotation] payload", payload)
    renderPayload(payload)
  },
})

annotator.mountWidget()

function syncStatus(): void {
  const enabled = annotator.isEnabled()
  status.textContent = enabled ? "enabled" : "disabled"
  toggle.textContent = enabled ? "Disable annotation" : "Enable annotation"
}

toggle.addEventListener("click", () => {
  if (annotator.isEnabled()) {
    annotator.disable()
  } else {
    annotator.enable()
  }
  syncStatus()
})

// Keep the header button in sync when toggled via the floating widget.
window.setInterval(syncStatus, 300)
syncStatus()
