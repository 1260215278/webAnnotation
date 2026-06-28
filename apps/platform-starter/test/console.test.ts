import { describe, expect, it } from "vitest"
import { CONSOLE_MESSAGES, renderConsoleHtml } from "../src/console"

describe("renderConsoleHtml", () => {
  it("returns a complete HTML document with the console root and API wiring", () => {
    const html = renderConsoleHtml()
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true)
    expect(html).toContain('id="console-root"')
    expect(html).toContain('id="task-list"')
    expect(html).toContain('id="task-detail"')
    // Wires the existing JSON API and the mock-patch action.
    expect(html).toContain("/api/tasks")
    expect(html).toContain("/patch")
    expect(html).toContain("/mock-patch")
    expect(html).toContain("/source-context")
    expect(html).toContain("/patch-review")
    expect(html).toContain("Accept")
    expect(html).toContain("接受")
    expect(html).toContain("Reject")
    expect(html).toContain("拒绝")
    expect(html).toContain("Request changes")
    expect(html).toContain("要求修改")
    expect(html).toContain("Generate AI patch")
    expect(html).toContain("生成 AI patch")
    expect(html).toContain("Generate mock patch")
    expect(html).toContain("生成 mock patch")
    expect(html).toContain("Collect source context")
    expect(html).toContain("收集源码上下文")
    expect(html).toContain("Source context")
    expect(html).toContain("源码上下文")
    expect(html).toContain("Refresh")
    expect(html).toContain("刷新")
    expect(html).toContain("中文")
    expect(html).toContain("English")
    expect(html).toContain("localStorage")
  })

  it("is deterministic", () => {
    expect(renderConsoleHtml()).toBe(renderConsoleHtml())
  })

  it("keeps English and Chinese dictionaries in sync", () => {
    expect(Object.keys(CONSOLE_MESSAGES.zh).sort()).toEqual(Object.keys(CONSOLE_MESSAGES.en).sort())
  })
})
