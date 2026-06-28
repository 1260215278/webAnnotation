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
