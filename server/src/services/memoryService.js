import { pool } from '../db/pool.js';

// Agent Memory, Phase 1 (docs/requirements/agent-memory.md). Company-wide
// context, not project-scoped -- see agentService.js's prompt-assembly hook
// for how this actually reaches the agent.

// 'hypothesis' included alongside 'active' -- see the schema comment. A
// proactively-formed hypothesis is usable the moment it's created, same as
// semantic_memory's hypothesis status below; it doesn't wait for a human to
// promote it first.
export async function listActiveProcedural() {
  const { rows } = await pool.query(
    `SELECT * FROM procedural_memory WHERE status IN ('active', 'hypothesis') ORDER BY created_at`
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

// Retired-history view -- rejected entries were previously only visible via
// a direct DB query, with no way to tell what was rejected or why from the
// app itself. Same combined flat-list shape as listProposals().
export async function listRetired() {
  const [{ rows: procedural }, { rows: semantic }] = await Promise.all([
    pool.query(`SELECT * FROM procedural_memory WHERE status = 'retired' ORDER BY reviewed_at DESC`),
    pool.query(`SELECT * FROM semantic_memory WHERE status = 'retired' ORDER BY reviewed_at DESC`),
  ]);
  return [
    ...procedural.map((r) => ({ type: 'procedural', ...r })),
    ...semantic.map((r) => ({ type: 'semantic', ...r })),
  ].sort((a, b) => new Date(b.reviewed_at) - new Date(a.reviewed_at));
}

// Activates the 'agent_proposed' path reserved (but unused) since Phase 1 --
// see docs/feedback/. Lands in the review queue, gated behind a human accept
// -- superseded in practice by formProceduralHypothesis() below for most
// agent-inferred observations, per Karl's stated operating model (review will
// be rare; hypotheses should take effect immediately and get refined through
// evidence, not wait behind a queue). Left in place for a case that
// genuinely warrants a hard gate before taking effect, if one comes up.
export async function proposeFromAgent({ instruction, sourceRefs = [] }) {
  const { rows } = await pool.query(
    `INSERT INTO procedural_memory (instruction, status, source, source_refs)
     VALUES ($1, 'proposed', 'agent_proposed', $2::jsonb)
     RETURNING *`,
    [instruction, JSON.stringify(sourceRefs)]
  );
  return rows[0];
}

// The "teachable moment" loop, generalized beyond resource corrections:
// after any substantive request, correction, or preference -- not just an
// explicit "remember this" -- an agent can form a hypothesis about a pattern
// that might generalize beyond the one project it came from. Active
// immediately (no review gate), and reinforced rather than duplicated on an
// exact repeat -- an approximation of "cementing through repetition" for the
// case where the same instruction text comes up again. A reworded repeat
// won't be caught by this (needs real judgment, not a string match, same
// limitation as the task/dependency exact-name duplicate check) -- the
// model seeing what's already active is what's meant to catch that case.
export async function formProceduralHypothesis({ instruction, sourceRefs = [] }) {
  const trimmed = instruction.trim();
  const evidenceEntry = { type: 'observed_instance', sourceRefs, at: new Date().toISOString() };

  const { rows: existingRows } = await pool.query(
    `SELECT * FROM procedural_memory WHERE lower(instruction) = lower($1) AND status IN ('proposed', 'hypothesis', 'active')`,
    [trimmed]
  );
  if (existingRows[0]) {
    const { rows } = await pool.query(
      `UPDATE procedural_memory SET evidence = evidence || $2::jsonb WHERE id = $1 RETURNING *`,
      [existingRows[0].id, JSON.stringify([evidenceEntry])]
    );
    return rows[0];
  }

  const { rows } = await pool.query(
    `INSERT INTO procedural_memory (instruction, status, source, source_refs, evidence)
     VALUES ($1, 'hypothesis', 'agent_proposed', $2::jsonb, $3::jsonb)
     RETURNING *`,
    [trimmed, JSON.stringify(sourceRefs), JSON.stringify([evidenceEntry])]
  );
  return rows[0];
}

// Same as formProceduralHypothesis, for a domain fact (semantic) rather than
// a behavioral convention (procedural) -- standalone, unlike
// recordResourceCorrection's hypothesis creation which is always tied to a
// specific resource correction. This is for an ordinary conversational
// observation with no prior estimate to correct.
// appliesWhen is required whenever content states a number -- found via a
// real bad hypothesis this was built to prevent: "mobilization typically
// takes about 2 hours" with no mention that this was for a ~90 mile trip.
// Mobilization time is fundamentally a function of distance; a bare
// duration with nothing said about what it depends on is a near-guaranteed
// misapplication waiting to happen, not a real generalization. Rejecting
// outright rather than only asking nicely in the tool description -- same
// reasoning as the vague-unit denylist elsewhere in this pipeline: this
// specific failure mode has already been observed live, so it gets a
// structural check, not just a prompt request.
export async function formSemanticHypothesis({ content, appliesWhen = '', sourceRefs = [] }) {
  const trimmed = content.trim();
  if (/\d/.test(trimmed) && !appliesWhen.trim()) {
    throw new Error(
      `"${trimmed}" states a number with no stated condition. A duration/quantity/rate needs to say what it's ` +
      `anchored to (e.g. distance, crew size, job size) or it's likely to be misapplied outside the one instance ` +
      `it came from. Either state the condition this applies under, or describe the relationship (e.g. ` +
      `"mobilization time scales with distance") instead of asserting a fixed number.`
    );
  }
  const finalContent = appliesWhen.trim() ? `${trimmed} (applies when: ${appliesWhen.trim()})` : trimmed;
  const evidenceEntry = { type: 'observed_instance', sourceRefs, at: new Date().toISOString() };

  const { rows: existingRows } = await pool.query(
    `SELECT * FROM semantic_memory WHERE lower(content) = lower($1) AND status IN ('proposed', 'hypothesis', 'confirmed')`,
    [finalContent]
  );
  if (existingRows[0]) {
    const { rows } = await pool.query(
      `UPDATE semantic_memory SET evidence = evidence || $2::jsonb WHERE id = $1 RETURNING *`,
      [existingRows[0].id, JSON.stringify([evidenceEntry])]
    );
    return rows[0];
  }

  const { rows } = await pool.query(
    `INSERT INTO semantic_memory (content, status, origin, source_refs, evidence)
     VALUES ($1, 'hypothesis', 'agent_inferred', $2::jsonb, $3::jsonb)
     RETURNING *`,
    [finalContent, JSON.stringify(sourceRefs), JSON.stringify([evidenceEntry])]
  );
  return rows[0];
}

// The "teach the agent" loop, happening as a side effect of normal work-order
// review rather than a separate learning workflow: when a human corrects an
// AI-estimated resource requirement, capture that correction as evidence --
// either against the semantic memory hypothesis the estimate already cited,
// or as a brand-new hypothesis if it didn't cite one yet. Writes 'hypothesis'
// status directly (the schema's reserved "Phase 2 rationale-driven
// agent_inferred path, bypassing the Phase 1 proposal queue") -- these feed
// future prompts via listActiveSemantic() immediately, without a human review
// step; promoting a hypothesis to 'confirmed' (or retiring it) once enough
// evidence accumulates is the Company Memory Agent's job, not built yet.
// No-op for human_added requirements (nothing to correct) or a no-op edit.
export async function recordResourceCorrection({ requirement, corrected }) {
  if (requirement.created_via !== 'resource_estimation') return null;

  // A rationale change counts as worth recording on its own, not just a
  // number change -- per Karl: a number is never itself the rationale, the
  // reasoning behind it is. A human adding real logic to an estimate that
  // already happened to land on a reasonable number is exactly the kind of
  // correction this exists to capture, not just "the value moved."
  const changed =
    Number(requirement.qty) !== Number(corrected.qty) ||
    (requirement.basis_rate !== null && requirement.basis_rate !== undefined
      ? Number(requirement.basis_rate) !== Number(corrected.basisRate ?? requirement.basis_rate)
      : corrected.basisRate !== null && corrected.basisRate !== undefined) ||
    requirement.description.trim().toLowerCase() !== corrected.description.trim().toLowerCase() ||
    (requirement.rationale || '').trim() !== (corrected.rationale || '').trim();
  if (!changed) return null;

  const evidenceEntry = {
    type: 'human_correction',
    task_id: requirement.task_id,
    requirement_id: requirement.id,
    original: {
      description: requirement.description,
      qty: requirement.qty,
      unit: requirement.unit,
      basisQuantity: requirement.basis_quantity,
      basisRate: requirement.basis_rate,
      rationale: requirement.rationale || '',
    },
    corrected: {
      description: corrected.description,
      qty: corrected.qty,
      unit: corrected.unit,
      basisQuantity: corrected.basisQuantity ?? null,
      basisRate: corrected.basisRate ?? null,
      rationale: corrected.rationale || '',
    },
    at: new Date().toISOString(),
  };

  const cited = (requirement.source_refs || []).find((r) => r.type === 'semantic_memory_hypothesis' && r.id);
  if (cited) {
    const { rows } = await pool.query(
      `UPDATE semantic_memory SET evidence = evidence || $2::jsonb WHERE id = $1 RETURNING *`,
      [cited.id, JSON.stringify([evidenceEntry])]
    );
    return rows[0] || null;
  }

  // Prefer the human's own stated reasoning as the hypothesis content --
  // that reasoning is the actual thing worth remembering and reusing next
  // time, not just "the number changed." Falls back to a generic (and
  // honestly weaker) placeholder when no reasoning was given, rather than
  // inventing logic that wasn't actually stated.
  const hasReasoning = corrected.rationale && corrected.rationale.trim().length > 0;
  const fmt = (qty, unit) => `${qty}${unit ? ` ${unit}` : ''}`;
  const content = hasReasoning
    ? `For "${corrected.description}": ${corrected.rationale.trim()} (corrected from an AI estimate of ${fmt(requirement.qty, requirement.unit)} to ${fmt(corrected.qty, corrected.unit)}.)`
    : `A human corrected an AI-estimated resource requirement for "${requirement.description}" (${fmt(requirement.qty, requirement.unit)} -> ${fmt(corrected.qty, corrected.unit)}) without stating a reason -- the corrected value alone isn't a confirmed tendency, just a data point.`;

  const { rows } = await pool.query(
    `INSERT INTO semantic_memory (content, status, origin, source_refs, evidence)
     VALUES ($1, 'hypothesis', 'agent_inferred', $2::jsonb, $3::jsonb)
     RETURNING *`,
    [
      content,
      JSON.stringify([{ type: 'task_resource_requirement', id: requirement.id }]),
      JSON.stringify([evidenceEntry]),
    ]
  );
  return rows[0];
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
