# incoming/

The human/DevOps agent drops **finished** requirement content here — not raw notes. This is what Claude Code builds against.

Suggested naming: `YYYY-MM-DD-topic.md`.

**Claude Code reads this folder but never edits, moves, renames, or deletes anything in it.** Building code against a file here is not the same as finalizing the corresponding `requirements/` doc — that only happens through `incoming/approved/` (see below and `docManagement.md`).

When Claude Code finishes implementing against a file here, it writes a note in `docs/feedback/` referencing which file it built against.

## approved/

The approval gate. A file only appears here once someone with actual approval authority (the human, or — in the future — a persistent DevOps agent) has explicitly signed off that it's ready to become the permanent record.

Each file must declare its destination on the first line:
```
<!-- target: docs/requirements/projects.md -->
```

Claude Code's handling of this folder is mechanical and requires no judgment: copy everything **after** the `target` line — not the `target` line itself — into its declared destination, delete the file from `approved/`, confirm in `feedback/`. If `target` is missing or doesn't point somewhere `requirements/`-shaped, stop and write it up in `feedback/` instead of guessing.
