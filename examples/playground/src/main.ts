import {
  ANNOTATION_UI_ATTR,
  createAnnotator,
  createId,
  type AnnotationImageAttachment,
  type AnnotationPayload,
} from "@web-annotation/core"

const output = document.querySelector<HTMLPreElement>("#output")!
const toggle = document.querySelector<HTMLButtonElement>("#toggle")!
const status = document.querySelector<HTMLSpanElement>("#status")!

toggle.setAttribute(ANNOTATION_UI_ATTR, "example-toggle")

function renderPayload(payload: AnnotationPayload): void {
  output.textContent = JSON.stringify(payload, null, 2)
}

// Demo-only uploader: pretend the host stored the file and returned a reference.
// A real host would upload to its server or OSS and return the stored metadata.
// The payload only ever carries this reference — never the raw image bytes.
async function mockUploadImage(file: File): Promise<AnnotationImageAttachment> {
  const objectKey = `mock/${file.name}`
  return {
    id: createId("att"),
    kind: "image",
    name: file.name,
    mimeType: file.type,
    size: file.size,
    storage: {
      provider: "custom",
      objectKey,
      url: `https://mock.web-annotation.local/${objectKey}`,
    },
  }
}

const annotator = createAnnotator({
  projectId: "playground",
  environment: "local",
  capture: { domSnapshot: true },
  attachments: {
    images: true,
    uploadImage: mockUploadImage,
  },
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
