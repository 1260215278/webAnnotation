#!/usr/bin/env node
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { promisify } from "node:util"
import { runCliCommand } from "./index"

const execFileAsync = promisify(execFile)

async function readGit(args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { encoding: "utf8" })
  return String(result.stdout).trimEnd()
}

void runCliCommand(process.argv.slice(2), {
  readFile: (file) => readFile(file, "utf8"),
  getRepoRoot: () => readGit(["rev-parse", "--show-toplevel"]),
  getGitStatus: () => readGit(["status", "--short"]),
}).then((result) => {
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exitCode = result.code
})
