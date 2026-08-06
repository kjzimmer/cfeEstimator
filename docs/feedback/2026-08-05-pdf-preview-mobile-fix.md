# PDF preview: fixed for mobile, not built against an incoming/ file

Not built against a specific `docs/incoming/` file — this came out of the human demoing on an Android tablet and hitting a broken work order PDF preview. Documenting here since it changed how file preview works and added a new client dependency.

## Problem
`FileViewerModal` previewed PDFs via `<iframe src={blobUrl}>`. On Android Chrome (and mobile browsers generally), that doesn't work: mobile browsers don't have a native PDF renderer usable inside an iframe (only as a full top-level page). Android then tried to hand the PDF off to an external viewer app, but the URL was a `blob:` URL — valid only inside the tab that created it — so the external app couldn't fetch it. Result: blank screen with what looked like a stray UUID and a dead "OK" button.

## Interim fix (shipped first, since superseded)
Swapped the iframe for a "PDFs open in a new tab" message + link (`target="_blank"`), reusing the pattern already used for non-previewable file types. This worked — Android's native viewer can render a top-level navigation to a PDF blob even though it can't render one in an iframe — but it was a clunky two-step (click "View" → click "Open PDF" → new tab), and the human didn't want tab clutter on a tablet used for repeated demoing.

## Final fix: render PDFs in-modal with pdf.js, not the browser's native viewer
Added `react-pdf` (a wrapper around `pdfjs-dist`) and render each page to a `<canvas>` inside the existing modal, instead of relying on any browser/OS PDF capability at all. This is the actual fix for the underlying platform gap, not a workaround: pdf.js is pure JS/WASM, so it renders identically on desktop, Android, and iOS — there's no "does this browser support inline PDF" question left to hit again on some other device later.

Implementation notes:
- `react-pdf` added to `client/package.json` **`dependencies`**, not `devDependencies` — per `operations.md`, Nixpacks installs with `NODE_ENV=production` and skips devDependencies, and this is needed at runtime (bundled into the client), not just for local dev.
- The pdf.js worker script is imported via Vite's `?url` suffix (`import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'`) so Vite bundles it as a proper hashed static asset rather than relying on a CDN. Deliberately avoided a CDN-hosted worker (the more common quick recipe) to avoid a new runtime dependency on an external host being reachable in production.
- Page width is measured from the modal's own container via a ref + resize listener, so pages scale to fit the modal instead of using a fixed pixel width.
- Text/annotation layers are disabled (`renderTextLayer={false}`, `renderAnnotationLayer={false}`) — not needed for a read-only preview, and skipping them avoids extra CSS imports.
- Verified with a local `npm run build` (Vite) that the worker chunk bundles and resolves correctly — this was the main risk with this approach. Not yet verified on an actual Android device by me; that's on the human to confirm post-deploy.

## Worth flagging
- This is a real dependency addition (`react-pdf` + `pdfjs-dist`, ~46 packages), not just a markup change — didn't stop to ask first since it's a client-side library, not new infra/a new external service in the sense `coding-standards.md` asks to flag, but noting it here for visibility.
- `npm run build` reported the main JS chunk is now over the 500kB warning threshold (pdfjs-dist is not small). Not addressed — prototype phase, not worth code-splitting yet — but worth revisiting (dynamic `import()` for the viewer) if bundle size becomes an actual complaint.

## Follow-up regression, caught by the human: no way to print or download
Canvas-rendered pages aren't a real embedded document as far as the browser is concerned — there's no native "Save as" and no print recognition on a `<canvas>`, so switching from the iframe/new-tab approach to in-modal canvas rendering silently dropped both capabilities. Neither doc nor I caught this when the canvas approach shipped; the human noticed it in actual use.

Fixed by adding two explicit links to the modal header (PDF only): **Download** (`<a href={blobUrl} download>`, same idiom already used for non-previewable file types) and **Open / Print**, which opens the blob URL in a new tab — handing off to the browser's own native PDF viewer, which has Print built into its toolbar on both desktop Chrome and Android Chrome. Keeps the in-modal canvas preview as the default smooth path, restores what regressed as secondary actions rather than reverting the underlying fix.

**Lesson for next time a preview mechanism changes**: a "preview" and a "the user's only access to this file" are different requirements, and this file viewer is the latter — it's the only UI path to a work order PDF. Any future change to how it renders needs an explicit check for "can the user still get the file out of the app" (download, print, share), not just "does it look right on screen."
