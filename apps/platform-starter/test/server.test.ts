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
  patchProvider?: {
    generatePatch: (input: {
      task: unknown
      promptContext: unknown
      sourceContext?: { files: { file: string }[]; issues: unknown[] }
    }) =>
      | {
          summary: string
          suggestedFiles: string[]
          diffPreview: string
          metadata?: Record<string, unknown>
        }
      | Promise<{
          summary: string
          suggestedFiles: string[]
          diffPreview: string
          metadata?: Record<string, unknown>
        }>
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

describe("POST /api/tasks/:id/patch", () => {
  it("returns a readable error when patchProvider is not configured", async () => {
    const taskId = await createTask()
    const res = await request("POST", `/api/tasks/${taskId}/patch`)
    expect(res.status).toBe(409)
    expect((res.body as { error: string }).error).toBe("patch provider is not configured")
  })

  it("uses the configured provider and passes source context into the provider input", async () => {
    const taskId = await createTask()
    await request("POST", `/api/tasks/${taskId}/source-context`, undefined, {
      repoRoot: viteReactRoot,
    })
    let providerSourceFile = ""
    const res = await request("POST", `/api/tasks/${taskId}/patch`, undefined, {
      patchProvider: {
        generatePatch(input) {
          providerSourceFile = input.sourceContext?.files[0]?.file ?? ""
          return {
            summary: "AI patch: update the submit button copy.",
            suggestedFiles: ["src/App.tsx"],
            diffPreview: "--- a/src/App.tsx\n+++ b/src/App.tsx\n@@\n- Submit\n+ Save settings",
            metadata: { provider: "test" },
          }
        },
      },
    })

    expect(res.status).toBe(201)
    expect(providerSourceFile).toBe("src/App.tsx")
    const body = res.body as {
      taskId: string
      status: string
      patchProposal: { summary: string; suggestedFiles: string[]; metadata?: Record<string, unknown> }
    }
    expect(body.taskId).toBe(taskId)
    expect(body.status).toBe("patch_proposed")
    expect(body.patchProposal.summary).toContain("AI patch")
    expect(body.patchProposal.suggestedFiles).toEqual(["src/App.tsx"])
    expect(body.patchProposal.metadata).toEqual({ provider: "test" })

    const detail = await request("GET", `/api/tasks/${taskId}`)
    const { task } = detail.body as { task: { status: string; patchProposal?: { summary: string } } }
    expect(task.status).toBe("patch_proposed")
    expect(task.patchProposal?.summary).toContain("AI patch")
  })

  it("is idempotent and does not call the provider again for an existing proposal", async () => {
    const taskId = await createTask()
    let callCount = 0
    const options: TestRuntimeOptions = {
      patchProvider: {
        generatePatch() {
          callCount += 1
          return {
            summary: `AI patch call ${callCount}`,
            suggestedFiles: ["src/App.tsx"],
            diffPreview: "provider diff",
          }
        },
      },
    }

    const first = await request("POST", `/api/tasks/${taskId}/patch`, undefined, options)
    const second = await request("POST", `/api/tasks/${taskId}/patch`, undefined, options)
    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(callCount).toBe(1)
    expect((second.body as { patchProposal: unknown }).patchProposal).toEqual(
      (first.body as { patchProposal: unknown }).patchProposal,
    )
  })

  it("returns a readable error when the provider fails and leaves the task unmodified", async () => {
    const taskId = await createTask()
    const res = await request("POST", `/api/tasks/${taskId}/patch`, undefined, {
      patchProvider: {
        generatePatch() {
          throw new Error("model timeout")
        },
      },
    })

    expect(res.status).toBe(502)
    expect((res.body as { error: string; message: string }).error).toBe("patch provider failed")
    expect((res.body as { error: string; message: string }).message).toBe("model timeout")
    const detail = await request("GET", `/api/tasks/${taskId}`)
    const { task } = detail.body as { task: { status: string; patchProposal?: unknown } }
    expect(task.status).toBe("received")
    expect(task.patchProposal).toBeUndefined()
  })

  it("returns 404 for an unknown task", async () => {
    const res = await request("POST", "/api/tasks/task_missing/patch", undefined, {
      patchProvider: {
        generatePatch() {
          return { summary: "unused", suggestedFiles: [], diffPreview: "" }
        },
      },
    })
    expect(res.status).toBe(404)
    expect((res.body as { error: string }).error).toBe("task not found")
  })
})

describe("POST /api/tasks/:id/patch-review", () => {
  async function createReviewableTask(): Promise<string> {
    const taskId = await createTask()
    await request("POST", `/api/tasks/${taskId}/mock-patch`)
    return taskId
  }

  it("returns 404 for an unknown task", async () => {
    const res = await request("POST", "/api/tasks/task_missing/patch-review", {
      decision: "accept",
    })
    expect(res.status).toBe(404)
    expect((res.body as { error: string }).error).toBe("task not found")
  })

  it("returns 409 when the task has no patch proposal", async () => {
    const taskId = await createTask()
    const res = await request("POST", `/api/tasks/${taskId}/patch-review`, { decision: "accept" })
    expect(res.status).toBe(409)
    expect((res.body as { error: string }).error).toBe("patch proposal does not exist")
  })

  it("returns 400 for an invalid decision", async () => {
    const taskId = await createReviewableTask()
    const res = await request("POST", `/api/tasks/${taskId}/patch-review`, { decision: "approve" })
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toBe("invalid decision")
  })

  it("returns 400 when the decision is missing", async () => {
    const taskId = await createReviewableTask()
    const res = await request("POST", `/api/tasks/${taskId}/patch-review`, {})
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toBe("invalid decision")
  })

  it("accepts a proposal and moves the task to patch_accepted", async () => {
    const taskId = await createReviewableTask()
    const res = await request("POST", `/api/tasks/${taskId}/patch-review`, {
      decision: "accept",
      reviewer: "alice",
      note: "looks good",
    })
    expect(res.status).toBe(200)
    const body = res.body as {
      taskId: string
      status: string
      patchReview: { status: string; reviewer?: string; note?: string; decidedAt: string }
    }
    expect(body.taskId).toBe(taskId)
    expect(body.status).toBe("patch_accepted")
    expect(body.patchReview.status).toBe("accepted")
    expect(body.patchReview.reviewer).toBe("alice")
    expect(body.patchReview.note).toBe("looks good")
    expect(typeof body.patchReview.decidedAt).toBe("string")
  })

  it("rejects a proposal and moves the task to patch_rejected", async () => {
    const taskId = await createReviewableTask()
    const res = await request("POST", `/api/tasks/${taskId}/patch-review`, { decision: "reject" })
    expect(res.status).toBe(200)
    expect((res.body as { status: string }).status).toBe("patch_rejected")
    expect((res.body as { patchReview: { status: string } }).patchReview.status).toBe("rejected")
  })

  it("records a changes_requested decision", async () => {
    const taskId = await createReviewableTask()
    const res = await request("POST", `/api/tasks/${taskId}/patch-review`, {
      decision: "changes_requested",
    })
    expect(res.status).toBe(200)
    expect((res.body as { status: string }).status).toBe("changes_requested")
    expect((res.body as { patchReview: { status: string } }).patchReview.status).toBe(
      "changes_requested",
    )
  })

  it("overrides an earlier review on a repeat call", async () => {
    const taskId = await createReviewableTask()
    const first = await request("POST", `/api/tasks/${taskId}/patch-review`, { decision: "accept" })
    const second = await request("POST", `/api/tasks/${taskId}/patch-review`, {
      decision: "reject",
      note: "changed my mind",
    })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    const detail = await request("GET", `/api/tasks/${taskId}`)
    const { task } = detail.body as {
      task: { status: string; patchReview?: { status: string; note?: string } }
    }
    expect(task.status).toBe("patch_rejected")
    expect(task.patchReview?.status).toBe("rejected")
    expect(task.patchReview?.note).toBe("changed my mind")
  })

  it("exposes review status in the task summary", async () => {
    const taskId = await createReviewableTask()
    await request("POST", `/api/tasks/${taskId}/patch-review`, { decision: "accept" })
    const list = await request("GET", "/api/tasks")
    const summary = (
      list.body as { tasks: { id: string; status: string; patchReviewStatus?: string }[] }
    ).tasks[0]
    expect(summary.status).toBe("patch_accepted")
    expect(summary.patchReviewStatus).toBe("accepted")
  })
})

describe("GET /api/tasks/:id/patch-artifact", () => {
  it("returns 404 for an unknown task", async () => {
    const res = await request("GET", "/api/tasks/task_missing/patch-artifact")
    expect(res.status).toBe(404)
    expect((res.body as { error: string }).error).toBe("task not found")
  })

  it("returns 409 when the task has no patch proposal", async () => {
    const taskId = await createTask()
    const res = await request("GET", `/api/tasks/${taskId}/patch-artifact`)
    expect(res.status).toBe(409)
    expect((res.body as { error: string }).error).toBe("patch proposal does not exist")
  })

  it("exports a proposal artifact without applying or writing files", async () => {
    const taskId = await createTask()
    const proposal = await request("POST", `/api/tasks/${taskId}/mock-patch`)
    const res = await request("GET", `/api/tasks/${taskId}/patch-artifact`)

    expect(proposal.status).toBe(201)
    expect(res.status).toBe(200)
    const { artifact } = res.body as {
      artifact: {
        version: string
        exportedAt: string
        taskId: string
        taskStatus: string
        project: { projectId: string }
        page: { route: string }
        annotations: unknown[]
        patchProposal: { id: string }
        safety: {
          appliesPatch: boolean
          writesFiles: boolean
          requiresHumanReview: boolean
        }
      }
    }
    expect(artifact.version).toBe("web-annotation.patch-artifact.v1")
    expect(typeof artifact.exportedAt).toBe("string")
    expect(artifact.taskId).toBe(taskId)
    expect(artifact.taskStatus).toBe("patch_proposed")
    expect(artifact.project.projectId).toBe("web-console")
    expect(artifact.page.route).toBe("/settings")
    expect(artifact.annotations).toHaveLength(1)
    expect(artifact.patchProposal.id).toBe(`patch_${taskId.replace(/^task_/, "")}`)
    expect(artifact.safety).toEqual({
      appliesPatch: false,
      writesFiles: false,
      requiresHumanReview: true,
    })
  })

  it("includes patchReview after a human decision", async () => {
    const taskId = await createTask()
    await request("POST", `/api/tasks/${taskId}/mock-patch`)
    await request("POST", `/api/tasks/${taskId}/patch-review`, {
      decision: "changes_requested",
      reviewer: "alice",
      note: "needs tests",
    })

    const res = await request("GET", `/api/tasks/${taskId}/patch-artifact`)
    expect(res.status).toBe(200)
    const { artifact } = res.body as {
      artifact: { taskStatus: string; patchReview?: { status: string; reviewer?: string; note?: string } }
    }
    expect(artifact.taskStatus).toBe("changes_requested")
    expect(artifact.patchReview).toMatchObject({
      status: "changes_requested",
      reviewer: "alice",
      note: "needs tests",
    })
  })

  it("keeps source context paths repository-relative and avoids leaking repoRoot", async () => {
    const taskId = await createTask()
    await request("POST", `/api/tasks/${taskId}/source-context`, undefined, {
      repoRoot: viteReactRoot,
      sourceContext: { contextLines: 1 },
    })
    await request("POST", `/api/tasks/${taskId}/mock-patch`)

    const res = await request("GET", `/api/tasks/${taskId}/patch-artifact`)
    expect(res.status).toBe(200)
    const serialized = JSON.stringify(res.body)
    expect(serialized).not.toContain(viteReactRoot)
    const { artifact } = res.body as {
      artifact: { sourceContext?: { files: { file: string }[] } }
    }
    expect(artifact.sourceContext?.files[0]?.file).toBe("src/App.tsx")
  })

  it("regenerates exportedAt on repeat calls while keeping the stored proposal stable", async () => {
    const taskId = await createTask()
    await request("POST", `/api/tasks/${taskId}/mock-patch`)

    const first = await request("GET", `/api/tasks/${taskId}/patch-artifact`)
    const second = await request("GET", `/api/tasks/${taskId}/patch-artifact`)
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const firstArtifact = (first.body as { artifact: { patchProposal: unknown; exportedAt: string } })
      .artifact
    const secondArtifact = (second.body as { artifact: { patchProposal: unknown; exportedAt: string } })
      .artifact
    expect(firstArtifact.patchProposal).toEqual(secondArtifact.patchProposal)
    expect(typeof firstArtifact.exportedAt).toBe("string")
    expect(typeof secondArtifact.exportedAt).toBe("string")
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
