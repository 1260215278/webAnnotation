import { describe, expect, it } from "vitest"
import {
  formatApplyDryRunPlan,
  formatApplyReport,
  formatBranchCommitReport,
  formatPatchCheckReport,
  formatPatchArtifactPreview,
  formatPullReport,
  runApplyConfirmedCommand,
  runApplyDryRunCommand,
  runApplyCheckCommand,
  runCliCommand,
  runPreviewCommand,
  runPullCommand,
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

function makeGitDiffArtifact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return makeArtifact({
    patchProposal: {
      summary: "Update submit button copy.",
      suggestedFiles: ["src/App.tsx"],
      diffPreview:
        "diff --git a/src/App.tsx b/src/App.tsx\n--- a/src/App.tsx\n+++ b/src/App.tsx\n@@ -1 +1 @@\n- Submit\n+ Save settings",
    },
    ...overrides,
  })
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

describe("formatPatchCheckReport", () => {
  it("formats a stable patch check report", () => {
    const result = validatePatchArtifactInput(makeArtifact())
    if (!result.ok) throw new Error("fixture should be valid")

    expect(
      formatPatchCheckReport({
        artifact: result.artifact,
        repoRoot: "/repo/web-console",
        suggestedFiles: ["src/App.tsx"],
      }),
    ).toBe(
      [
        "Patch check report",
        "Task: task_example [patch_accepted]",
        "Repo root: /repo/web-console",
        "Suggested files:",
        "- src/App.tsx",
        "Review: accepted",
        "Patch check: passed",
        "Safety:",
        "- appliesPatch: false",
        "- writesFiles: false",
        "- createsCommit: false",
        "",
      ].join("\n"),
    )
  })
})

describe("runApplyCheckCommand", () => {
  it("returns a check report for a valid artifact in a clean repository", async () => {
    const calls: string[] = []
    const result = await runApplyCheckCommand(["apply", "--file", "artifact.json", "--check"], {
      readFile: async () => JSON.stringify(makeArtifact()),
      getRepoRoot: async () => {
        calls.push("getRepoRoot")
        return "/repo/web-console"
      },
      getGitStatus: async () => {
        calls.push("getGitStatus")
        return ""
      },
      checkPatch: async (diffPreview) => {
        calls.push(`checkPatch:${diffPreview}`)
      },
    })

    expect(result.code).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("Patch check report")
    expect(result.stdout).toContain("Repo root: /repo/web-console")
    expect(result.stdout).toContain("- src/App.tsx")
    expect(result.stdout).toContain("Review: accepted")
    expect(result.stdout).toContain("Patch check: passed")
    expect(result.stdout).toContain("- appliesPatch: false")
    expect(result.stdout).toContain("- writesFiles: false")
    expect(result.stdout).toContain("- createsCommit: false")
    expect(calls).toEqual([
      "getRepoRoot",
      "getGitStatus",
      "checkPatch:--- a/src/App.tsx\n+++ b/src/App.tsx\n@@\n- Submit\n+ Save settings",
    ])
  })

  it("returns a readable error when patch check fails", async () => {
    const result = await runApplyCheckCommand(["apply", "--file", "artifact.json", "--check"], {
      readFile: async () => JSON.stringify(makeArtifact()),
      getRepoRoot: async () => "/repo/web-console",
      getGitStatus: async () => "",
      checkPatch: async () => {
        throw new Error("patch does not apply")
      },
    })

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "Patch check failed: patch does not apply\n",
    })
  })

  it("rejects check when the working tree is dirty", async () => {
    const result = await runApplyCheckCommand(["apply", "--file", "artifact.json", "--check"], {
      readFile: async () => JSON.stringify(makeArtifact()),
      getRepoRoot: async () => "/repo/web-console",
      getGitStatus: async () => " M src/App.tsx\n",
      checkPatch: async () => {
        throw new Error("should not run")
      },
    })

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "Git preflight failed: working tree must be clean before patch check\n",
    })
  })

  it("rejects unsafe suggested files before checking the patch", async () => {
    const artifact = makeArtifact({
      patchProposal: {
        summary: "Unsafe path",
        suggestedFiles: ["../outside.ts"],
        diffPreview: "diff",
      },
    })
    const result = await runApplyCheckCommand(["apply", "--file", "artifact.json", "--check"], {
      readFile: async () => JSON.stringify(artifact),
      getRepoRoot: async () => "/repo/web-console",
      getGitStatus: async () => "",
      checkPatch: async () => {
        throw new Error("should not run")
      },
    })

    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Invalid suggested files:")
  })
})

