# UX tweaks + file viewer — pending review

Per the doc-ownership process agreed this session (see note at bottom), these are session outputs that touch or extend docs I don't own (`UX_design.md`, `projects.md`/`agent-sidebar.md`). The code is shipped; `UX_design.md` itself has been left untouched/reverted. This file is the proposal for you and the DevOps agent to review and fold in (or reject) as you see fit.

## 1. Background color darkened

**What shipped:** `--color-bg` in `client/src/index.css` changed from `#F7F8F7` to `#E9ECEB`. Requested directly by you ("make the background a bit darker to make the text easier to see").

**Proposed doc change**, if you want to adopt it — replace the Background line under Tokens > Color in `UX_design.md`:
> - Background: `#E9ECEB` (cool light gray, not cream — darkened slightly from the original `#F7F8F7` for contrast against white cards)

## 2. Top nav bar made sticky

**What shipped:** `NavShell.jsx`'s `<header>` now has `sticky top-0 z-10`, so nav/sign-out stay visible while scrolling. Also requested directly by you.

**Proposed doc addition**, if adopted — new line under Layout concept in `UX_design.md`:
> The top nav bar is sticky (stays visible on scroll) — nav and sign-out stay reachable without scrolling back up on longer pages.

## 3. Uploaded files are now clickable (view-in-modal)

**What shipped:** clicking a 📎 file message in the conversation opens a modal — inline preview for images/PDFs, download link for other types. New component `FileViewerModal.jsx`; extended `api.fetchFileBlobUrl` to also surface the response's Content-Type.

This doesn't contradict anything currently written in `projects.md` or `agent-sidebar.md` (neither says files can't be viewed — they're just silent on it), so it's not a documented deviation, just unspec'd scope I filled in at your request. Flagging in case you want `projects.md`'s file-upload section to explicitly mention viewing as a capability going forward. Confirmed: the agent still only sees filenames, not file content — this doesn't touch the OCR/extraction item already tracked in `functional_requirements.md`'s near-term list.

## Note on process

This is the first feedback file written under a new convention: I (Claude) don't edit `vision.md`, `functional_requirements.md`, `requirements/*.md`, `UX_design.md`, or `coding-standards.md` directly — those are owned by you/the DevOps agent. When a session produces a deviation from what's written (whether from my own judgment or your direct request), it gets written up here instead, for you to fold into the actual docs on your own review cadence. Code and this feedback folder are the only things I write to directly.

One open question raised back to you in-session, not yet resolved: `CLAUDE.md`'s working agreement currently has me fold `docs/incoming/` content directly into `requirements/*.md` myself (rule 2) — that's the same category of direct edit to an owned doc. Worth deciding whether that rule should change too, for consistency.
