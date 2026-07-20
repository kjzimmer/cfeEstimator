# Agent Sidebar

- Project page: two-panel layout — conversation on one side, live project-definition view on the other
- Conversation: persistent, multi-user, shared thread; every participant's messages and the agent's responses are visible to everyone on the project
- On each agent turn, assemble context from: Company Info + this project's definition JSON + full message thread + any uploaded files for this project. Call Claude. Post response into the thread.
- Agent writes to project data via tool-calling against the same API the UI uses — see `api-architecture.md`
- **The definition panel should visibly update as the agent extracts information from conversation** — this is the single most important thing to get feeling smooth this phase. If time runs short, protect this over other features (e.g., cut file upload before cutting this).
- Message model includes a `type` field (`text` | `file` | `audio`) even though only `text` and `file` are used this phase — keeps audio additive later.

## Not this phase
- Cross-project historical context in agent reasoning (agent only sees the current project's own thread + files this phase, even though the long-term design should support pulling from historical projects too)
- Bid/report generation as a structured, exportable output
