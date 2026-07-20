# API Architecture

## Principle
The agent is a client of the API, not a special case. It never gets a direct path to the database that bypasses the API. All project reads/writes the agent performs go through the same endpoints the UI uses.

## How the agent writes data
The agent uses Claude's tool-calling (function calling) to invoke real API operations — not prose that gets parsed afterward into structured data. Use one generic tool for updating a project component, e.g.:

```
updateProjectComponent(projectId, componentKey, content)
```

One generic tool, not one per component type (`updateSOW`, `updateLocation`, etc.) — this keeps tool-calling compatible with the JSON-blob, evolving-shape project definition described in `projects.md`, without needing a fixed schema per field.

## Open decision — not yet made
Should the agent be allowed to write project fields autonomously, or must a human confirm first?

- This phase: default to autonomous writes. More impressive for a demo, less UI to build.
- Before any real bids/billing numbers are on the line: revisit this. Autonomous writes to numbers that matter probably need a confirm step.

## Minimum API surface needed for the current phase
- Project: create, list, get, update definition component
- Messages: list (thread), append
- Files: upload, list, get
- Company Info: get, update section
