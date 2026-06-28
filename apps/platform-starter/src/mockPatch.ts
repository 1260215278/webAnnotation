import type { PatchPromptAnnotation } from "@web-annotation/node"
import type { PatchProposal, Task } from "./store"

/**
 * Locator for an annotation: the real source file when available, otherwise the
 * CSS path or selector as fallback context. Never reads disk.
 */
function locatorFor(annotation: PatchPromptAnnotation): string {
  const { source, target } = annotation
  if (source?.file) return source.file
  return target.cssPath || target.selector
}

/** A deterministic, readable mock unified-diff hunk for one annotation. */
function hunkFor(annotation: PatchPromptAnnotation): string {
  const { source, target } = annotation
  const locator = locatorFor(annotation)
  const position =
    source?.line !== undefined
      ? `${locator}:${source.line}${source.column !== undefined ? `:${source.column}` : ""}`
      : locator
  const component = source?.component ? ` (${source.component})` : ""
  const current = target.text
    ? `<${target.tagName}>${target.text}</${target.tagName}>`
    : `<${target.tagName} />`
  return [
    `--- a/${locator}`,
    `+++ b/${locator}`,
    `@@ ${position}${component} @@`,
    `- {/* current: ${current} */}`,
    `+ {/* web-annotation suggestion: ${annotation.message} */}`,
  ].join("\n")
}

/**
 * Build a deterministic, serializable mock patch proposal from a task's prompt
 * context. The only non-deterministic input is `createdAt`, supplied by the caller;
 * `summary`, `suggestedFiles`, and `diffPreview` depend solely on the task content.
 * No AI is called and no repository files are read.
 */
export function buildMockPatchProposal(task: Task, createdAt: string): PatchProposal {
  const annotations = task.promptContext.annotations
  const suggestedFiles = [...new Set(annotations.map(locatorFor))]
  const diffPreview = annotations.map(hunkFor).join("\n\n")
  const summary =
    annotations.length === 0
      ? "Mock patch: no annotations to propose changes for."
      : `Mock patch proposing ${annotations.length} change(s) across ${suggestedFiles.length} location(s) from annotation feedback.`

  return {
    id: `patch_${task.id.replace(/^task_/, "")}`,
    status: "proposed",
    createdAt,
    summary,
    suggestedFiles,
    diffPreview,
    promptContext: task.promptContext,
  }
}
