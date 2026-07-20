# Requirements Breakdown — Index

Top-level requirements live in `../functional_requirements.md` and don't change often. This folder is the detailed, area-by-area breakdown of those — expect it to change shape as we learn what split actually works. Right now it's one file per feature area; that may not survive more than a couple of iterations, and that's fine.

## Files
- `api-architecture.md` — how the agent and UI both interact with project data (read this first, it constrains everything else)
- `auth.md`
- `company-info.md`
- `projects.md` (includes file upload)
- `agent-sidebar.md`

## Current build priority
1. API layer (see `api-architecture.md`)
2. Auth
3. Nav shell (Company Info, Projects list/create, Project page) as a thin client of the API
4. Agent sidebar on the Project page — protect this over everything else this phase, it's the actual demo
5. Company Info: Identity populated, rest stubbed
6. Basic file upload (see `projects.md`)
