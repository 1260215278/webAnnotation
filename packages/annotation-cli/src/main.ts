#!/usr/bin/env node
import { readFile } from "node:fs/promises"
import { runPreviewCommand } from "./index"

void runPreviewCommand(process.argv.slice(2), {
  readFile: (file) => readFile(file, "utf8"),
}).then((result) => {
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exitCode = result.code
})
