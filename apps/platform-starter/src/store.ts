import type { AnnotationPayload } from "@web-annotation/core"
import type { PatchPromptContext } from "@web-annotation/node"

/** Lifecycle status of an ingested annotation task. Only one state in this MVP. */
export type TaskStatus = "received"

export interface Task {
  id: string
  status: TaskStatus
  createdAt: string
  /** The validated (and, in safe mode, source-resolved) payload. */
  payload: AnnotationPayload
  /** Deterministic AI patch prompt context derived from the payload. */
  promptContext: PatchPromptContext
}

/** Compact listing shape returned by `GET /api/tasks`. */
export interface TaskSummary {
  id: string
  status: TaskStatus
  createdAt: string
  projectId: string
  route: string
  annotationCount: number
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
  return {
    id: task.id,
    status: task.status,
    createdAt: task.createdAt,
    projectId: task.payload.project.projectId,
    route: task.payload.page.route,
    annotationCount: task.payload.annotations.length,
  }
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
