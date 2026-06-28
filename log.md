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
