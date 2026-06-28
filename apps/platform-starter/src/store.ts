import type { AnnotationPayload } from "@web-annotation/core"
import type { PatchPromptContext, RepoSourceContext } from "@web-annotation/node"

/** Lifecycle status of an ingested annotation task. */
export type TaskStatus = "received" | "patch_proposed"

/** Status of a mock patch proposal. Only one state in this MVP. */
export type PatchProposalStatus = "proposed"

/** Compact state of repository source context collection for task listings. */
export type SourceContextStatus = "not_collected" | "collected" | "issues"

/**
 * A mock, non-applyable patch suggestion derived deterministically from a task's
 * prompt context. It stands in for the future AI patch step; no AI is called and no
 * repository files are read.
 */
export interface PatchProposal {
  id: string
  status: PatchProposalStatus
  createdAt: string
  /** Human-readable one-line description of the proposed change set. */
  summary: string
  /** Source files (or selector/cssPath fallbacks) the change would touch. */
  suggestedFiles: string[]
  /** Deterministic, readable mock unified diff. Not guaranteed to apply. */
  diffPreview: string
  /** The prompt context the proposal was built from. */
  promptContext: PatchPromptContext
  /** Optional provider-specific metadata; never required by platform logic. */
  metadata?: Record<string, unknown>
}

export interface Task {
  id: string
  status: TaskStatus
  createdAt: string
  /** The validated (and, in safe mode, source-resolved) payload. */
  payload: AnnotationPayload
  /** Deterministic AI patch prompt context derived from the payload. */
  promptContext: PatchPromptContext
  /** Present once repository source snippets have been collected for this task. */
  sourceContext?: RepoSourceContext
  /** Present once a mock patch has been proposed for this task. */
  patchProposal?: PatchProposal
}

/** Compact listing shape returned by `GET /api/tasks`. */
export interface TaskSummary {
  id: string
  status: TaskStatus
  createdAt: string
  projectId: string
  route: string
  annotationCount: number
  sourceContextStatus: SourceContextStatus
  sourceFileCount: number
  sourceIssueCount: number
  /** Present once a patch proposal exists. */
  patchProposalId?: string
}

/**
 * Task storage abstraction. The MVP ships an in-memory implementation; a
 * persistent store can implement the same interface without touching the server.
 */
export interface TaskStore {
  add: (task: Task) => void
  get: (id: string) => Task | undefined
  list: () => TaskSummary[]
  readonly size: number
}

function toSummary(task: Task): TaskSummary {
  const sourceFileCount = task.sourceContext?.files.length ?? 0
  const sourceIssueCount = task.sourceContext?.issues.length ?? 0
  const summary: TaskSummary = {
    id: task.id,
    status: task.status,
    createdAt: task.createdAt,
    projectId: task.payload.project.projectId,
    route: task.payload.page.route,
    annotationCount: task.payload.annotations.length,
    sourceContextStatus: task.sourceContext
      ? sourceIssueCount > 0
        ? "issues"
        : "collected"
      : "not_collected",
    sourceFileCount,
    sourceIssueCount,
  }
  if (task.patchProposal) summary.patchProposalId = task.patchProposal.id
  return summary
}

/** In-memory `TaskStore` preserving insertion order. */
export function createTaskStore(): TaskStore {
  const tasks = new Map<string, Task>()
  return {
    add(task) {
      tasks.set(task.id, task)
    },
    get(id) {
      return tasks.get(id)
    },
    list() {
      return [...tasks.values()].map(toSummary)
    },
    get size() {
      return tasks.size
    },
  }
}
