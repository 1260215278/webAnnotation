#!/usr/bin/env node
import { execFile, spawn } from "node:child_process"
import { readFile, writeFile as fsWriteFile } from "node:fs/promises"
import { promisify } from "node:util"
import { runCliCommand } from "./index"

const execFileAsync = promisify(execFile)

async function readGit(args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { encoding: "utf8" })
  return String(result.stdout).trimEnd()
}

async function execGit(args: string[]): Promise<void> {
  await execFileAsync("git", args, { encoding: "utf8" })
}

async function checkPatch(diffPreview: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", ["apply", "--check"], {
      stdio: ["pipe", "ignore", "pipe"],
    })
    let stderr = ""
    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `git apply --check exited with code ${code}`))
    })
    child.stdin.end(diffPreview)
  })
}

async function applyPatch(diffPreview: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", ["apply"], {
      stdio: ["pipe", "ignore", "pipe"],
    })
    let stderr = ""
    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk) => {
      stderr += chunk
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `git apply exited with code ${code}`))
    })
    child.stdin.end(diffPreview)
  })
}

void runCliCommand(process.argv.slice(2), {
  readFile: (file) => readFile(file, "utf8"),
  getRepoRoot: () => readGit(["rev-parse", "--show-toplevel"]),
  getGitStatus: () => readGit(["status", "--short"]),
  checkPatch,
  checkBranchName: (branchName) => readGit(["check-ref-format", "--branch", branchName]).then(() => undefined),
  createBranch: (branchName) => execGit(["switch", "-c", branchName]),
  applyPatch,
  stageFiles: (files) => execGit(["add", "--", ...files]),
  commitChanges: (message) => execGit(["commit", "-m", message]),
  fetchArtifact: async (url, headers) => {
    const response = await fetch(url, { headers })
    return { ok: response.ok, status: response.status, text: () => response.text() }
  },
  writeFile: (file, content) => fsWriteFile(file, content, "utf8"),
}).then((result) => {
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exitCode = result.code
})
