import { describe, expect, it } from "vitest"
import { collectUnifiedDiffTargetFiles, validateUnifiedDiffTargetFiles } from "../src/index"

describe("collectUnifiedDiffTargetFiles", () => {
  it("parses multiple files from diff --git headers", () => {
    const diff = [
      "diff --git a/src/App.tsx b/src/App.tsx",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
      "diff --git a/src/Other.tsx b/src/Other.tsx",
      "@@ -1,1 +1,1 @@",
      "-foo",
      "+bar",
    ].join("\n")
    const result = collectUnifiedDiffTargetFiles(diff)
    expect(result).toEqual({ ok: true, files: ["src/App.tsx", "src/Other.tsx"] })
  })

  it("parses plain unified diff headers and skips hunk-body --- / +++ lines", () => {
    const diff = [
      "--- a/src/App.tsx",
      "+++ b/src/App.tsx",
      "@@ -1,3 +1,3 @@",
      " context",
      "---- not a header",
      "+++ also not a header",
      " context",
    ].join("\n")
    const result = collectUnifiedDiffTargetFiles(diff)
    expect(result).toEqual({ ok: true, files: ["src/App.tsx"] })
  })

  it("ignores /dev/null but keeps the real path for added and deleted files", () => {
    const diff = [
      "--- /dev/null",
      "+++ b/src/New.tsx",
      "@@ -0,0 +1,1 @@",
      "+created",
      "--- a/src/Removed.tsx",
      "+++ /dev/null",
      "@@ -1,1 +0,0 @@",
      "-deleted",
    ].join("\n")
    const result = collectUnifiedDiffTargetFiles(diff)
    expect(result).toEqual({ ok: true, files: ["src/New.tsx", "src/Removed.tsx"] })
  })

  it("rejects absolute target paths", () => {
    const diff = ["--- a//etc/passwd", "+++ b//etc/passwd", "@@ -1,1 +1,1 @@", "-a", "+b"].join(
      "\n",
    )
    const result = collectUnifiedDiffTargetFiles(diff)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.message === "file must be relative")).toBe(true)
    }
  })

  it("rejects .. path traversal", () => {
    const diff = [
      "diff --git a/../secrets.txt b/../secrets.txt",
      "@@ -1,1 +1,1 @@",
      "-a",
      "+b",
    ].join("\n")
    const result = collectUnifiedDiffTargetFiles(diff)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.message === "file must not contain ..")).toBe(true)
    }
  })

  it("reports when no file header targets a repository file", () => {
    const result = collectUnifiedDiffTargetFiles("just some text\nwithout headers")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]).toEqual({
        path: "diffPreview",
        message: "diff must include file headers that target repository files",
      })
    }
  })
})

describe("validateUnifiedDiffTargetFiles", () => {
  it("accepts a diff whose targets are all within allowedFiles", () => {
    const diff = ["--- a/src/App.tsx", "+++ b/src/App.tsx", "@@ -1,1 +1,1 @@", "-a", "+b"].join("\n")
    const result = validateUnifiedDiffTargetFiles(diff, ["src/App.tsx", "src/Unused.tsx"])
    expect(result).toEqual({ ok: true, files: ["src/App.tsx"] })
  })

  it("returns a stable issue when a diff target is outside allowedFiles", () => {
    const diff = [
      "diff --git a/src/App.tsx b/src/App.tsx",
      "@@ -1,1 +1,1 @@",
      "-a",
      "+b",
      "diff --git a/src/Secret.tsx b/src/Secret.tsx",
      "@@ -1,1 +1,1 @@",
      "-c",
      "+d",
    ].join("\n")
    const result = validateUnifiedDiffTargetFiles(diff, ["src/App.tsx"])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]).toEqual({
        path: "diffPreview",
        message: "diff targets files outside the allow-list: src/Secret.tsx",
      })
    }
  })

  it("propagates unsafe-path issues from collection", () => {
    const diff = ["--- a/../escape.txt", "+++ b/../escape.txt", "@@ -1,1 +1,1 @@", "-a", "+b"].join(
      "\n",
    )
    const result = validateUnifiedDiffTargetFiles(diff, ["../escape.txt"])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.message === "file must not contain ..")).toBe(true)
    }
  })
})
