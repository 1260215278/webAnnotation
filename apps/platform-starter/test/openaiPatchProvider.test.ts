import { buildPatchPromptContext } from "@web-annotation/node"
import { describe, expect, it } from "vitest"
import {
  buildPatchProviderInput,
  createOpenAICompatiblePatchProvider,
  createPlatformServerOptionsFromEnv,
} from "../src/index"
import type { Task } from "../src/index"
import { makeSourcePayload } from "./fixtures"

function makeTask(): Task {
  const payload = makeSourcePayload()
  payload.annotations[0].attachments = [
    {
      id: "att_1",
      kind: "image",
      name: "screenshot.png",
      mimeType: "image/png",
      size: 4096,
      width: 800,
      height: 600,
      storage: {
        provider: "server",
        url: "https://cdn.example.com/screenshot.png",
        objectKey: "screenshot.png",
      },
    },
  ]
  return {
    id: "task_model",
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

function chatResponse(content: unknown, init: ResponseInit = {}): Response {
  const body = {
    choices: [
      {
        message: {
          role: "assistant",
          content: typeof content === "string" ? content : JSON.stringify(content),
        },
      },
    ],
  }
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  })
}

const validResult = {
  summary: "Update the submit button copy.",
  suggestedFiles: ["src/App.tsx"],
  diffPreview: "--- a/src/App.tsx\n+++ b/src/App.tsx\n@@\n- Submit\n+ Save settings",
  metadata: { provider: "openai-test" },
}

describe("createOpenAICompatiblePatchProvider", () => {
  it("POSTs an OpenAI-compatible request with model, json response_format, bearer auth, and the attachment digest", async () => {
    const requests: { input: RequestInfo | URL; init?: RequestInit }[] = []
    const provider = createOpenAICompatiblePatchProvider({
      endpoint: "https://api.example.com/v1/chat/completions",
      model: "gpt-test",
      getApiKey: async () => "sk-secret",
      fetch: async (input, init) => {
        requests.push({ input, init })
        return chatResponse(validResult)
      },
    })

    const result = await provider.generatePatch(buildPatchProviderInput(makeTask()))
    expect(result.summary).toBe(validResult.summary)
    expect(result.suggestedFiles).toEqual(["src/App.tsx"])

    expect(String(requests[0].input)).toBe("https://api.example.com/v1/chat/completions")
    expect(requests[0].init?.method).toBe("POST")
    const headers = requests[0].init?.headers as Record<string, string>
    expect(headers.authorization).toBe("Bearer sk-secret")
    expect(headers["content-type"]).toBe("application/json")

    const body = JSON.parse(String(requests[0].init?.body))
    expect(body.model).toBe("gpt-test")
    expect(body.response_format).toEqual({ type: "json_object" })
    expect(body.messages[0].role).toBe("system")

    const userContent = JSON.parse(body.messages[1].content)
    expect(userContent.task.id).toBe("task_model")
    expect(userContent.promptContext.annotations[0].id).toBe("anno_1")
    expect(userContent.sourceContext.files[0].file).toBe("src/App.tsx")
    expect(userContent.imageAttachments[0].name).toBe("screenshot.png")
    expect(userContent.imageAttachments[0].annotationId).toBe("anno_1")
    expect(userContent.imageAttachments[0].storage.url).toBe(
      "https://cdn.example.com/screenshot.png",
    )
  })

  it("throws a readable error on a non-2xx response without leaking the api key", async () => {
    const provider = createOpenAICompatiblePatchProvider({
      endpoint: "https://api.example.com/v1/chat/completions",
      model: "gpt-test",
      apiKey: "sk-secret",
      fetch: async () => new Response("unauthorized sk-secret", { status: 401 }),
    })

    await expect(provider.generatePatch(buildPatchProviderInput(makeTask()))).rejects.toThrow(
      "model patch provider request failed with status 401: unauthorized [redacted]",
    )
  })

  it("throws when the response has no choices", async () => {
    const provider = createOpenAICompatiblePatchProvider({
      endpoint: "https://api.example.com/v1/chat/completions",
      model: "gpt-test",
      fetch: async () =>
        new Response(JSON.stringify({ choices: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    })

    await expect(provider.generatePatch(buildPatchProviderInput(makeTask()))).rejects.toThrow(
      "model patch provider response has no choices",
    )
  })

  it("throws when the message content is not valid JSON", async () => {
    const provider = createOpenAICompatiblePatchProvider({
      endpoint: "https://api.example.com/v1/chat/completions",
      model: "gpt-test",
      fetch: async () => chatResponse("this is not json"),
    })

    await expect(provider.generatePatch(buildPatchProviderInput(makeTask()))).rejects.toThrow(
      "model patch provider returned non-JSON content",
    )
  })

  it("throws when the model result is invalid", async () => {
    const provider = createOpenAICompatiblePatchProvider({
      endpoint: "https://api.example.com/v1/chat/completions",
      model: "gpt-test",
      fetch: async () => chatResponse({ summary: "only a summary" }),
    })

    await expect(provider.generatePatch(buildPatchProviderInput(makeTask()))).rejects.toThrow(
      /model patch provider result is invalid/,
    )
  })

  it("requires an explicit endpoint and model", () => {
    expect(() => createOpenAICompatiblePatchProvider({ endpoint: " ", model: "gpt" })).toThrow(
      "model patch provider endpoint is required",
    )
    expect(() =>
      createOpenAICompatiblePatchProvider({ endpoint: "https://x", model: "  " }),
    ).toThrow("model patch provider model is required")
  })
})

describe("createPlatformServerOptionsFromEnv (model provider)", () => {
  it("configures an OpenAI-compatible provider from model env vars", async () => {
    const requests: { init?: RequestInit }[] = []
    const options = createPlatformServerOptionsFromEnv(
      {
        WEB_ANNOTATION_MODEL_PROVIDER_URL: "https://api.example.com/v1/chat/completions",
        WEB_ANNOTATION_MODEL_PROVIDER_MODEL: "gpt-test",
        WEB_ANNOTATION_MODEL_PROVIDER_API_KEY: "sk-env",
      },
      {
        fetch: async (_input, init) => {
          requests.push({ init })
          return chatResponse(validResult)
        },
      },
    )

    expect(options.patchProvider).toBeDefined()
    await options.patchProvider?.generatePatch(buildPatchProviderInput(makeTask()))
    const headers = requests[0].init?.headers as Record<string, string>
    expect(headers.authorization).toBe("Bearer sk-env")
    const body = JSON.parse(String(requests[0].init?.body))
    expect(body.model).toBe("gpt-test")
  })

  it("throws when both the HTTP and model provider URLs are configured", () => {
    expect(() =>
      createPlatformServerOptionsFromEnv({
        WEB_ANNOTATION_PATCH_PROVIDER_URL: "https://http-provider.example.com/patch",
        WEB_ANNOTATION_MODEL_PROVIDER_URL: "https://api.example.com/v1/chat/completions",
      }),
    ).toThrow(/only one patch provider/)
  })

  it("throws when the model provider URL is set without a model", () => {
    expect(() =>
      createPlatformServerOptionsFromEnv({
        WEB_ANNOTATION_MODEL_PROVIDER_URL: "https://api.example.com/v1/chat/completions",
      }),
    ).toThrow(/WEB_ANNOTATION_MODEL_PROVIDER_MODEL is required/)
  })
})
