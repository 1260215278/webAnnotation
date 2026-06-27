export const ANNOTATION_ID_ATTR = "data-annotation-id"

/** Marks SDK-owned UI so the annotator can ignore its own elements. */
export const ANNOTATION_UI_ATTR = "data-annotation-ui"

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value)
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
}

/** Ensure the element carries a stable annotation id, returning it. */
export function ensureAnnotationId(el: Element, id: string): string {
  const existing = el.getAttribute(ANNOTATION_ID_ATTR)
  if (existing) return existing
  el.setAttribute(ANNOTATION_ID_ATTR, id)
  return id
}

/** Build the stable selector for a target, injecting the id attribute if needed. */
export function buildSelector(el: Element, id: string): string {
  const annotationId = ensureAnnotationId(el, id)
  return `[${ANNOTATION_ID_ATTR}='${annotationId}']`
}

/**
 * Build a readable CSS path as a fallback locator. Stops at the first ancestor
 * with an id, and caps depth so the path stays compact.
 */
export function buildCssPath(el: Element): string {
  const parts: string[] = []
  let node: Element | null = el
  const maxDepth = 6

  while (node && node.nodeType === 1 && parts.length < maxDepth) {
    if (node.id) {
      parts.unshift(`#${cssEscape(node.id)}`)
      break
    }

    let part = node.tagName.toLowerCase()
    const parent: Element | null = node.parentElement
    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (child) => child.tagName === node!.tagName,
      )
      if (sameTag.length > 1) {
        part += `:nth-of-type(${sameTag.indexOf(node) + 1})`
      }
    }

    parts.unshift(part)
    node = node.parentElement
  }

  return parts.join(" > ")
}
