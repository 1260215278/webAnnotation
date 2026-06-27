import { describe, expect, it } from "vitest"
import { buildSelector, buildCssPath, ANNOTATION_ID_ATTR } from "../src/selector"
import { sanitizeDomSnapshot } from "../src/snapshot"

describe("buildSelector", () => {
  it("injects a stable annotation id and returns a matching selector", () => {
    document.body.innerHTML = `<div><button>Save</button></div>`
    const button = document.querySelector("button")!

    const selector = buildSelector(button, "el_abc")

    expect(button.getAttribute(ANNOTATION_ID_ATTR)).toBe("el_abc")
    expect(selector).toBe(`[${ANNOTATION_ID_ATTR}='el_abc']`)
    expect(document.querySelector(selector)).toBe(button)
  })

  it("does not overwrite an existing annotation id", () => {
    document.body.innerHTML = `<span ${ANNOTATION_ID_ATTR}="el_keep">x</span>`
    const span = document.querySelector("span")!

    const selector = buildSelector(span, "el_new")

    expect(span.getAttribute(ANNOTATION_ID_ATTR)).toBe("el_keep")
    expect(selector).toBe(`[${ANNOTATION_ID_ATTR}='el_keep']`)
  })
})

describe("buildCssPath", () => {
  it("anchors at the nearest ancestor with an id", () => {
    document.body.innerHTML = `
      <section id="panel">
        <ul><li>a</li><li>b</li><li>c</li></ul>
      </section>`
    const third = document.querySelectorAll("li")[2]!

    expect(buildCssPath(third)).toBe("#panel > ul > li:nth-of-type(3)")
  })
})

describe("sanitizeDomSnapshot", () => {
  it("strips scripts, inline handlers and input values", () => {
    document.body.innerHTML = `
      <form>
        <input type="text" value="secret-typed-value" />
        <button onclick="steal()">Go</button>
        <script>doEvil()</script>
      </form>`
    const form = document.querySelector("form")!

    const html = sanitizeDomSnapshot(form)

    expect(html).not.toContain("<script")
    expect(html).not.toContain("onclick")
    expect(html).not.toContain("secret-typed-value")
    expect(html).toContain("<button")
  })

  it("truncates output beyond maxLength", () => {
    document.body.innerHTML = `<p>${"x".repeat(50)}</p>`
    const p = document.querySelector("p")!

    const html = sanitizeDomSnapshot(p, 20)

    expect(html.length).toBeLessThanOrEqual(21) // 20 chars + ellipsis
    expect(html.endsWith("…")).toBe(true)
  })
})
