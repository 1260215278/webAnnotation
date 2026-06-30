import { describe, expect, it } from "vitest"
import { getRuntimeLabels, resolveAnnotationLocale } from "../src/i18n"

describe("runtime i18n", () => {
  it("keeps English and Chinese label keys in sync and non-empty", () => {
    const en = getRuntimeLabels("en")
    const zh = getRuntimeLabels("zh")
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    for (const value of Object.values(en)) {
      expect(typeof value === "string" && value.length > 0).toBe(true)
    }
    for (const value of Object.values(zh)) {
      expect(typeof value === "string" && value.length > 0).toBe(true)
    }
  })

  it("detects Chinese from navigator.language and respects an explicit override", () => {
    const zhWin = { navigator: { language: "zh-CN" } } as unknown as Window
    const enWin = { navigator: { language: "en-US" } } as unknown as Window
    expect(resolveAnnotationLocale(zhWin)).toBe("zh")
    expect(resolveAnnotationLocale(enWin)).toBe("en")
    expect(resolveAnnotationLocale(zhWin, "en")).toBe("en")
    expect(resolveAnnotationLocale(enWin, "zh")).toBe("zh")
  })

  it("keeps English labels equal to the SDK's original strings", () => {
    const en = getRuntimeLabels("en")
    expect(en.widgetEnable).toBe("Annotate")
    expect(en.widgetActive).toBe("Annotating…")
    expect(en.placeholder).toBe("Describe the change… (Enter to submit, Esc to cancel)")
    expect(en.hint).toBe("Enter submit · Shift+Enter newline · Esc cancel")
    expect(en.submitting).toBe("Submitting…")
  })
})
