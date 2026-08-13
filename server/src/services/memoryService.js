import { pool } from '../db/pool.js';

// Agent Memory, Phase 1 (docs/requirements/agent-memory.md). Company-wide
// context, not project-scoped -- see agentService.js's prompt-assembly hook
// for how this actually reaches the agent.

export async function listActiveProcedural() {
  const { rows } = await pool.query(
    `SELECT * FROM procedural_memory WHERE status = 'active' ORDER BY created_at`
  );
  return rows;
}

// Phase 1 only ever produces 'confirmed' (human_asserted, promoted straight
// from the review queue) -- 'hypothesis' rows don't exist yet, but included
// here too since agent-sidebar.md's prompt-assembly hook spec says both
// confirmed and hypothesis should feed the prompt once Phase 2 exists, and
// there's no reason to gate that on a future migration.
export async function listActiveSemantic() {
  const { rows } = await pool.query(
    `SELECT * FROM semantic_memory WHERE status IN ('confirmed', 'hypothesis') ORDER BY created_at`
  );
  return rows;
}

// The intake tool's write path. Phase 1 is explicit-ask-only, so every entry
// created here is human_asserted / human_asserted -- 'agent_proposed' and
// 'agent_inferred' are valid schema values but nothing in this phase writes
// them (proactive capture is out of scope; see the doc).
export async function proposeEntry({ type, content, proposedBy, sourceConversationRef }) {
  if (type === 'procedural') {
    const { rows } = await pool.query(
      `INSERT INTO procedural_memory (instruction, status, source, proposed_by)
       VALUES ($1, 'proposed', 'human_asserted', $2)
       RETURNING *`,
      [content, proposedBy ?? null]
    );
    return { type: 'procedural', entry: rows[0] };
  }
  if (type === 'semantic') {
    const sourceRefs = sourceConversationRef ? [sourceConversationRef] : [];
    const { rows } = await pool.query(
      `INSERT INTO semantic_memory (content, status, origin, source_refs, proposed_by)
       VALUES ($1, 'proposed', 'human_asserted', $2::jsonb, $3)
       RETURNING *`,
      [content, JSON.stringify(sourceRefs), proposedBy ?? null]
    );
    return { type: 'semantic', entry: rows[0] };
  }
  throw new Error(`Unknown memory type: ${type}`);
}

// Flat combined queue -- see docs/requirements/agent-memory.md ("one
// combined view or two tabs"; combined here, client can still split by
// `type` if a tabbed view is wanted later without a server change).
export async function listProposals() {
  const [{ rows: procedural }, { rows: semantic }] = await Promise.all([
    pool.query(`SELECT * FROM procedural_memory WHERE status = 'proposed' ORDER BY created_at`),
    pool.query(`SELECT * FROM semantic_memory WHERE status = 'proposed' ORDER BY created_at`),
  ]);
  return [
    ...procedural.map((r) => ({ type: 'procedural', ...r })),
    ...semantic.map((r) => ({ type: 'semantic', ...r })),
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export async function reviewProcedural(id, decision, reviewedBy) {
  const status = decision === 'accept' ? 'active' : 'retired';
  const { rows } = await pool.query(
    `UPDATE procedural_memory
     SET status = $2, reviewed_by = $3, reviewed_at = now()
     WHERE id = $1 AND status = 'proposed'
     RETURNING *`,
    [id, status, reviewedBy]
  );
  return rows[0] || null;
}

// Accepted human_asserted entries promote straight to 'confirmed', not
// 'hypothesis' -- the admin's accept decision here *is* the company-level
// check Phase 2's Company Memory Agent would otherwise perform. See the
// doc's "Flagged decision" note.
export async function reviewSemantic(id, decision, reviewedBy) {
  const status = decision === 'accept' ? 'confirmed' : 'retired';
  const { rows } = await pool.query(
    `UPDATE semantic_memory
     SET status = $2, reviewed_by = $3, reviewed_at = now(),
         confirmed_at = CASE WHEN $2 = 'confirmed' THEN now() ELSE confirmed_at END,
         confirmed_via = CASE WHEN $2 = 'confirmed' THEN 'phase1_review_queue' ELSE confirmed_via END
     WHERE id = $1 AND status = 'proposed'
     RETURNING *`,
    [id, status, reviewedBy]
  );
  return rows[0] || null;
}
