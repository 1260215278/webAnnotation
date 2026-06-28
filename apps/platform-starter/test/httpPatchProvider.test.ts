import { buildPatchPromptContext } from "@web-annotation/node"
import { describe, expect, it } from "vitest"
import {
  buildPatchProviderInput,
  createHttpPatchProvider,
  createPlatformServerOptionsFromEnv,
} from "../src/index"
import type { PatchProviderResult, Task } from "../src/index"
import { makeSourcePayload } from "./fixtures"

function makeTask(): Task {
  const payload = makeSourcePayload()
  return {
    id: "task_http",
    status: "received",
    createdAt: "2026-06-28T00:00:00.000Z",
    payload,
    promptContext: buildPatchPromptContext(payload),
    sourceContext: {
      files: [
        {
          file: "src/App.tsx",
          startLine: 24,
          endLine: 26,
          content: '<button type="button">Submit</button>',
          annotations: [
            {
              annotationId: "anno_1",
              line: 25,
              column: 9,
              component: "App",
              message: "Change this button text to Save settings",
            },
          ],
        },
      ],
      issues: [],
    },
  }
}

function responseJson(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  })
}

describe("createHttpPatchProvider", () => {
  it("POSTs the provider input with JSON and bearer auth", async () => {
    const requests: { input: RequestInfo | URL; init?: RequestInit }[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push({ input, init })
      return responseJson({
        summary: "HTTP provider patch",
        suggestedFiles: ["src/App.tsx"],
        diffPreview: "provider diff",
        metadata: { provider: "http-test" },
      })
    }

    const provider = createHttpPatchProvider({
      endpoint: "https://provider.example.com/patch",
      getAuthToken: async () => "secret-token",
      headers: { "x-web-annotation": "1" },
      fetch: fetchImpl,
    })
    const result = await provider.generatePatch(buildPatchProviderInput(makeTask()))

    expect(result).toEqual<PatchProviderResult>({
      summary: "HTTP provider patch",
      suggestedFiles: ["src/App.tsx"],
      diffPreview: "provider diff",
      metadata: { provider: "http-test" },
    })
    expect(requests).toHaveLength(1)
    expect(String(requests[0].input)).toBe("https://provider.example.com/patch")
    expect(requests[0].init?.method).toBe("POST")
    const headers = requests[0].init?.headers as Record<string, string>
    expect(headers["content-type"]).toBe("application/json")
    expect(headers.authorization).toBe("Bearer secret-token")
    expect(headers["x-web-annotation"]).toBe("1")
    const body = JSON.parse(String(requests[0].init?.body))
    expect(body.taskId).toBe("task_http")
    expect(body.task.id).toBe("task_http")
    expect(body.promptContext.annotations[0].id).toBe("anno_1")
    expect(body.sourceContext.files[0].file).toBe("src/App.tsx")
  })

  it("throws a readable error for non-2xx responses without leaking the bearer token", async () => {
    const provider = createHttpPatchProvider({
      endpoint: "https://provider.example.com/patch",
      getAuthToken: () => "secret-token",
      fetch: async () => new Response("bad secret-token", { status: 500 }),
    })

    await expect(provider.generatePatch(buildPatchProviderInput(makeTask()))).rejects.toThrow(
      "patch provider request failed with status 500: bad [redacted]",
    )
  })

  it("throws a readable validation error for invalid provider result shapes", async () => {
    const provider = createHttpPatchProvider({
      endpoint: "https://provider.example.com/patch",
      fetch: async () => responseJson({ summary: "missing fields" }),
    })

    await expect(provider.generatePatch(buildPatchProviderInput(makeTask()))).rejects.toThrow(
      "patch provider response is invalid: suggestedFiles must be an array",
    )
  })

  it("requires a non-empty endpoint", () => {
    expect(() => createHttpPatchProvider({ endpoint: " " })).toThrow(
      "patch provider endpoint is required",
    )
  })
})

describe("createPlatformServerOptionsFromEnv", () => {
  it("configures repoRoot and an HTTP patch provider from environment variables", async () => {
    const requests: { init?: RequestInit }[] = []
    const options = createPlatformServerOptionsFromEnv(
      {
        WEB_ANNOTATION_REPO_ROOT: "/repo",
        WEB_ANNOTATION_PATCH_PROVIDER_URL: "https://provider.example.com/patch",
        WEB_ANNOTATION_PATCH_PROVIDER_TOKEN: "env-token",
      },
      {
        fetch: async (_input, init) => {
          requests.push({ init })
          return responseJson({
            summary: "env provider patch",
            suggestedFiles: ["src/App.tsx"],
            diffPreview: "env diff",
          })
        },
      },
    )

    expect(options.repoRoot).toBe("/repo")
    expect(options.patchProvider).toBeDefined()
    await options.patchProvider?.generatePatch(buildPatchProviderInput(makeTask()))
    const headers = requests[0].init?.headers as Record<string, string>
    expect(headers.authorization).toBe("Bearer env-token")
  })

  it("leaves patchProvider undefined when the provider URL is not configured", () => {
    const options = createPlatformServerOptionsFromEnv({})
    expect(options.patchProvider).toBeUndefined()
  })
})
