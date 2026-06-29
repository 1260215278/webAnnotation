import { describe, expect, it } from "vitest"
import {
  formatApplyDryRunPlan,
  formatPatchArtifactPreview,
  runApplyDryRunCommand,
  runCliCommand,
  runPreviewCommand,
  validatePatchArtifactInput,
} from "../src/index"

function makeArtifact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: "web-annotation.patch-artifact.v1",
    exportedAt: "2026-06-29T00:00:00.000Z",
    taskId: "task_example",
    taskStatus: "patch_accepted",
    project: { projectId: "web-console" },
    page: { route: "/settings", title: "Settings" },
    annotations: [
      {
        id: "ann_1",
        message: "Rename the button",
        target: { tagName: "BUTTON", text: "Submit" },
      },
    ],
    patchProposal: {
      id: "patch_example",
      status: "proposed",
      createdAt: "2026-06-29T00:01:00.000Z",
      summary: "Update submit button copy.",
      suggestedFiles: ["src/App.tsx"],
      diffPreview: "--- a/src/App.tsx\n+++ b/src/App.tsx\n@@\n- Submit\n+ Save settings",
      promptContext: {},
    },
    patchReview: {
      status: "accepted",
      decidedAt: "2026-06-29T00:02:00.000Z",
    },
    safety: {
      appliesPatch: false,
      writesFiles: false,
      requiresHumanReview: true,
    },
    ...overrides,
  }
}

describe("validatePatchArtifactInput", () => {
  it("accepts a valid export-only patch artifact", () => {
    const result = validatePatchArtifactInput(makeArtifact())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.artifact.taskId).toBe("task_example")
      expect(result.artifact.patchProposal.diffPreview).toContain("Save settings")
    }
  })

  it("rejects an invalid artifact version", () => {
    const result = validatePatchArtifactInput(makeArtifact({ version: "wrong" }))
    expect(result).toEqual({
      ok: false,
      issues: [{ path: "version", message: "version must be web-annotation.patch-artifact.v1" }],
    })
  })

  it("rejects artifacts that are not export-only", () => {
    const result = validatePatchArtifactInput(
      makeArtifact({
        safety: {
          appliesPatch: true,
          writesFiles: false,
          requiresHumanReview: true,
        },
      }),
    )
    expect(result).toEqual({
      ok: false,
      issues: [{ path: "safety.appliesPatch", message: "appliesPatch must be false" }],
    })
  })

  it("rejects artifacts missing patchProposal.diffPreview", () => {
    const artifact = makeArtifact()
    artifact.patchProposal = {
      id: "patch_example",
      status: "proposed",
      summary: "Update submit button copy.",
      suggestedFiles: ["src/App.tsx"],
    }
    const result = validatePatchArtifactInput(artifact)
    expect(result).toEqual({
      ok: false,
      issues: [{ path: "patchProposal.diffPreview", message: "diffPreview must be a string" }],
    })
  })
})

describe("formatPatchArtifactPreview", () => {
  it("formats a stable preview with review status and diff", () => {
    const result = validatePatchArtifactInput(makeArtifact())
    if (!result.ok) throw new Error("fixture should be valid")

    expect(formatPatchArtifactPreview(result.artifact)).toBe(
      [
        "Task: task_example [patch_accepted]",
        "Project: web-console",
        "Route: /settings",
        "Proposal: Update submit button copy.",
        "Suggested files:",
        "- src/App.tsx",
        "Review: accepted",
        "Diff preview:",
        "--- a/src/App.tsx\n+++ b/src/App.tsx\n@@\n- Submit\n+ Save settings",
        "",
      ].join("\n"),
    )
  })

  it("prints unreviewed when patchReview is absent", () => {
    const result = validatePatchArtifactInput(makeArtifact({ patchReview: undefined }))
    if (!result.ok) throw new Error("fixture should be valid")

    expect(formatPatchArtifactPreview(result.artifact)).toContain("Review: unreviewed")
  })
})

describe("runPreviewCommand", () => {
  it("reads --file JSON and returns a preview", async () => {
    const result = await runPreviewCommand(["preview", "--file", "artifact.json"], {
      readFile: async (file) => {
        expect(file).toBe("artifact.json")
        return JSON.stringify(makeArtifact())
      },
    })

    expect(result.code).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("Task: task_example [patch_accepted]")
    expect(result.stdout).toContain("Diff preview:")
  })

  it("returns a readable error when the file cannot be read", async () => {
    const result = await runPreviewCommand(["preview", "--file", "missing.json"], {
      readFile: async () => {
        throw new Error("ENOENT")
      },
    })

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "Failed to read artifact file: ENOENT\n",
    })
  })

  it("returns a readable error for invalid JSON", async () => {
    const result = await runPreviewCommand(["preview", "--file", "artifact.json"], {
      readFile: async () => "{",
    })

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "Artifact file is not valid JSON\n",
    })
  })
})

