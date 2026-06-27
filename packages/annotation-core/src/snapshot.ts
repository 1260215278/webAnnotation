/**
 * Basic DOM snapshot sanitization.
 *
 * The goal is to capture enough structure for downstream tooling without
 * leaking scripts, styles, inline event handlers, or user-typed input values.
 * This is intentionally conservative; richer sanitization is a planned follow-up.
 */

const STRIP_TAGS = ["script", "style", "noscript", "template", "iframe", "object", "embed"]
const FORM_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"])

function sanitizeElement(node: Element): void {
  for (const attr of Array.from(node.attributes)) {
    const name = attr.name.toLowerCase()
    // Drop inline event handlers (onclick, onload, ...).
    if (name.startsWith("on")) {
      node.removeAttribute(attr.name)
    }
  }

  // Never carry user-entered values out of the page.
  if (FORM_TAGS.has(node.tagName)) {
    if (node.hasAttribute("value")) {
      node.setAttribute("value", "")
    }
  }
}

export function sanitizeDomSnapshot(el: Element, maxLength = 2000): string {
  if (el.nodeType !== 1) return ""

  const clone = el.cloneNode(true) as Element

  for (const tag of STRIP_TAGS) {
    clone.querySelectorAll(tag).forEach((node) => node.remove())
  }

  sanitizeElement(clone)
  clone.querySelectorAll("*").forEach((node) => sanitizeElement(node))

  const html = clone.outerHTML
  return html.length > maxLength ? `${html.slice(0, maxLength)}…` : html
}
