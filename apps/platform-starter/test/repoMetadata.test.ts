import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { createGitHeadCommitReader } from "../src/repoMetadata"

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url))

describe("createGitHeadCommitReader", () => {
  it("reads the current HEAD commit equal to git rev-parse HEAD", async () => {
    const expected = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"]).toString().trim()
    const reader = createGitHeadCommitReader()
    const commit = await reader(repoRoot)
    expect(commit).toBe(expected)
  })

  it("throws a readable error when the directory is not a git repository", async () => {
    const reader = createGitHeadCommitReader()
    await expect(reader("/nonexistent-not-a-git-repo-xyz")).rejects.toThrow()
  })
})
