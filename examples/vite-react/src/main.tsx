import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import {
  createAnnotator,
  createId,
  type AnnotationImageAttachment,
  type AnnotationPayload,
} from "@web-annotation/core"
import { App } from "./App"

// Demo-only uploader: pretend the host stored the file and returned a reference.
// The payload only carries this reference — never the raw image bytes.
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

function Root() {
  const [lastPayload, setLastPayload] = useState("No annotation submitted yet.")

  useEffect(() => {
    const annotator = createAnnotator({
      projectId: "vite-react-example",
      environment: "local",
      capture: { domSnapshot: true },
      attachments: {
        images: true,
        uploadImage: mockUploadImage,
      },
      // Mock submission: log the payload (including target.source) and show it on the page.
      submitAnnotation: async (payload: AnnotationPayload) => {
        // eslint-disable-next-line no-console
        console.log("[web-annotation] payload", payload)
        setLastPayload(JSON.stringify(payload, null, 2))
      },
    })
    annotator.mountWidget()
    // Cleanup keeps a single widget under React StrictMode's double-invoke.
    return () => annotator.destroy()
  }, [])

  return <App lastPayload={lastPayload} />
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
