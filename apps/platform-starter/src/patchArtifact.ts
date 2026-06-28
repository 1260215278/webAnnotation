import type { PatchPromptContext, RepoSourceContext } from "@web-annotation/node"
import type { PatchProposal, PatchReview, Task, TaskStatus } from "./store"

export const PATCH_ARTIFACT_VERSION = "web-annotation.patch-artifact.v1" as const

export interface PatchArtifactSafety {
  appliesPatch: false
  writesFiles: false
  requiresHumanReview: true
}

export interface PatchArtifact {
  version: typeof PATCH_ARTIFACT_VERSION
  exportedAt: string
  taskId: string
  taskStatus: TaskStatus
  project: PatchPromptContext["project"]
  page: PatchPromptContext["page"]
  annotations: PatchPromptContext["annotations"]
  sourceContext?: RepoSourceContext
  patchProposal: PatchProposal
  patchReview?: PatchReview
  safety: PatchArtifactSafety
}

export function createPatchArtifactSafety(): PatchArtifactSafety {
  return {
    appliesPatch: false,
    writesFiles: false,
    requiresHumanReview: true,
  }
}

/**
 * Build a serializable artifact for downstream CLI/Git/AI apply workflows.
 * The artifact is export-only: this helper never applies patches or writes files.
 */
export function buildPatchArtifact(task: Task, exportedAt: string): PatchArtifact {
  if (!task.patchProposal) {
    throw new Error("patch proposal does not exist")
  }

  const artifact: PatchArtifact = {
    version: PATCH_ARTIFACT_VERSION,
    exportedAt,
    taskId: task.id,
    taskStatus: task.status,
    project: task.promptContext.project,
    page: task.promptContext.page,
    annotations: task.promptContext.annotations,
    patchProposal: task.patchProposal,
    safety: createPatchArtifactSafety(),
  }
  if (task.sourceContext) artifact.sourceContext = task.sourceContext
  if (task.patchReview) artifact.patchReview = task.patchReview
  return artifact
}
