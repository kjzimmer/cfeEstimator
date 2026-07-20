# feedback/

This is where Claude Code leaves results, comments, questions, or flagged blockers after a working session — a clean place to write back to the human without cluttering the requirements docs themselves.

Suggested naming: `YYYY-MM-DD-topic.md`.

Human reviews this folder periodically. Resolved items get deleted (git remembers); anything that changes a requirement gets folded into the relevant doc and then deleted from here, same as `incoming/`.

Use this for things like:
- "Built X per `incoming/2026-07-20-topic.md`, here's what I decided when the spec was ambiguous, flag if wrong"
- "Blocked on Y, need a decision before continuing"
- "Noticed Z doesn't match how the code actually works now, should the doc update?"