describe("formatApplyReport", () => {
  it("formats a stable apply report", () => {
    const result = validatePatchArtifactInput(makeArtifact())
    if (!result.ok) throw new Error("fixture should be valid")

    expect(
      formatApplyReport({
        artifact: result.artifact,
        repoRoot: "/repo/web-console",
        suggestedFiles: ["src/App.tsx"],
      }),
    ).toBe(
      [
        "Patch apply report",
        "Task: task_example [patch_accepted]",
        "Repo root: /repo/web-console",
        "Applied files:",
        "- src/App.tsx",
        "Review: accepted",
        "Patch check: passed",
        "Patch apply: applied",
        "Safety:",
        "- createsCommit: false",
        "",
      ].join("\n"),
    )
  })
})

describe("formatBranchCommitReport", () => {
  it("formats a stable branch commit report", () => {
    const result = validatePatchArtifactInput(makeGitDiffArtifact())
    if (!result.ok) throw new Error("fixture should be valid")

    expect(
      formatBranchCommitReport({
        artifact: result.artifact,
        repoRoot: "/repo/web-console",
        suggestedFiles: ["src/App.tsx"],
        branchName: "webannotation/task-example",
      }),
    ).toBe(
      [
        "Patch branch commit report",
        "Task: task_example [patch_accepted]",
        "Repo root: /repo/web-console",
        "Branch: webannotation/task-example",
        "Committed files:",
        "- src/App.tsx",
        "Review: accepted",
        "Patch check: passed",
        "Patch apply: applied",
        "Git add: staged selected files",
        "Git commit: created",
        "Safety:",
        "- push: false",
        "- createsPr: false",
        "",
      ].join("\n"),
    )
  })
})