describe("formatApplyDryRunPlan", () => {
  it("formats a stable dry-run plan with safety flags and diff", () => {
    const result = validatePatchArtifactInput(makeArtifact())
    if (!result.ok) throw new Error("fixture should be valid")

    expect(
      formatApplyDryRunPlan({
        artifact: result.artifact,
        repoRoot: "/repo/web-console",
        suggestedFiles: ["src/App.tsx"],
      }),
    ).toBe(
      [
        "Apply dry-run plan",
        "Task: task_example [patch_accepted]",
        "Repo root: /repo/web-console",
        "Suggested files:",
        "- src/App.tsx",
        "Review: accepted",
        "Safety:",
        "- appliesPatch: false",
        "- writesFiles: false",
        "- createsCommit: false",
        "Diff preview:",
        "--- a/src/App.tsx\n+++ b/src/App.tsx\n@@\n- Submit\n+ Save settings",
        "",
      ].join("\n"),
    )
  })
})

describe("runApplyDryRunCommand", () => {
  it("returns a dry-run plan for a valid artifact in a clean repository", async () => {
    const calls: string[] = []
    const result = await runApplyDryRunCommand(["apply", "--file", "artifact.json", "--dry-run"], {
      readFile: async () => JSON.stringify(makeArtifact()),
      getRepoRoot: async () => {
        calls.push("getRepoRoot")
        return "/repo/web-console"
      },
      getGitStatus: async () => {
        calls.push("getGitStatus")
        return ""
      },
    })

    expect(result.code).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("Apply dry-run plan")
    expect(result.stdout).toContain("Repo root: /repo/web-console")
    expect(result.stdout).toContain("- src/App.tsx")
    expect(result.stdout).toContain("Review: accepted")
    expect(result.stdout).toContain("- appliesPatch: false")
    expect(result.stdout).toContain("- writesFiles: false")
    expect(result.stdout).toContain("- createsCommit: false")
    expect(result.stdout).toContain("Diff preview:")
    expect(calls).toEqual(["getRepoRoot", "getGitStatus"])
  })

  it("rejects apply without dry-run", async () => {
    const result = await runApplyDryRunCommand(["apply", "--file", "artifact.json"], {
      readFile: async () => JSON.stringify(makeArtifact()),
      getRepoRoot: async () => "/repo/web-console",
      getGitStatus: async () => "",
    })

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "Usage: web-annotation apply --file <artifact.json> --dry-run\n",
    })
  })

  it("returns a readable error outside a git repository", async () => {
    const result = await runApplyDryRunCommand(["apply", "--file", "artifact.json", "--dry-run"], {
      readFile: async () => JSON.stringify(makeArtifact()),
      getRepoRoot: async () => {
        throw new Error("not a git repository")
      },
      getGitStatus: async () => "",
    })

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "Git preflight failed: not a git repository\n",
    })
  })

  it("rejects a dirty working tree", async () => {
    const result = await runApplyDryRunCommand(["apply", "--file", "artifact.json", "--dry-run"], {
      readFile: async () => JSON.stringify(makeArtifact()),
      getRepoRoot: async () => "/repo/web-console",
      getGitStatus: async () => " M src/App.tsx\n",
    })

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "Git preflight failed: working tree must be clean before dry-run\n",
    })
  })

  it("rejects unsafe suggested files", async () => {
    for (const unsafeFile of ["/tmp/App.tsx", "C:\\tmp\\App.tsx", "../outside.ts", ""]) {
      const artifact = makeArtifact({
        patchProposal: {
          summary: "Unsafe path",
          suggestedFiles: [unsafeFile],
          diffPreview: "diff",
        },
      })
      const result = await runApplyDryRunCommand(
        ["apply", "--file", "artifact.json", "--dry-run"],
        {
          readFile: async () => JSON.stringify(artifact),
          getRepoRoot: async () => "/repo/web-console",
          getGitStatus: async () => "",
        },
      )

      expect(result.code).toBe(1)
      expect(result.stderr).toContain("Invalid suggested files:")
    }
  })
})

describe("runCliCommand", () => {
  it("dispatches preview and apply commands", async () => {
    const deps = {
      readFile: async () => JSON.stringify(makeArtifact()),
      getRepoRoot: async () => "/repo/web-console",
      getGitStatus: async () => "",
    }

    expect((await runCliCommand(["preview", "--file", "artifact.json"], deps)).code).toBe(0)
    expect((await runCliCommand(["apply", "--file", "artifact.json", "--dry-run"], deps)).code).toBe(
      0,
    )
  })
})
