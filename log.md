# Development Log

Short public milestones for the project. This file intentionally avoids detailed implementation notes.

## 2026-06-28

- Defined the initial product direction: AI-first web annotation for code-change workflows.
- Chose a layered architecture: runtime SDK, Vite plugin, Node kit, CLI, and self-hosted platform starter.
- Set the repository rule that local design, plan, and progress files stay out of git.
- Initialized the remote repository with the submit-boundary `.gitignore`.
- Added the first public `README.md` and concise development log.
- Added the first Runtime SDK MVP with DOM selection, floating annotation input, payload creation, and submission hooks.
- Added a minimal Vite playground for local end-to-end validation.
- Added typecheck, test, and build verification for the monorepo.
- Added the first Vite React source metadata MVP with `source` / `safe` / `disabled` modes.
- Added a React + Vite example that submits payloads containing `annotations[].target.source`.
- Added the Node protocol kit MVP: payload and manifest validation, safe-mode source resolution, and deterministic AI patch prompt context.
- Added the Platform Starter ingest API MVP: a minimal HTTP service that validates payloads, resolves safe-mode sources, and stores tasks in memory.
- Added the Platform Starter mock patch proposal MVP: tasks flow from `received` to `patch_proposed` via a deterministic, idempotent `POST /api/tasks/:id/mock-patch`.
- Added a minimal bilingual static-HTML task console (served at `/` and `/console`) for browsing tasks, viewing details, and triggering mock patches without curl.
- Added the Node kit repo source context helper: safely reads repo source snippets referenced by annotation source metadata, with path-traversal, oversize, and binary protection.
- Integrated repo source-context collection into Platform Starter, including the API endpoint, task summaries, and bilingual console display.
- Added a pluggable Platform Starter patch provider interface and `/api/tasks/:id/patch` endpoint for future AI-backed proposal generation.
- Added a generic HTTP patch provider adapter so external AI/custom services can implement the patch proposal protocol.
- Added a Platform Starter patch proposal review state: `POST /api/tasks/:id/patch-review` records an accept/reject/changes_requested decision (decision only, no patch applied), surfaced in task summaries, detail, and the bilingual console.
- Added Platform Starter patch artifact export: `GET /api/tasks/:id/patch-artifact` returns an export-only `web-annotation.patch-artifact.v1` JSON artifact for downstream apply workflows.
- Added the `@web-annotation/cli` preview MVP: `web-annotation preview --file <artifact.json>` validates and prints a deterministic preview of an exported patch artifact (reads the artifact only; never applies the patch, writes files, or calls Git).
- Added the `@web-annotation/cli` apply dry-run/preflight MVP: `web-annotation apply --file <artifact.json> --dry-run` checks a clean git repo, validates suggested file paths, and prints a deterministic no-write plan.
- Added the `@web-annotation/cli` patch check MVP: `web-annotation apply --file <artifact.json> --check` runs `git apply --check` against the artifact diff preview without writing files.