describe("runApplyConfirmedCommand", () => {
  it("applies a valid artifact after check succeeds", async () => {
    const calls: string[] = []
    const result = await runApplyConfirmedCommand(["apply", "--file", "artifact.json", "--yes"], {
      readFile: async () => JSON.stringify(makeArtifact()),
      getRepoRoot: async () => {
        calls.push("getRepoRoot")
        return "/repo/web-console"
      },
      getGitStatus: async () => {
        calls.push("getGitStatus")
        return ""
      },
      checkPatch: async (diffPreview) => {
        calls.push(`checkPatch:${diffPreview}`)
      },
      applyPatch: async (diffPreview) => {
        calls.push(`applyPatch:${diffPreview}`)
      },
    })

    expect(result.code).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("Patch apply report")
    expect(result.stdout).toContain("Repo root: /repo/web-console")
    expect(result.stdout).toContain("- src/App.tsx")
    expect(result.stdout).toContain("Review: accepted")
    expect(result.stdout).toContain("Patch check: passed")
    expect(result.stdout).toContain("Patch apply: applied")
    expect(result.stdout).toContain("- createsCommit: false")
    expect(calls).toEqual([
      "getRepoRoot",
      "getGitStatus",
      "checkPatch:--- a/src/App.tsx\n+++ b/src/App.tsx\n@@\n- Submit\n+ Save settings",
      "applyPatch:--- a/src/App.tsx\n+++ b/src/App.tsx\n@@\n- Submit\n+ Save settings",
    ])
  })

  it("rejects apply without yes confirmation", async () => {
    const result = await runApplyConfirmedCommand(["apply", "--file", "artifact.json"], {
      readFile: async () => JSON.stringify(makeArtifact()),
      getRepoRoot: async () => "/repo/web-console",
      getGitStatus: async () => "",
      checkPatch: async () => undefined,
      applyPatch: async () => undefined,
    })

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr:
        "Usage: web-annotation apply --file <artifact.json> --yes\nRun --dry-run or --check before confirmed apply.\n",
    })
  })

  it("does not apply when patch check fails", async () => {
    const calls: string[] = []
    const result = await runApplyConfirmedCommand(["apply", "--file", "artifact.json", "--yes"], {
      readFile: async () => JSON.stringify(makeArtifact()),
      getRepoRoot: async () => "/repo/web-console",
      getGitStatus: async () => "",
      checkPatch: async () => {
        calls.push("checkPatch")
        throw new Error("patch does not apply")
      },
      applyPatch: async () => {
        calls.push("applyPatch")
      },
    })

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "Patch check failed: patch does not apply\n",
    })
    expect(calls).toEqual(["checkPatch"])
  })

  it("rejects confirmed apply when the working tree is dirty", async () => {
    const result = await runApplyConfirmedCommand(["apply", "--file", "artifact.json", "--yes"], {
      readFile: async () => JSON.stringify(makeArtifact()),
      getRepoRoot: async () => "/repo/web-console",
      getGitStatus: async () => " M src/App.tsx\n",
      checkPatch: async () => {
        throw new Error("should not run")
      },
      applyPatch: async () => {
        throw new Error("should not run")
      },
    })

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "Git preflight failed: working tree must be clean before confirmed apply\n",
    })
  })

  it("rejects unsafe suggested files before applying", async () => {
    const artifact = makeArtifact({
      patchProposal: {
        summary: "Unsafe path",
        suggestedFiles: ["/tmp/App.tsx"],
        diffPreview: "diff",
      },
    })
    const result = await runApplyConfirmedCommand(["apply", "--file", "artifact.json", "--yes"], {
      readFile: async () => JSON.stringify(artifact),
      getRepoRoot: async () => "/repo/web-console",
      getGitStatus: async () => "",
      checkPatch: async () => {
        throw new Error("should not run")
      },
      applyPatch: async () => {
        throw new Error("should not run")
      },
    })

    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Invalid suggested files:")
  })

  it("returns a readable error when apply fails", async () => {
    const result = await runApplyConfirmedCommand(["apply", "--file", "artifact.json", "--yes"], {
      readFile: async () => JSON.stringify(makeArtifact()),
      getRepoRoot: async () => "/repo/web-console",
      getGitStatus: async () => "",
      checkPatch: async () => undefined,
      applyPatch: async () => {
        throw new Error("apply failed")
      },
    })

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "Patch apply failed: apply failed\n",
    })
  })

  it("rejects commit mode without a branch", async () => {
    const result = await runApplyConfirmedCommand(
      ["apply", "--file", "artifact.json", "--yes", "--commit", "--message", "Update copy"],
      {
        readFile: async () => JSON.stringify(makeGitDiffArtifact()),
        getRepoRoot: async () => "/repo/web-console",
        getGitStatus: async () => "",
        checkPatch: async () => undefined,
        applyPatch: async () => undefined,
      },
    )

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr:
        "Usage: web-annotation apply --file <artifact.json> --yes --branch <branch-name> --commit --message <commit-message>\n",
    })
  })

  it("rejects commit mode without a message", async () => {
    const result = await runApplyConfirmedCommand(
      ["apply", "--file", "artifact.json", "--yes", "--branch", "webannotation/task-example", "--commit"],
      {
        readFile: async () => JSON.stringify(makeGitDiffArtifact()),
        getRepoRoot: async () => "/repo/web-console",
        getGitStatus: async () => "",
        checkPatch: async () => undefined,
        applyPatch: async () => undefined,
      },
    )

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr:
        "Usage: web-annotation apply --file <artifact.json> --yes --branch <branch-name> --commit --message <commit-message>\n",
    })
  })

  it("rejects invalid branch names before checking or applying", async () => {
    const calls: string[] = []
    const result = await runApplyConfirmedCommand(
      [
        "apply",
        "--file",
        "artifact.json",
        "--yes",
        "--branch",
        "bad branch",
        "--commit",
        "--message",
        "Update copy",
      ],
      {
        readFile: async () => JSON.stringify(makeGitDiffArtifact()),
        getRepoRoot: async () => {
          calls.push("getRepoRoot")
          return "/repo/web-console"
        },
        getGitStatus: async () => {
          calls.push("getGitStatus")
          return ""
        },
        checkPatch: async () => {
          calls.push("checkPatch")
        },
        applyPatch: async () => {
          calls.push("applyPatch")
        },
      },
    )

    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Invalid branch name:")
    expect(calls).toEqual([])
  })

  it("rejects commit messages with AI trailers", async () => {
    const result = await runApplyConfirmedCommand(
      [
        "apply",
        "--file",
        "artifact.json",
        "--yes",
        "--branch",
        "webannotation/task-example",
        "--commit",
        "--message",
        "Update copy\n\nCo-Authored-By: Claude <noreply@example.com>",
      ],
      {
        readFile: async () => JSON.stringify(makeGitDiffArtifact()),
        getRepoRoot: async () => "/repo/web-console",
        getGitStatus: async () => "",
        checkPatch: async () => undefined,
        applyPatch: async () => undefined,
      },
    )

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "Invalid commit message: message must not contain AI signature trailers\n",
    })
  })

  it("rejects commit mode when diff files do not match suggested files", async () => {
    const calls: string[] = []
    const result = await runApplyConfirmedCommand(
      [
        "apply",
        "--file",
        "artifact.json",
        "--yes",
        "--branch",
        "webannotation/task-example",
        "--commit",
        "--message",
        "Update copy",
      ],
      {
        readFile: async () =>
          JSON.stringify(
            makeGitDiffArtifact({
              patchProposal: {
                summary: "Update copy",
                suggestedFiles: ["src/App.tsx"],
                diffPreview:
                  "diff --git a/src/Other.tsx b/src/Other.tsx\n--- a/src/Other.tsx\n+++ b/src/Other.tsx\n@@ -1 +1 @@\n-old\n+new",
              },
            }),
          ),
        getRepoRoot: async () => {
          calls.push("getRepoRoot")
          return "/repo/web-console"
        },
        getGitStatus: async () => {
          calls.push("getGitStatus")
          return ""
        },
        checkPatch: async () => {
          calls.push("checkPatch")
        },
        applyPatch: async () => {
          calls.push("applyPatch")
        },
        checkBranchName: async () => {
          calls.push("checkBranchName")
        },
        createBranch: async () => {
          calls.push("createBranch")
        },
        stageFiles: async () => {
          calls.push("stageFiles")
        },
        commitChanges: async () => {
          calls.push("commitChanges")
        },
      },
    )

    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Patch diff files must match suggested files:")
    expect(calls).toEqual(["getRepoRoot", "getGitStatus"])
  })

  it("creates a branch, applies, stages selected files, and commits in commit mode", async () => {
    const calls: string[] = []
    const result = await runApplyConfirmedCommand(
      [
        "apply",
        "--file",
        "artifact.json",
        "--yes",
        "--branch",
        "webannotation/task-example",
        "--commit",
        "--message",
        "Update copy",
      ],
      {
        readFile: async () => JSON.stringify(makeGitDiffArtifact()),
        getRepoRoot: async () => {
          calls.push("getRepoRoot")
          return "/repo/web-console"
        },
        getGitStatus: async () => {
          calls.push("getGitStatus")
          return ""
        },
        checkPatch: async (diffPreview) => {
          calls.push(`checkPatch:${diffPreview}`)
        },
        checkBranchName: async (branchName) => {
          calls.push(`checkBranchName:${branchName}`)
        },
        createBranch: async (branchName) => {
          calls.push(`createBranch:${branchName}`)
        },
        applyPatch: async (diffPreview) => {
          calls.push(`applyPatch:${diffPreview}`)
        },
        stageFiles: async (files) => {
          calls.push(`stageFiles:${files.join(",")}`)
        },
        commitChanges: async (message) => {
          calls.push(`commitChanges:${message}`)
        },
      },
    )

    const diffPreview =
      "diff --git a/src/App.tsx b/src/App.tsx\n--- a/src/App.tsx\n+++ b/src/App.tsx\n@@ -1 +1 @@\n- Submit\n+ Save settings"
    expect(result.code).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("Patch branch commit report")
    expect(result.stdout).toContain("Branch: webannotation/task-example")
    expect(result.stdout).toContain("Git add: staged selected files")
    expect(result.stdout).toContain("Git commit: created")
    expect(result.stdout).toContain("- push: false")
    expect(result.stdout).toContain("- createsPr: false")
    expect(calls).toEqual([
      "getRepoRoot",
      "getGitStatus",
      `checkPatch:${diffPreview}`,
      "checkBranchName:webannotation/task-example",
      "createBranch:webannotation/task-example",
      `applyPatch:${diffPreview}`,
      "stageFiles:src/App.tsx",
      "commitChanges:Update copy",
    ])
  })
})

