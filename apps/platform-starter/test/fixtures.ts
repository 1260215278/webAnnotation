import type { AnnotationPayload } from "@web-annotation/core"
import type { SourceManifest } from "@web-annotation/node"

/** A fully valid `AnnotationPayload v1` in `source` mode. */
export function makeSourcePayload(): AnnotationPayload {
  return {
    version: "v1",
    project: { projectId: "web-console", environment: "staging" },
    page: {
      url: "https://app.example.com/settings",
      route: "/settings",
      title: "Settings",
      viewport: { width: 1440, height: 900 },
    },
    annotationGroup: { id: "group_1", mode: "single" },
    annotations: [
      {
        id: "anno_1",
        message: "Change this button text to Save settings",
        createdAt: "2026-06-28T00:00:00.000Z",
        target: {
          selector: "[data-annotation-id='el_1']",
          cssPath: "#save",
          tagName: "button",
          text: "Submit",
          rect: { x: 111, y: 319, width: 74, height: 34 },
          domSnapshot: "<button id=\"save\">Submit</button>",
          source: {
            mode: "source",
            sourceId: "s_19cu8m6",
            file: "src/App.tsx",
            line: 25,
            column: 9,
            component: "App",
            framework: "react",
          },
        },
      },
    ],
  }
}

/** A valid payload whose only source data is a safe-mode `sourceId`. */
export function makeSafePayload(): AnnotationPayload {
  const payload = makeSourcePayload()
  payload.annotations[0].target.source = { mode: "safe", sourceId: "s_19cu8m6" }
  return payload
}

/** A manifest matching the `sourceId` used in the fixtures. */
export function makeManifest(): SourceManifest {
  return {
    s_19cu8m6: {
      sourceId: "s_19cu8m6",
      file: "src/App.tsx",
      line: 25,
      column: 9,
      component: "App",
      framework: "react",
      tag: "button",
    },
  }
}
