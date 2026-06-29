import type { AddressInfo } from "node:net"
import type { Server } from "node:http"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  PATCH_ARTIFACT_VERSION,
  createHttpPatchProvider,
  createTaskStore,
  handlePlatformRequest,
} from "@web-annotation/platform-starter"
import type { PlatformResponse, TaskStore } from "@web-annotation/platform-starter"
import { buildMockProviderResult, createMockProviderServer } from "../src/index"
import type { MockProviderRequest } from "../src/index"

/** A valid `AnnotationPayload v1` in `source` mode pointing at `src/App.tsx`. */
function makeSourcePayload(): unknown {
  return {
    version: "v1",
    project: { projectId: "web-console", environment: "staging" },
    page: {
      url: "https://app.example.com/settings",
      route: "/settings",
      title: "Settings",
      viewport: { width: 1440, height: 900 },
    },
    annotationGroup: { id: "group_1", mode: "single" },
    annotations: [
      {
        id: "anno_1",
        message: "Change this button text to Save settings",
        createdAt: "2026-06-28T00:00:00.000Z",
        target: {
          selector: "[data-annotation-id='el_1']",
          cssPath: "#save",
          tagName: "button",
          text: "Submit",
          rect: { x: 111, y: 319, width: 74, height: 34 },
          domSnapshot: '<button id="save">Submit</button>',
          source: {
            mode: "source",
            sourceId: "s_19cu8m6",
            file: "src/App.tsx",
            line: 25,
            column: 9,
            component: "App",
            framework: "react",
          },
        },
      },
    ],
  }
}

function makeProviderRequest(
  annotations: MockProviderRequest["promptContext"]["annotations"],
): MockProviderRequest {
  return {
    taskId: "task_1",
    task: {},
    promptContext: {
      version: "v1",
      project: { projectId: "web-console" },
      page: {
        url: "https://app.example.com/settings",
        route: "/settings",
        title: "Settings",
      },
      annotationGroup: { id: "group_1", mode: "single" },
      annotations,
    },
  }
}

describe("provider-http-mock end-to-end", () => {
  let server: Server
  let endpoint: string
  let store: TaskStore

  beforeAll(async () => {
    server = createMockProviderServer()
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening)
        reject(error)
      }
      const onListening = () => {
        server.off("error", onError)
        resolve()
      }
      server.once("error", onError)
      server.listen(0, "127.0.0.1", onListening)
    })
    const { port } = server.address() as AddressInfo
    endpoint = `http://127.0.0.1:${port}`
    store = createTaskStore()
  })

  afterAll(async () => {
    if (!server.listening) return
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  })

  function request(method: string, path: string, body?: unknown): Promise<PlatformResponse> {
    return handlePlatformRequest({ method, path, body }, store, {
      patchProvider: createHttpPatchProvider({ endpoint }),
    })
  }

  it("rejects empty annotation requests before returning an invalid provider result", async () => {
    expect(() => buildMockProviderResult(makeProviderRequest([]))).toThrow(
      "promptContext.annotations must include at least one annotation",
    )

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(makeProviderRequest([])),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "promptContext.annotations must include at least one annotation",
    })
  })

  it("uses a stable mock file path when source metadata is unavailable", () => {
    const result = buildMockProviderResult(
      makeProviderRequest([
        {
          id: "anno/no-source",
          message: "Use a clearer label",
          createdAt: "2026-06-28T00:00:00.000Z",
          target: {
            selector: "[data-annotation-id='el_1']",
            cssPath: "#save",
            tagName: "button",
            text: "Submit",
          },
        },
      ]),
    )

    expect(result.suggestedFiles).toEqual(["mock-unmapped/anno-no-source.md"])
    expect(result.diffPreview).toContain("--- a/mock-unmapped/anno-no-source.md")
    expect(result.diffPreview).not.toContain("--- a/#save")
  })

  it("ingests, generates a provider patch over HTTP, and exports a usable artifact", async () => {
    const ingest = await request("POST", "/api/annotations", makeSourcePayload())
    expect(ingest.status).toBe(201)
    const { taskId } = ingest.body as { taskId: string }
    expect(taskId).toBeTruthy()

    const patch = await request("POST", `/api/tasks/${taskId}/patch`)
    expect(patch.status).toBe(201)
    const { patchProposal } = patch.body as {
      patchProposal: {
        summary: string
        suggestedFiles: string[]
        diffPreview: string
        metadata?: Record<string, unknown>
      }
    }
    // The proposal cleared both provider-result validation and diff-target safety.
    expect(patchProposal.suggestedFiles).toEqual(["src/App.tsx"])
    expect(patchProposal.diffPreview).toContain("--- a/src/App.tsx")
    expect(patchProposal.diffPreview).toContain("+++ b/src/App.tsx")
    expect(patchProposal.metadata).toMatchObject({ provider: "example-http-mock" })

    const artifactRes = await request("GET", `/api/tasks/${taskId}/patch-artifact`)
    expect(artifactRes.status).toBe(200)
    const { artifact } = artifactRes.body as {
      artifact: {
        version: string
        taskId: string
        patchProposal: { summary: string; suggestedFiles: string[]; diffPreview: string }
        safety: { appliesPatch: boolean; writesFiles: boolean; requiresHumanReview: boolean }
      }
    }
    // The exported artifact is a plain, serializable, downstream-readable object
    // (the shape the CLI's `web-annotation preview` consumes).
    expect(artifact.version).toBe(PATCH_ARTIFACT_VERSION)
    expect(artifact.taskId).toBe(taskId)
    expect(artifact.patchProposal.summary).toContain("Mock HTTP provider proposing")
    expect(artifact.patchProposal.suggestedFiles).toEqual(["src/App.tsx"])
    expect(artifact.patchProposal.diffPreview).toContain("src/App.tsx")
    expect(artifact.safety).toMatchObject({ appliesPatch: false, writesFiles: false })
    // Round-trips through JSON without functions/DOM handles.
    expect(JSON.parse(JSON.stringify(artifact))).toEqual(artifact)
  })
})