describe("runCliCommand", () => {
  it("dispatches preview and apply commands", async () => {
    const deps = {
      readFile: async () => JSON.stringify(makeArtifact()),
      getRepoRoot: async () => "/repo/web-console",
      getGitStatus: async () => "",
      checkPatch: async () => undefined,
      applyPatch: async () => undefined,
    }

    expect((await runCliCommand(["preview", "--file", "artifact.json"], deps)).code).toBe(0)
    expect((await runCliCommand(["apply", "--file", "artifact.json", "--dry-run"], deps)).code).toBe(
      0,
    )
    expect((await runCliCommand(["apply", "--file", "artifact.json", "--check"], deps)).code).toBe(0)
    expect((await runCliCommand(["apply", "--file", "artifact.json", "--yes"], deps)).code).toBe(0)
  })

  it("dispatches branch commit apply commands", async () => {
    const result = await runCliCommand(
      [
        "apply",
        "--file",
        "artifact.json",
        "--yes",
        "--branch",
        "webannotation/task-example",
        "--commit",
        "--message",
        "Update copy",
      ],
      {
        readFile: async () => JSON.stringify(makeGitDiffArtifact()),
        getRepoRoot: async () => "/repo/web-console",
        getGitStatus: async () => "",
        checkPatch: async () => undefined,
        checkBranchName: async () => undefined,
        createBranch: async () => undefined,
        applyPatch: async () => undefined,
        stageFiles: async () => undefined,
        commitChanges: async () => undefined,
      },
    )

    expect(result.code).toBe(0)
    expect(result.stdout).toContain("Patch branch commit report")
  })

  it("rejects bare apply with the confirmed-apply hint", async () => {
    const result = await runCliCommand(["apply", "--file", "artifact.json"], {
      readFile: async () => JSON.stringify(makeArtifact()),
      getRepoRoot: async () => "/repo/web-console",
      getGitStatus: async () => "",
      checkPatch: async () => undefined,
      applyPatch: async () => undefined,
    })

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr:
        "Usage: web-annotation apply --file <artifact.json> --yes\nRun --dry-run or --check before confirmed apply.\n",
    })
  })
})

