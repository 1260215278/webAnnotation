import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"
import { createTaskStore, handlePlatformRequest } from "../src/index"
import type { PlatformResponse, TaskStore } from "../src/index"
import { makeManifest, makeSafePayload, makeSourcePayload } from "./fixtures"

let store: TaskStore
const viteReactRoot = fileURLToPath(new URL("../../../examples/vite-react", import.meta.url))

beforeEach(() => {
  store = createTaskStore()
})

type TestRuntimeOptions = {
  repoRoot?: string
  sourceContext?: {
    contextLines?: number
    maxFiles?: number
    maxBytesPerFile?: number
  }
}

function request(
  method: string,
  path: string,
  body?: unknown,
  options?: TestRuntimeOptions,
): Promise<PlatformResponse> {
  const requestHandler = handlePlatformRequest as (
    input: { method: string; path: string; body?: unknown },
    store: TaskStore,
    options?: TestRuntimeOptions,
  ) => Promise<PlatformResponse>
  return requestHandler({ method, path, body }, store, options)
}

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await request("GET", "/health")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})

describe("task console", () => {
  it("serves HTML at / and /console", async () => {
    for (const path of ["/", "/console"]) {
      const res = await request("GET", path)
      expect(res.status).toBe(200)
      expect(res.contentType).toBe("text/html; charset=utf-8")
      expect(typeof res.body).toBe("string")
      expect(res.body as string).toContain('id="console-root"')
    }
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

async function createTask(body: unknown = makeSourcePayload()): Promise<string> {
  const res = await request("POST", "/api/annotations", body)
  return (res.body as { taskId: string }).taskId
}

describe("POST /api/tasks/:id/mock-patch", () => {
  it("proposes a mock patch and moves the task to patch_proposed", async () => {
    const taskId = await createTask()
    const res = await request("POST", `/api/tasks/${taskId}/mock-patch`)
    expect(res.status).toBe(201)
    const body = res.body as {
      taskId: string
      status: string
      patchProposal: { id: string; status: string; suggestedFiles: string[] }
    }
    expect(body.status).toBe("patch_proposed")
    expect(body.patchProposal.status).toBe("proposed")
    expect(body.patchProposal.suggestedFiles).toContain("src/App.tsx")
  })

  it("is idempotent: repeating the call returns the same proposal", async () => {
    const taskId = await createTask()
    const first = await request("POST", `/api/tasks/${taskId}/mock-patch`)
    const second = await request("POST", `/api/tasks/${taskId}/mock-patch`)
    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    const firstProposal = (first.body as { patchProposal: { id: string } }).patchProposal
    const secondProposal = (second.body as { patchProposal: { id: string } }).patchProposal
    expect(secondProposal).toEqual(firstProposal)
  })

  it("returns 404 for an unknown task", async () => {
    const res = await request("POST", "/api/tasks/task_missing/mock-patch")
    expect(res.status).toBe(404)
    expect((res.body as { error: string }).error).toBe("task not found")
  })

  it("resolves safe-mode source files via the manifest into the proposal", async () => {
    const taskId = await createTask({ payload: makeSafePayload(), manifest: makeManifest() })
    const res = await request("POST", `/api/tasks/${taskId}/mock-patch`)
    expect(res.status).toBe(201)
    const { patchProposal } = res.body as { patchProposal: { suggestedFiles: string[] } }
    expect(patchProposal.suggestedFiles).toContain("src/App.tsx")
  })

  it("generates a fallback proposal for tasks without source metadata", async () => {
    const payload = makeSourcePayload()
    delete payload.annotations[0].target.source
    const taskId = await createTask(payload)
    const res = await request("POST", `/api/tasks/${taskId}/mock-patch`)
    expect(res.status).toBe(201)
    const { patchProposal } = res.body as { patchProposal: { suggestedFiles: string[] } }
    expect(patchProposal.suggestedFiles).toContain("#save")
  })
})

describe("POST /api/tasks/:id/source-context", () => {
  it("returns a readable error when repoRoot is not configured", async () => {
    const taskId = await createTask()
    const res = await request("POST", `/api/tasks/${taskId}/source-context`)
    expect(res.status).toBe(409)
    expect((res.body as { error: string }).error).toBe("repo root is not configured")
  })

  it("collects source context, stores it on the task, and exposes summary counts", async () => {
    const taskId = await createTask()
    const res = await request("POST", `/api/tasks/${taskId}/source-context`, undefined, {
      repoRoot: viteReactRoot,
      sourceContext: { contextLines: 1 },
    })

    expect(res.status).toBe(201)
    const body = res.body as {
      taskId: string
      sourceContext: {
        files: { file: string; startLine: number; endLine: number; content: string }[]
        issues: unknown[]
      }
    }
    expect(body.taskId).toBe(taskId)
    expect(body.sourceContext.files[0]).toMatchObject({
      file: "src/App.tsx",
      startLine: 24,
      endLine: 26,
    })
    expect(body.sourceContext.files[0].content).toContain('<button type="button">Submit</button>')
    expect(JSON.stringify(body.sourceContext)).not.toContain(viteReactRoot)

    const detail = await request("GET", `/api/tasks/${taskId}`)
    expect(detail.status).toBe(200)
    const detailTask = (detail.body as { task: { sourceContext?: unknown } }).task
    expect(detailTask.sourceContext).toEqual(body.sourceContext)

    const list = await request("GET", "/api/tasks")
    const summary = (
      list.body as {
        tasks: {
          id: string
          sourceContextStatus?: string
          sourceFileCount?: number
          sourceIssueCount?: number
        }[]
      }
    ).tasks[0]
    expect(summary).toMatchObject({
      id: taskId,
      sourceContextStatus: "collected",
      sourceFileCount: 1,
      sourceIssueCount: 0,
    })
  })

  it("returns 200 and refreshes the stored source context on repeat calls", async () => {
    const taskId = await createTask()
    const first = await request("POST", `/api/tasks/${taskId}/source-context`, undefined, {
      repoRoot: viteReactRoot,
    })
    const second = await request("POST", `/api/tasks/${taskId}/source-context`, undefined, {
      repoRoot: viteReactRoot,
    })
    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect((second.body as { sourceContext: unknown }).sourceContext).toEqual(
      (first.body as { sourceContext: unknown }).sourceContext,
    )
  })

  it("returns 404 for an unknown task", async () => {
    const res = await request("POST", "/api/tasks/task_missing/source-context", undefined, {
      repoRoot: viteReactRoot,
    })
    expect(res.status).toBe(404)
    expect((res.body as { error: string }).error).toBe("task not found")
  })

  it("stores Node Kit issues for unsafe source paths without leaking absolute paths", async () => {
    const payload = makeSourcePayload()
    payload.annotations[0].target.source = {
      mode: "source",
      sourceId: "s_19cu8m6",
      file: "../package.json",
      line: 25,
      column: 9,
      component: "App",
      framework: "react",
    }
    const taskId = await createTask(payload)
    const res = await request("POST", `/api/tasks/${taskId}/source-context`, undefined, {
      repoRoot: viteReactRoot,
    })

    expect(res.status).toBe(201)
    const serialized = JSON.stringify(res.body)
    expect(serialized).toContain("path_escape")
    expect(serialized).not.toContain(viteReactRoot)
    const sourceContext = (res.body as {
      sourceContext: { files: unknown[]; issues: { code: string; file?: string }[] }
    }).sourceContext
    expect(sourceContext.files).toEqual([])
    expect(sourceContext.issues[0]).toMatchObject({
      code: "path_escape",
      file: "../package.json",
    })
  })
})

describe("task views expose the proposal", () => {
  it("shows patchProposalId in the summary and the proposal in detail", async () => {
    const taskId = await createTask()
    await request("POST", `/api/tasks/${taskId}/mock-patch`)

    const list = await request("GET", "/api/tasks")
    const summary = (list.body as { tasks: { id: string; status: string; patchProposalId?: string }[] })
      .tasks[0]
    expect(summary.status).toBe("patch_proposed")
    expect(summary.patchProposalId).toBe(`patch_${taskId.replace(/^task_/, "")}`)

    const detail = await request("GET", `/api/tasks/${taskId}`)
    const { task } = detail.body as {
      task: { status: string; patchProposal?: { id: string; diffPreview: string } }
    }
    expect(task.status).toBe("patch_proposed")
    expect(task.patchProposal?.diffPreview).toContain("web-annotation suggestion")
  })
})
