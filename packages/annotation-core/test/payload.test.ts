import { describe, expect, it } from "vitest"
import {
  buildAnnotationItem,
  buildAnnotationPayload,
  buildPageInfo,
} from "../src/payload"
import type { AnnotationImageAttachment, AnnotationTarget } from "../src/types"

const target: AnnotationTarget = {
  selector: "[data-annotation-id='el_test']",
  cssPath: "body > button",
  tagName: "button",
  text: "Submit",
  rect: { x: 10, y: 20, width: 80, height: 32 },
  domSnapshot: "<button>Submit</button>",
}

describe("buildAnnotationItem", () => {
  it("uses provided id and timestamp deterministically", () => {
    const item = buildAnnotationItem({
      message: "Change text to Save",
      target,
      id: "anno_fixed",
      createdAt: "2026-06-28T00:00:00.000Z",
    })

    expect(item).toEqual({
      id: "anno_fixed",
      message: "Change text to Save",
      target,
      createdAt: "2026-06-28T00:00:00.000Z",
    })
  })

  it("generates an id when none is provided", () => {
    const item = buildAnnotationItem({ message: "hi", target })
    expect(item.id).toMatch(/^anno_/)
    expect(item.createdAt).toEqual(expect.any(String))
  })

  it("includes attachments when provided", () => {
    const attachment: AnnotationImageAttachment = {
      id: "att_1",
      kind: "image",
      name: "shot.png",
      mimeType: "image/png",
      size: 1024,
      storage: { provider: "server", url: "https://cdn/x.png" },
    }
    const item = buildAnnotationItem({
      message: "see image",
      target,
      attachments: [attachment],
      id: "anno_fixed",
      createdAt: "2026-06-28T00:00:00.000Z",
    })
    expect(item.attachments).toEqual([attachment])
  })

  it("omits the attachments field when none are provided or the list is empty", () => {
    const withNone = buildAnnotationItem({ message: "hi", target, id: "a", createdAt: "t" })
    expect("attachments" in withNone).toBe(false)

    const withEmpty = buildAnnotationItem({
      message: "hi",
      target,
      attachments: [],
      id: "a",
      createdAt: "t",
    })
    expect("attachments" in withEmpty).toBe(false)
  })
})

describe("buildAnnotationPayload", () => {
  it("builds a v1 payload with single mode and given group id", () => {
    const item = buildAnnotationItem({
      message: "Change text to Save",
      target,
      id: "anno_fixed",
      createdAt: "2026-06-28T00:00:00.000Z",
    })

    const payload = buildAnnotationPayload({
      project: { projectId: "web-console", environment: "staging" },
      page: {
        url: "https://app.example.com/settings",
        route: "/settings",
        title: "Settings",
        viewport: { width: 1440, height: 900 },
      },
      annotations: [item],
      groupId: "group_fixed",
    })

    expect(payload).toEqual({
      version: "v1",
      project: { projectId: "web-console", environment: "staging" },
      page: {
        url: "https://app.example.com/settings",
        route: "/settings",
        title: "Settings",
        viewport: { width: 1440, height: 900 },
      },
      annotationGroup: { id: "group_fixed", mode: "single" },
      annotations: [item],
    })
  })

  it("generates a group id when none is provided", () => {
    const payload = buildAnnotationPayload({
      project: { projectId: "p" },
      page: {
        url: "https://x/",
        route: "/",
        title: "x",
        viewport: { width: 1, height: 1 },
      },
      annotations: [],
    })
    expect(payload.annotationGroup.id).toMatch(/^group_/)
    expect(payload.annotationGroup.mode).toBe("single")
    expect(payload.version).toBe("v1")
  })
})

describe("buildPageInfo", () => {
  it("reads url, route, title and viewport from the window", () => {
    const page = buildPageInfo(window)
    expect(page.url).toBe(window.location.href)
    expect(page.route).toBe(window.location.pathname)
    expect(page.title).toBe(window.document.title)
    expect(page.viewport).toEqual({
      width: window.innerWidth,
      height: window.innerHeight,
    })
  })
})