describe("diff target safety (mixed diff bypass)", () => {
  // suggestedFiles claims only src/App.tsx, but the diff also carries a plain
  // unified-diff section (no `diff --git` header) that targets src/Other.tsx.
  // `git apply` would touch both files, so every apply path must reject it
  // before checking, applying, branching, or committing.
  const MIXED_DIFF = [
    "diff --git a/src/App.tsx b/src/App.tsx",
    "--- a/src/App.tsx",
    "+++ b/src/App.tsx",
    "@@ -1 +1 @@",
    "- Submit",
    "+ Save settings",
    "--- a/src/Other.tsx",
    "+++ b/src/Other.tsx",
    "@@ -1 +1 @@",
    "-old",
    "+new",
  ].join("\n")

  function makeMixedArtifact(): Record<string, unknown> {
    return makeArtifact({
      patchProposal: {
        summary: "Sneak in an undeclared file.",
        suggestedFiles: ["src/App.tsx"],
        diffPreview: MIXED_DIFF,
      },
    })
  }

  it("rejects a mixed diff in check mode before running git apply --check", async () => {
    const calls: string[] = []
    const result = await runApplyCheckCommand(["apply", "--file", "artifact.json", "--check"], {
      readFile: async () => JSON.stringify(makeMixedArtifact()),
      getRepoRoot: async () => "/repo/web-console",
      getGitStatus: async () => "",
      checkPatch: async () => {
        calls.push("checkPatch")
      },
    })

    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Patch diff files must match suggested files:")
    expect(result.stderr).toContain("src/Other.tsx")
    expect(calls).toEqual([])
  })

  it("rejects a mixed diff in confirmed apply mode before checking or applying", async () => {
    const calls: string[] = []
    const result = await runApplyConfirmedCommand(["apply", "--file", "artifact.json", "--yes"], {
      readFile: async () => JSON.stringify(makeMixedArtifact()),
      getRepoRoot: async () => "/repo/web-console",
      getGitStatus: async () => "",
      checkPatch: async () => {
        calls.push("checkPatch")
      },
      applyPatch: async () => {
        calls.push("applyPatch")
      },
    })

    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Patch diff files must match suggested files:")
    expect(calls).toEqual([])
  })

  it("rejects a mixed diff in branch commit mode before any git write", async () => {
    const calls: string[] = []
    const result = await runApplyConfirmedCommand(
      [
        "apply",
        "--file",
        "artifact.json",
        "--yes",
        "--branch",
        "webannotation/task-example",
        "--commit",
        "--message",
        "Update copy",
      ],
      {
        readFile: async () => JSON.stringify(makeMixedArtifact()),
        getRepoRoot: async () => "/repo/web-console",
        getGitStatus: async () => "",
        checkPatch: async () => {
          calls.push("checkPatch")
        },
        checkBranchName: async () => {
          calls.push("checkBranchName")
        },
        createBranch: async () => {
          calls.push("createBranch")
        },
        applyPatch: async () => {
          calls.push("applyPatch")
        },
        stageFiles: async () => {
          calls.push("stageFiles")
        },
        commitChanges: async () => {
          calls.push("commitChanges")
        },
      },
    )

    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Patch diff files must match suggested files:")
    expect(calls).toEqual([])
  })
})

