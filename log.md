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
- Added the `@web-annotation/cli` confirmed apply MVP: `web-annotation apply --file <artifact.json> --yes` checks then applies the artifact diff to the working tree without staging, committing, branching, pushing, or opening a PR.
- Added the `@web-annotation/cli` branch/commit MVP: `web-annotation apply --file <artifact.json> --yes --branch <name> --commit --message <msg>` validates the branch name and message, requires the diff files to match suggested files, then creates a local branch and commit via `git switch -c` / `git apply` / `git add` / `git commit` only (no push, no PR/MR).
- Hardened the CLI diff-target safety check across `--check`, `--yes`, and `--commit`: the diff is parsed for both `diff --git` and plain unified-diff `---`/`+++` file headers (hunk bodies skipped by line count) so a diff can never touch a file outside `suggestedFiles`.
- Added the `@web-annotation/cli` remote pull MVP: `web-annotation pull <task-id> --base-url <platform-url> --out <artifact.json>` fetches a Platform Starter `patch-artifact` over http/https (optional `Authorization: Bearer` token, never leaked), validates it with the existing artifact validator, saves the bare artifact for `preview`, and prints a deterministic pull report (no apply, no git, no commit, no push).
- Added the `@web-annotation/cli` base commit preflight: apply dry-run/check/yes/branch-commit now verifies artifact `project.commit` against local `HEAD` when provided, reports matched/not-provided status, and fails before any patch or git write on mismatch.
- Added Platform Starter commit metadata export: when `repoRoot` is configured, `GET /api/tasks/:id/patch-artifact` stamps the existing `project.commit` field with the current repo `HEAD` via read-only git, while missing `repoRoot` still exports without commit metadata.
- Added a Node kit unified-diff target safety helper (`collectUnifiedDiffTargetFiles` / `validateUnifiedDiffTargetFiles`) and wired it into the Platform Starter provider patch flow, so an external provider's `diffPreview` can only touch files inside its `suggestedFiles`; diffs hitting undeclared files, absolute paths, or `..` traversal are rejected and never stored. The helper runs no git, applies no patch, and reads no repository files.
- Hardened the Platform Starter patch-provider result contract: direct injected providers and the HTTP adapter now share runtime validation for non-empty `summary`, `suggestedFiles`, `diffPreview`, and object `metadata`, with invalid results rejected before any proposal is stored.
- Added `examples/provider-http-mock`: a runnable, dependency-light HTTP patch-provider reference that speaks the `createHttpPatchProvider()` protocol, plus an end-to-end smoke test that drives ingest → provider patch over loopback HTTP → artifact export, confirming provider-result validation and diff-target safety. It uses no model SDK, no outbound network, and no API keys.

## 2026-06-30

- Added image attachments to `AnnotationPayload v1`: an optional `annotations[].attachments[]` of uploaded-image references (no raw bytes), validated by the Node kit and summarized into the AI patch prompt context.
- Added runtime popup image support: select/preview/remove images with per-image uploading/failed status, an `uploadImage` host hook or JSON/base64 `uploadEndpoint`, upload-before-submit, and a small bilingual (zh/en) locale mechanism for SDK text.
- Added a Platform Starter image upload endpoint (`POST /api/uploads/images`) with strict validation, a pluggable `ImageStorageProvider` (plus an in-memory test provider), bilingual task-console attachment thumbnails/links, and attachment metadata in the exported patch artifact.
- Added an OpenAI-compatible model patch provider adapter (injectable fetch, explicit endpoint/model, redacted API key, strict JSON result) with `WEB_ANNOTATION_MODEL_PROVIDER_URL`/`_API_KEY`/`_MODEL` env wiring and explicit conflict handling against the existing HTTP provider URL.
- Updated the playground and React examples to attach images via a mock uploader, and extended the provider mock/smoke tests to confirm the attachment summary flows through ingest → provider → artifact.
- Published the first npm release (`0.1.0`) for `@web-annotation/core`, `@web-annotation/node`, `@web-annotation/vite`, and `@web-annotation/cli`; aligned package metadata/docs and release dependencies so published packages reference `@web-annotation/core@0.1.0` instead of workspace protocol dependencies.
