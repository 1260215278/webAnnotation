import { createPlatformServer } from "./server"
import { createPlatformServerOptionsFromEnv, readPlatformPortFromEnv } from "./env"

const port = readPlatformPortFromEnv(process.env)
const options = createPlatformServerOptionsFromEnv(process.env)
const { server } = createPlatformServer(options)

server.listen(port, () => {
  const base = `http://localhost:${port}`
  console.log(`[platform-starter] ingest API listening on ${base}`)
  console.log(`[platform-starter] task console at ${base}/console`)
  if (options.repoRoot) {
    console.log(`[platform-starter] repo source context enabled`)
  } else {
    console.log(`[platform-starter] repo source context disabled`)
  }
  if (options.patchProvider) {
    console.log(`[platform-starter] HTTP patch provider enabled`)
  } else {
    console.log(`[platform-starter] patch provider disabled`)
  }
})
