import { describe, expect, it } from "vitest"
import { buildPatchPromptContext } from "../src/index"
import { makeImageAttachment, makeSourcePayload } from "./fixtures"

describe("buildPatchPromptContext", () => {
  it("produces a deterministic, serializable summary", () => {
    const payload = makeSourcePayload()
    const a = buildPatchPromptContext(payload)
    const b = buildPatchPromptContext(payload)

    // Stable: same input → identical output.
    expect(a).toEqual(b)
    // Serializable: survives a JSON round-trip unchanged.
    expect(JSON.parse(JSON.stringify(a))).toEqual(a)
  })

  it("summarizes project, page, group, target, and source", () => {
    const context = buildPatchPromptContext(makeSourcePayload())
    expect(context.version).toBe("v1")
    expect(context.project).toEqual({ projectId: "web-console", environment: "staging" })
    expect(context.page).toEqual({
      url: "https://app.example.com/settings",
      route: "/settings",
      title: "Settings",
    })
    expect(context.annotationGroup).toEqual({ id: "group_1", mode: "single" })

    const annotation = context.annotations[0]
    expect(annotation.target).toMatchObject({
      selector: "[data-annotation-id='el_1']",
      tagName: "button",
      text: "Submit",
    })
    expect(annotation.source).toEqual({
      mode: "source",
      sourceId: "s_19cu8m6",
      file: "src/App.tsx",
      line: 25,
      column: 9,
      component: "App",
      framework: "react",
    })
  })

  it("caps the domSnapshot length", () => {
    const payload = makeSourcePayload()
    payload.annotations[0].target.domSnapshot = "x".repeat(5000)
    const context = buildPatchPromptContext(payload, { maxDomSnapshotLength: 100 })
    expect(context.annotations[0].target.domSnapshot).toHaveLength(100)
  })

  it("omits source when the target has none", () => {
    const payload = makeSourcePayload()
    delete payload.annotations[0].target.source
    const context = buildPatchPromptContext(payload)
    expect(context.annotations[0].source).toBeUndefined()
  })

  it("summarizes image attachments without raw content", () => {
    const payload = makeSourcePayload()
    payload.annotations[0].attachments = [makeImageAttachment()]
    const context = buildPatchPromptContext(payload)
    expect(context.annotations[0].attachments).toEqual([
      {
        id: "att_1",
        kind: "image",
        name: "screenshot.png",
        mimeType: "image/png",
        size: 20480,
        width: 800,
        height: 600,
        storage: {
          provider: "server",
          url: "https://cdn.example.com/uploads/att_1.png",
          objectKey: "uploads/att_1.png",
        },
      },
    ])
    // The host-only metadata is dropped from prompt context.
    expect(JSON.stringify(context)).not.toContain("uploadedBy")
  })

  it("omits attachments when the annotation has none", () => {
    const context = buildPatchPromptContext(makeSourcePayload())
    expect(context.annotations[0].attachments).toBeUndefined()
  })
})
