import { beforeEach, describe, expect, it } from "vitest"
import { createTaskStore, handlePlatformRequest } from "../src/index"
import type { PlatformResponse, TaskStore } from "../src/index"
import { makeManifest, makeSafePayload, makeSourcePayload } from "./fixtures"

let store: TaskStore

beforeEach(() => {
  store = createTaskStore()
})

function request(method: string, path: string, body?: unknown): Promise<PlatformResponse> {
  return handlePlatformRequest({ method, path, body }, store)
}

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await request("GET", "/health")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})

describe("POST /api/annotations", () => {
  it("accepts a valid payload and returns 201 with a taskId", async () => {
    const res = await request("POST", "/api/annotations", makeSourcePayload())
    expect(res.status).toBe(201)
    const body = res.body as { taskId: string; status: string }
    expect(body.status).toBe("received")
    expect(body.taskId).toMatch(/^task_/)
  })

  it("rejects an invalid payload with 400 and readable issues", async () => {
    const res = await request("POST", "/api/annotations", {})
    expect(res.status).toBe(400)
    const body = res.body as { error: string; issues: { path: string }[] }
    expect(body.error).toBe("invalid payload")
    expect(body.issues.length).toBeGreaterThan(0)
    expect(body.issues.map((issue) => issue.path)).toContain("annotations")
  })

  it("resolves safe-mode sources from a manifest into the prompt context", async () => {
    const res = await request("POST", "/api/annotations", {
      payload: makeSafePayload(),
      manifest: makeManifest(),
    })
    expect(res.status).toBe(201)
    const { taskId } = res.body as { taskId: string }

    const detail = await request("GET", `/api/tasks/${taskId}`)
    expect(detail.status).toBe(200)
    const { task } = detail.body as {
      task: {
        promptContext: { annotations: { source?: { file?: string; line?: number } }[] }
        payload: { annotations: { target: { source?: { file?: string } } }[] }
      }
    }
    expect(task.promptContext.annotations[0].source).toMatchObject({
      file: "src/App.tsx",
      line: 25,
    })
    expect(task.payload.annotations[0].target.source?.file).toBe("src/App.tsx")
  })

  it("rejects an invalid manifest with 400", async () => {
    const res = await request("POST", "/api/annotations", {
      payload: makeSafePayload(),
      manifest: { s_19cu8m6: { sourceId: "s_19cu8m6" } },
    })
    expect(res.status).toBe(400)
    const body = res.body as { error: string }
    expect(body.error).toBe("invalid manifest")
  })
})

describe("GET /api/tasks", () => {
  it("lists task summaries", async () => {
    await request("POST", "/api/annotations", makeSourcePayload())
    const res = await request("GET", "/api/tasks")
    expect(res.status).toBe(200)
    const { tasks } = res.body as {
      tasks: { id: string; projectId: string; annotationCount: number }[]
    }
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ projectId: "web-console", annotationCount: 1 })
  })
})

describe("GET /api/tasks/:id", () => {
  it("returns task detail for an existing task", async () => {
    const create = await request("POST", "/api/annotations", makeSourcePayload())
    const { taskId } = create.body as { taskId: string }

    const res = await request("GET", `/api/tasks/${taskId}`)
    expect(res.status).toBe(200)
    const { task } = res.body as { task: { id: string; status: string } }
    expect(task.id).toBe(taskId)
    expect(task.status).toBe("received")
  })

  it("returns 404 for an unknown task", async () => {
    const res = await request("GET", "/api/tasks/task_missing")
    expect(res.status).toBe(404)
    const body = res.body as { error: string }
    expect(body.error).toBe("task not found")
  })
})
