import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

/**
 * Resolves the current HEAD commit of a repository. The default runtime adapter
 * runs a read-only `git -C <repoRoot> rev-parse HEAD`; tests inject a fake reader.
 */
export type RepoHeadCommitReader = (repoRoot: string) => Promise<string>

/**
 * Build the default read-only git HEAD reader. It never writes, applies patches,
 * commits, or pushes; it only resolves the current commit hash.
 */
export function createGitHeadCommitReader(): RepoHeadCommitReader {
  return async (repoRoot) => {
    const { stdout } = await execFileAsync("git", ["-C", repoRoot, "rev-parse", "HEAD"])
    const commit = stdout.trim()
    if (commit === "") {
      throw new Error("git rev-parse HEAD returned an empty commit")
    }
    return commit
  }
}
