import { createPlatformServer } from "./index"

const port = Number(process.env.PORT ?? 4319)
const repoRoot = (process.env.WEB_ANNOTATION_REPO_ROOT ?? process.env.REPO_ROOT)?.trim() || undefined
const { server } = createPlatformServer({ repoRoot })

server.listen(port, () => {
  const base = `http://localhost:${port}`
  console.log(`[platform-starter] ingest API listening on ${base}`)
  console.log(`[platform-starter] task console at ${base}/console`)
  if (repoRoot) {
    console.log(`[platform-starter] repo source context enabled`)
  } else {
    console.log(`[platform-starter] repo source context disabled`)
  }
})