describe("formatPullReport", () => {
  it("formats a stable pull report", () => {
    const result = validatePatchArtifactInput(makeArtifact())
    if (!result.ok) throw new Error("fixture should be valid")

    expect(formatPullReport({ artifact: result.artifact, outFile: "out/artifact.json" })).toBe(
      [
        "Patch artifact pull report",
        "Task: task_example [patch_accepted]",
        "Out file: out/artifact.json",
        "Suggested files:",
        "- src/App.tsx",
        "Review: accepted",
        "Safety:",
        "- appliesPatch: false",
        "- writesRepoFiles: false",
        "- createsCommit: false",
        "",
      ].join("\n"),
    )
  })

  it("prints unreviewed when patchReview is absent", () => {
    const result = validatePatchArtifactInput(makeArtifact({ patchReview: undefined }))
    if (!result.ok) throw new Error("fixture should be valid")

    expect(formatPullReport({ artifact: result.artifact, outFile: "out.json" })).toContain(
      "Review: unreviewed",
    )
  })
})

describe("runPullCommand", () => {
  function makePullDeps(overrides: Record<string, unknown> = {}) {
    return {
      fetchArtifact: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ artifact: makeArtifact() }),
      }),
      writeFile: async () => undefined,
      ...overrides,
    }
  }

  it("fetches, validates, writes, and reports on the success path", async () => {
    const calls: string[] = []
    let written: { file: string; content: string } | undefined
    const result = await runPullCommand(
      ["pull", "task_example", "--base-url", "http://localhost:4319", "--out", "out/artifact.json"],
      {
        fetchArtifact: async (url, headers) => {
          calls.push(`fetch:${url}`)
          expect(headers.authorization).toBeUndefined()
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ artifact: makeArtifact() }),
          }
        },
        writeFile: async (file, content) => {
          written = { file, content }
        },
      },
    )

    expect(result.code).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("Patch artifact pull report")
    expect(result.stdout).toContain("Task: task_example [patch_accepted]")
    expect(result.stdout).toContain("Out file: out/artifact.json")
    expect(result.stdout).toContain("- src/App.tsx")
    expect(result.stdout).toContain("- appliesPatch: false")
    expect(result.stdout).toContain("- writesRepoFiles: false")
    expect(result.stdout).toContain("- createsCommit: false")
    expect(calls).toEqual(["fetch:http://localhost:4319/api/tasks/task_example/patch-artifact"])
    expect(written?.file).toBe("out/artifact.json")
    // The written file is the bare artifact so `preview --file` can read it back.
    expect(JSON.parse(written?.content ?? "{}").version).toBe("web-annotation.patch-artifact.v1")
  })

  it("sends an Authorization header when --token is provided", async () => {
    let seenHeaders: Record<string, string> | undefined
    const result = await runPullCommand(
      [
        "pull",
        "task_example",
        "--base-url",
        "https://platform.example.com",
        "--out",
        "out.json",
        "--token",
        "super-secret-token",
      ],
      makePullDeps({
        fetchArtifact: async (_url: string, headers: Record<string, string>) => {
          seenHeaders = headers
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ artifact: makeArtifact() }),
          }
        },
      }),
    )

    expect(result.code).toBe(0)
    expect(seenHeaders?.authorization).toBe("Bearer super-secret-token")
  })

  it("requires a task id", async () => {
    const result = await runPullCommand(
      ["pull", "--base-url", "http://localhost:4319", "--out", "out.json"],
      makePullDeps(),
    )
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Usage: web-annotation pull")
  })

  it("requires --base-url and --out", async () => {
    const missingBase = await runPullCommand(["pull", "task_example", "--out", "out.json"], makePullDeps())
    expect(missingBase.code).toBe(1)
    expect(missingBase.stderr).toContain("Usage: web-annotation pull")

    const missingOut = await runPullCommand(
      ["pull", "task_example", "--base-url", "http://localhost:4319"],
      makePullDeps(),
    )
    expect(missingOut.code).toBe(1)
    expect(missingOut.stderr).toContain("Usage: web-annotation pull")
  })

  it("rejects non-http(s) base URLs without fetching", async () => {
    const calls: string[] = []
    const result = await runPullCommand(
      ["pull", "task_example", "--base-url", "file:///etc/passwd", "--out", "out.json"],
      {
        fetchArtifact: async () => {
          calls.push("fetch")
          return { ok: true, status: 200, text: async () => "{}" }
        },
        writeFile: async () => {
          calls.push("writeFile")
        },
      },
    )

    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Invalid base URL")
    expect(calls).toEqual([])
  })

  it("rejects a non-2xx response without writing a file", async () => {
    const calls: string[] = []
    const result = await runPullCommand(
      ["pull", "task_example", "--base-url", "http://localhost:4319", "--out", "out.json"],
      {
        fetchArtifact: async () => ({ ok: false, status: 404, text: async () => "not found" }),
        writeFile: async () => {
          calls.push("writeFile")
        },
      },
    )

    expect(result.code).toBe(1)
    expect(result.stderr).toContain("HTTP 404")
    expect(calls).toEqual([])
  })

  it("rejects invalid JSON without writing a file", async () => {
    const calls: string[] = []
    const result = await runPullCommand(
      ["pull", "task_example", "--base-url", "http://localhost:4319", "--out", "out.json"],
      {
        fetchArtifact: async () => ({ ok: true, status: 200, text: async () => "{" }),
        writeFile: async () => {
          calls.push("writeFile")
        },
      },
    )

    expect(result.code).toBe(1)
    expect(result.stderr).toContain("not valid JSON")
    expect(calls).toEqual([])
  })

  it("rejects an artifact that fails validation without writing a file", async () => {
    const calls: string[] = []
    const result = await runPullCommand(
      ["pull", "task_example", "--base-url", "http://localhost:4319", "--out", "out.json"],
      {
        fetchArtifact: async () => ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ artifact: makeArtifact({ version: "wrong" }) }),
        }),
        writeFile: async () => {
          calls.push("writeFile")
        },
      },
    )

    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Invalid patch artifact:")
    expect(calls).toEqual([])
  })

  it("never leaks the token in error output", async () => {
    const result = await runPullCommand(
      [
        "pull",
        "task_example",
        "--base-url",
        "http://localhost:4319",
        "--out",
        "out.json",
        "--token",
        "super-secret-token",
      ],
      {
        fetchArtifact: async () => ({ ok: false, status: 500, text: async () => "boom" }),
        writeFile: async () => undefined,
      },
    )

    expect(result.code).toBe(1)
    expect(result.stdout).not.toContain("super-secret-token")
    expect(result.stderr).not.toContain("super-secret-token")
  })

  it("redacts the token from fetch, response, and write errors", async () => {
    const args = [
      "pull",
      "task_example",
      "--base-url",
      "http://localhost:4319",
      "--out",
      "out.json",
      "--token",
      "super-secret-token",
    ]

    const fetchFailure = await runPullCommand(args, {
      fetchArtifact: async () => {
        throw new Error("network failed for super-secret-token")
      },
      writeFile: async () => undefined,
    })
    expect(fetchFailure.code).toBe(1)
    expect(fetchFailure.stderr).toContain("[redacted]")
    expect(fetchFailure.stderr).not.toContain("super-secret-token")

    const textFailure = await runPullCommand(args, {
      fetchArtifact: async () => ({
        ok: true,
        status: 200,
        text: async () => {
          throw new Error("body failed for super-secret-token")
        },
      }),
      writeFile: async () => undefined,
    })
    expect(textFailure.code).toBe(1)
    expect(textFailure.stderr).toContain("[redacted]")
    expect(textFailure.stderr).not.toContain("super-secret-token")

    const writeFailure = await runPullCommand(args, {
      fetchArtifact: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ artifact: makeArtifact() }),
      }),
      writeFile: async () => {
        throw new Error("write failed for super-secret-token")
      },
    })
    expect(writeFailure.code).toBe(1)
    expect(writeFailure.stderr).toContain("[redacted]")
    expect(writeFailure.stderr).not.toContain("super-secret-token")
  })
})

