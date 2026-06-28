import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { createAnnotator, type AnnotationPayload } from "@web-annotation/core"
import { App } from "./App"

function Root() {
  const [lastPayload, setLastPayload] = useState("No annotation submitted yet.")

  useEffect(() => {
    const annotator = createAnnotator({
      projectId: "vite-react-example",
      environment: "local",
      capture: { domSnapshot: true },
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
