import { createPlatformServer } from "./server"
import {
  createPlatformServerOptionsFromEnv,
  describePatchProviderStartup,
  readPlatformPortFromEnv,
  resolvePatchProviderKind,
} from "./env"

const port = readPlatformPortFromEnv(process.env)
const options = createPlatformServerOptionsFromEnv(process.env)
const patchProviderKind = resolvePatchProviderKind(process.env)
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
  console.log(`[platform-starter] ${describePatchProviderStartup(patchProviderKind)}`)
  if (options.imageStorageProvider) {
    console.log(`[platform-starter] image storage enabled`)
  } else {
    console.log(`[platform-starter] image storage disabled`)
  }
})