describe("runCliCommand pull dispatch", () => {
  it("dispatches pull commands when pull dependencies are configured", async () => {
    let written: string | undefined
    const result = await runCliCommand(
      ["pull", "task_example", "--base-url", "http://localhost:4319", "--out", "out.json"],
      {
        readFile: async () => JSON.stringify(makeArtifact()),
        getRepoRoot: async () => "/repo/web-console",
        getGitStatus: async () => "",
        checkPatch: async () => undefined,
        applyPatch: async () => undefined,
        fetchArtifact: async () => ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ artifact: makeArtifact() }),
        }),
        writeFile: async (_file: string, content: string) => {
          written = content
        },
      },
    )

    expect(result.code).toBe(0)
    expect(result.stdout).toContain("Patch artifact pull report")
    expect(JSON.parse(written ?? "{}").taskId).toBe("task_example")
  })

  it("reports when pull dependencies are not configured", async () => {
    const result = await runCliCommand(
      ["pull", "task_example", "--base-url", "http://localhost:4319", "--out", "out.json"],
      {
        readFile: async () => JSON.stringify(makeArtifact()),
        getRepoRoot: async () => "/repo/web-console",
        getGitStatus: async () => "",
        checkPatch: async () => undefined,
        applyPatch: async () => undefined,
      },
    )

    expect(result.code).toBe(1)
    expect(result.stderr).toContain("Pull dependencies are not configured")
  })
})
