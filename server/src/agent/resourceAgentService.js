// Resource Agent (docs/incoming/task-resource-pipeline.md §4, refined per
// Karl -- see docs/feedback/). Estimates labor/material/equipment/other
// resource needs for every approved task, with an explicit basis
// (quantity x rate) and confidence flag on each -- the judgment step that
// feeds resourceRequirementService.generateLineItems' purely mechanical
// grouping/pricing pass.
//
// Single phase, unlike the Task/Dependency Agent's draft->sequence split --
// there's no analogous "attempt X reveals a gap in Y" mechanic here. But
// still verifies structurally rather than trusting the model's own
// stop_reason (same lesson learned from the orphan-task bug): after the main
// pass, check every approved task actually got at least one requirement, and
// run one bounded repair pass naming any that didn't.
import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db/pool.js';
import * as workOrderService from '../services/workOrderService.js';
import * as taskService from '../services/taskService.js';
import * as resourceRequirementService from '../services/resourceRequirementService.js';
import * as memoryService from '../services/memoryService.js';
import * as rateCardService from '../services/rateCardService.js';
import { buildProjectContext } from './taskGenerationService.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-5';
const ESTIMATE_MAX_ROUNDS = 15;
const REPAIR_MAX_ROUNDS = 5;
// See taskGenerationService.js's identical constant for why this exists
// independently of the round caps -- the real cost circuit breaker.
const TOKEN_CEILING = 150_000;
const REQUEST_TIMEOUT_MS = 90_000;

const ADD_RESOURCE_REQUIREMENT_TOOL = {
  name: 'add_resource_requirement',
  description:
    'Record one resource (labor, material, equipment, or other) a specific task genuinely needs, with the ' +
    'basis for the quantity and how confident the estimate is.',
  input_schema: {
    type: 'object',
    properties: {
      taskName: { type: 'string', description: 'Exact name of the task this resource is needed for' },
      resourceType: { type: 'string', enum: ['labor', 'material', 'equipment', 'other'] },
      description: {
        type: 'string',
        description: 'What the resource is -- use an exact rate card name from the vocabulary provided when the resource is genuinely the same thing',
      },
      qty: { type: 'number' },
      unit: {
        type: 'string',
        description:
          'A real, measurable unit -- hr, day, CY, ton, SF, LF, gal, ea, etc. Never a vague placeholder like "job" or ' +
          '"misc". "LS" (lump sum) is only for a genuinely one-time flat item that does not scale with the job\'s size ' +
          'or duration (e.g. a permit fee, mobilization) -- if the resource actually scales with quantity or time ' +
          '(e.g. water usage, consumable materials), use a real unit and a basis instead of defaulting to a flat count.',
      },
      rationale: { type: 'string', description: 'What you assumed and why, in a sentence a reviewer could check -- required' },
      confident: {
        type: 'boolean',
        description:
          "false if this is a guess because the scope data needed to size it isn't actually in the project context -- surfaces it for review rather than hiding the uncertainty. Default true.",
      },
      uncertaintyNote: { type: 'string', description: 'Required when confident is false -- name specifically what information is missing' },
      basisQuantity: {
        type: 'number',
        description: 'The scope quantity this estimate is anchored to, when the estimate is rate-based (e.g. 150 for "150 CY of debris"). Omit for flat/non-rate-based resources.',
      },
      basisQuantityUnit: { type: 'string', description: 'Unit for basisQuantity, e.g. CY, SF, LF' },
      basisRate: {
        type: 'number',
        description: 'The productivity/coverage rate applied, when applicable (e.g. 30 for "30 CY/hr"). Omit for flat/non-rate-based resources.',
      },
      basisRateUnit: { type: 'string', description: 'Unit for basisRate, e.g. CY/hr' },
      semanticMemoryId: {
        type: 'integer',
        description: "The id of an entry from the semantic memory list above, if its CFE-specific tendency drove this estimate's rate or quantity",
      },
    },
    required: ['taskName', 'resourceType', 'description', 'qty', 'unit', 'rationale'],
  },
};

const UPDATE_RESOURCE_REQUIREMENT_TOOL = {
  name: 'update_resource_requirement',
  description:
    'Revise an existing resource requirement (listed with its "existing id" in the task list) because new or ' +
    'different information changes the reasoning behind it. Only call this when there is a real, stateable ' +
    'reason -- leaving an existing requirement untouched is the correct action when it still holds. This ' +
    "replaces the requirement's full current state, so include every field, not just what changed.",
  input_schema: {
    type: 'object',
    properties: {
      requirementId: { type: 'integer', description: 'The "existing id" of the requirement being revised, from the task list above' },
      resourceType: { type: 'string', enum: ['labor', 'material', 'equipment', 'other'] },
      description: { type: 'string' },
      qty: { type: 'number' },
      unit: { type: 'string', description: 'A real, measurable unit -- same rule as add_resource_requirement' },
      rationale: {
        type: 'string',
        description: 'Must explain what changed and why, referencing the new information that prompted the revision -- required',
      },
      confident: { type: 'boolean' },
      uncertaintyNote: { type: 'string', description: 'Required when confident is false' },
      basisQuantity: { type: 'number' },
      basisQuantityUnit: { type: 'string' },
      basisRate: { type: 'number' },
      basisRateUnit: { type: 'string' },
      semanticMemoryId: { type: 'integer', description: 'id of a semantic memory entry, if it drove this revision' },
    },
    required: ['requirementId', 'resourceType', 'description', 'qty', 'unit', 'rationale'],
  },
};

const FLAG_UNRESOLVED_RESOURCE_TOOL = {
  name: 'flag_unresolved_resource',
  description:
    'Use when you genuinely cannot determine what a task needs, instead of silently leaving it with nothing. ' +
    'A live run showed the failure mode this exists to close: the model skipped several tasks with no resource ' +
    'and no explanation at all, indistinguishable from an oversight. Call this for a task you\'ve considered and ' +
    'concluded you lack the information to size -- every task must get either a real resource, a revision ' +
    'decision, or this flag; never silence. This creates a visible, editable placeholder a human can resolve ' +
    'later (through the project conversation, not a form) -- once resolved it feeds back into future estimates ' +
    'the same way any other correction does.',
  input_schema: {
    type: 'object',
    properties: {
      taskName: { type: 'string', description: 'Exact name of the task you cannot size' },
      reason: {
        type: 'string',
        description: 'Specifically what information is missing and why you cannot reasonably assume it -- this is what a human will see and needs to answer',
      },
    },
    required: ['taskName', 'reason'],
  },
};

const PROPOSE_PROCESS_IMPROVEMENT_TOOL = {
  name: 'propose_process_improvement',
  description:
    'Flag a structural, systemic weak point in the estimating process itself for human review (e.g. "this ' +
    'category of task is systematically hard to estimate because the SOW never states X"). Not a per-task ' +
    'comment -- use sparingly, at most once or twice for the whole run.',
  input_schema: {
    type: 'object',
    properties: {
      instruction: { type: 'string', description: 'The systemic observation or suggested process change' },
    },
    required: ['instruction'],
  },
};

const RATE_CARD_TYPES = ['service_rates', 'material_costs', 'equipment_rates', 'employee_role_rates'];

// Rejected outright rather than just discouraged in the prompt -- a live run
// showed the model default to "job" for materials that had a pre-existing
// flat dollar amount to anchor to, with no basis decomposition at all. "LS"
// is the real convention CFE's own rate cards/work orders already use for a
// genuinely non-scaling flat item; these aren't that.
const VAGUE_UNIT_DENYLIST = new Set(['job', 'jobs', 'each job', 'lump sum', 'lumpsum', 'misc', 'miscellaneous']);

async function gatherContext(workOrderId) {
  const workOrder = await workOrderService.getWorkOrder(workOrderId);
  // includeConversation: false -- see buildProjectContext's comment. Confirmed
  // via a real run that omitting this matters: three material requirements
  // came back with qty 1 / unit "job" and no basis at all, echoing a flat
  // dollar amount from the conversation's old work-order narration instead of
  // reasoning out a real quantity.
  const projectContext = await buildProjectContext(workOrder.project_id, { includeConversation: false });
  const allTasks = await taskService.listTasks(workOrderId);
  const approvedTasks = allTasks.filter((t) => t.status === 'approved');

  // A rerun reconciles against this, not a blank slate -- see docs/feedback/.
  // Existing requirements are shown per task with their own id/rationale/
  // human_reviewed flag so the model can leave what still holds alone and
  // only call update_resource_requirement where there's a real reason.
  const existingRequirements = await resourceRequirementService.listRequirements(workOrderId);
  const requirementsByTask = new Map();
  for (const r of existingRequirements) {
    if (!requirementsByTask.has(r.task_id)) requirementsByTask.set(r.task_id, []);
    requirementsByTask.get(r.task_id).push(r);
  }
  const existingReqById = new Map(existingRequirements.map((r) => [r.id, r]));

  const taskListText = approvedTasks.length
    ? approvedTasks
        .map((t) => {
          const reqs = requirementsByTask.get(t.id) || [];
          const reqsText = reqs.length
            ? reqs
                .map((r) => {
                  const basis =
                    r.basis_quantity != null && r.basis_rate != null
                      ? ` [basis: ${r.basis_quantity} ${r.basis_quantity_unit || ''} / ${r.basis_rate} ${r.basis_rate_unit || ''}]`
                      : '';
                  const conf = r.confident === false ? ` (flagged uncertain: ${r.uncertainty_note})` : '';
                  const flag = r.human_reviewed ? ' [HUMAN-REVIEWED -- only revise with a clearly stated new reason]' : '';
                  return `    - [existing id ${r.id}] ${r.resource_type}: ${r.description}, ${r.qty} ${r.unit}${basis}${conf} -- ${r.rationale}${flag}`;
                })
                .join('\n')
            : '    (none yet)';
          const party = t.responsible_party !== 'CFE' ? ` [responsible party: ${t.responsible_party}]` : '';
          return `- ${t.name}${party}${t.description ? `: ${t.description}` : ''}\n${reqsText}`;
        })
        .join('\n')
    : '(no approved tasks)';

  const semanticMemory = await memoryService.listActiveSemantic();
  const semanticMemoryText = semanticMemory.length
    ? semanticMemory.map((m) => `- [id ${m.id}, ${m.status}] ${m.content}`).join('\n')
    : '(none recorded yet -- rely on general construction estimating knowledge, and say so plainly in your rationale)';

  const rateCardEntries = await Promise.all(RATE_CARD_TYPES.map((t) => rateCardService.listItems(t)));
  const rateCardVocabText = RATE_CARD_TYPES.map(
    (type, i) =>
      `${type}:\n${rateCardEntries[i].length ? rateCardEntries[i].map((it) => `  - ${it.name} (${it.unit})`).join('\n') : '  (none configured)'}`
  ).join('\n');

  return { workOrder, approvedTasks, existingReqById, projectContext, taskListText, semanticMemoryText, rateCardVocabText };
}

function buildEstimateSystemPrompt({ projectContext, taskListText, semanticMemoryText, rateCardVocabText }) {
  return `You are estimating the labor, material, equipment, and other resources each approved task in a construction/site-work job needs. This may be a first pass or a rerun reconciling against work already done -- some tasks below already have existing requirements with their own stated reasoning and an id. Treat that as the current state to build on, not a blank slate: your job is to reconcile it against the current project context, not regenerate everything from scratch.

## Approved tasks to estimate for, with any existing resource requirements
${taskListText}

## What CFE already knows about its own resource tendencies (semantic memory)
${semanticMemoryText}

## Existing rate card items (use these exact names when a resource is genuinely the same thing, so it resolves to a real price later instead of staying unresolved)
${rateCardVocabText}

For every task above:
- If it has no existing requirements ("(none yet)"), call add_resource_requirement for each resource it genuinely needs.
- If it already has existing requirements, review each against the current project context and semantic memory. If it still holds, leave it alone -- doing nothing is the correct action, not a missed step. Only call update_resource_requirement when there's a real reason tied to new or different information, and say what that reason is in the revised rationale. Never call add_resource_requirement to duplicate something a task already has.
- Give real deference to anything marked HUMAN-REVIEWED -- a human has already reasoned through that one. Only revise it with a clearly stated reason tied to genuinely new information, never because you'd have guessed differently yourself.
- A task tagged "[responsible party: owner]" or "[responsible party: third_party]" means the *substantive work* belongs to them, not CFE -- never add a resource that describes CFE performing that work (filing their paperwork, paying for their inspection, doing their survey). But CFE still very often spends real time coordinating, tracking, or following up on someone else's task -- when that's genuinely true, add a CFE labor resource for that coordination specifically, described and reasoned as coordination (e.g. "confirm receipt," "follow up on status"), never as if CFE were doing the underlying work itself.

You must account for every task before finishing -- no exceptions, and no silent omissions. For each one, either: leave existing requirements as correctly unchanged, add/revise a real resource, or call flag_unresolved_resource if you genuinely cannot size it. A task ending up with nothing and no explanation is exactly the failure this process must not produce.

- Decompose the basis whenever the estimate is rate-based (labor/equipment hours especially): state the scope quantity you're anchoring to (basisQuantity/basisQuantityUnit) and the productivity/coverage rate you applied (basisRate/basisRateUnit), so qty = basisQuantity / basisRate is checkable later. Not every resource decomposes this way -- a flat item (e.g. a permit fee) doesn't need basis fields.
- Prefer a rate you can trace: if semantic memory above has a relevant CFE-specific tendency, use it and cite it via semanticMemoryId. Otherwise use general construction estimating knowledge and say so plainly in the rationale -- never imply a CFE-specific basis that doesn't exist.
- Set confident: false with a specific uncertaintyNote whenever the project context doesn't actually state a real scope quantity to anchor the estimate -- don't silently guess at scope and call it confident. A quantity estimate is a continuous guess, not a discrete yes/no call, so uncertainty here matters more than it does for task sequencing.
- Use rate card names verbatim from the vocabulary above only when the resource is genuinely the same thing -- don't force a match that isn't real.

**rationale must show actual reasoning, always** -- a calculation, a specific fact from the project context you anchored to, or an explicit judgment call with its logic stated (even if what you're judging is itself an assumption, e.g. "assuming a 65-mile round trip since no distance is stated"). A number is never its own rationale. If you find yourself about to write a bare figure with nothing behind it, that is the signal to either derive it from something in the project context or set confident: false and say plainly what's missing -- never state an unexplained number as if it were confident.

If (and only if) you notice something structural that would help future runs -- not a per-task observation -- call propose_process_improvement. Use it sparingly: at most once or twice for the whole run, never per task.

## Project context, for reference
${projectContext}`;
}

function buildRepairSystemPrompt(base, missingListText) {
  return `${base}

## Still missing
These approved tasks got no resource requirement at all in the pass above -- review each and add whatever it genuinely needs:

${missingListText}`;
}

async function appendRound(runId, roundEntry) {
  await pool.query('UPDATE resource_generation_runs SET rounds = rounds || $2::jsonb WHERE id = $1', [
    runId,
    JSON.stringify([roundEntry]),
  ]);
}

async function finishRun(runId, status, errorMessage = null) {
  await pool.query(
    `UPDATE resource_generation_runs SET status = $2, error_message = $3, finished_at = now() WHERE id = $1`,
    [runId, status, errorMessage]
  );
}

async function recordUsage(runId, usage) {
  await pool.query(
    'UPDATE resource_generation_runs SET total_input_tokens = $2, total_output_tokens = $3 WHERE id = $1',
    [runId, usage.inputTokens, usage.outputTokens]
  );
}

async function runPhase({ runId, phase, system, initialMessage, tools, taskByName, existingReqById, roundOffset, maxRounds, usage }) {
  const messages = [{ role: 'user', content: initialMessage }];
  let round = 0;
  for (; round < maxRounds; round++) {
    const response = await anthropic.messages.create(
      { model: MODEL, max_tokens: 2048, system, messages, tools },
      { timeout: REQUEST_TIMEOUT_MS }
    );

    const roundUsage = {
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
    };
    usage.inputTokens += roundUsage.inputTokens;
    usage.outputTokens += roundUsage.outputTokens;
    await recordUsage(runId, usage);

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    const textBlocks = response.content.filter((b) => b.type === 'text');
    const roundText = textBlocks.map((b) => b.text).join('\n').trim();

    if (toolUses.length === 0) {
      await appendRound(runId, { round: roundOffset + round, phase, text: roundText, toolCalls: [], usage: roundUsage });
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    const roundToolCalls = [];
    for (const toolUse of toolUses) {
      try {
        if (toolUse.name === 'add_resource_requirement') {
          const {
            taskName,
            resourceType,
            description,
            qty,
            unit,
            rationale,
            confident,
            uncertaintyNote,
            basisQuantity,
            basisQuantityUnit,
            basisRate,
            basisRateUnit,
            semanticMemoryId,
          } = toolUse.input;
          const task = taskByName.get(taskName.toLowerCase());
          if (!task) throw new Error(`Unknown task name: "${taskName}"`);
          if (VAGUE_UNIT_DENYLIST.has((unit || '').trim().toLowerCase())) {
            throw new Error(
              `"${unit}" isn't a real unit. Use a measurable unit (hr, day, CY, ton, SF, LF, gal, ea) with a basis, or "LS" only for a genuinely non-scaling flat item.`
            );
          }
          const sourceRefs = semanticMemoryId ? [{ type: 'semantic_memory_hypothesis', id: semanticMemoryId }] : [];
          const requirement = await resourceRequirementService.createGeneratedRequirement(task.id, {
            resourceType,
            description,
            qty,
            unit,
            rationale,
            confident,
            uncertaintyNote,
            basisQuantity,
            basisQuantityUnit,
            basisRate,
            basisRateUnit,
            sourceRefs,
          });
          roundToolCalls.push({ name: 'add_resource_requirement', input: toolUse.input, result: `created requirement #${requirement.id}` });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Added ${resourceType} requirement "${description}" (id ${requirement.id}) for task "${taskName}".`,
          });
        } else if (toolUse.name === 'update_resource_requirement') {
          const {
            requirementId,
            resourceType,
            description,
            qty,
            unit,
            rationale,
            confident,
            uncertaintyNote,
            basisQuantity,
            basisQuantityUnit,
            basisRate,
            basisRateUnit,
            semanticMemoryId,
          } = toolUse.input;
          const existing = existingReqById.get(requirementId);
          if (!existing) throw new Error(`Unknown existing requirement id: ${requirementId}`);
          if (VAGUE_UNIT_DENYLIST.has((unit || '').trim().toLowerCase())) {
            throw new Error(
              `"${unit}" isn't a real unit. Use a measurable unit (hr, day, CY, ton, SF, LF, gal, ea) with a basis, or "LS" only for a genuinely non-scaling flat item.`
            );
          }
          const sourceRefs = semanticMemoryId ? [{ type: 'semantic_memory_hypothesis', id: semanticMemoryId }] : existing.source_refs || [];
          const revised = await resourceRequirementService.reviseGeneratedRequirement(requirementId, {
            resourceType,
            description,
            qty,
            unit,
            rationale,
            confident,
            uncertaintyNote,
            basisQuantity,
            basisQuantityUnit,
            basisRate,
            basisRateUnit,
            sourceRefs,
          });
          roundToolCalls.push({ name: 'update_resource_requirement', input: toolUse.input, result: `revised requirement #${revised.id}` });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Revised requirement ${requirementId} ("${description}").`,
          });
        } else if (toolUse.name === 'flag_unresolved_resource') {
          const { taskName, reason } = toolUse.input;
          const task = taskByName.get(taskName.toLowerCase());
          if (!task) throw new Error(`Unknown task name: "${taskName}"`);
          // Same table/shape as a real requirement (confident: false +
          // uncertainty_note, already-built infrastructure) rather than a new
          // concept -- shows up in the Tasks UI exactly where a human is
          // already looking, and resolving it later is just an edit, which
          // already triggers the correction/evidence-capture pipeline.
          const flagged = await resourceRequirementService.createGeneratedRequirement(task.id, {
            resourceType: 'other',
            description: 'Unresolved -- needs input',
            qty: 0,
            unit: '',
            rationale: reason,
            confident: false,
            uncertaintyNote: reason,
            sourceRefs: [],
          });
          roundToolCalls.push({ name: 'flag_unresolved_resource', input: toolUse.input, result: `flagged as requirement #${flagged.id}` });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Flagged "${taskName}" as unresolved (id ${flagged.id}) for human review.`,
          });
        } else if (toolUse.name === 'propose_process_improvement') {
          const { instruction } = toolUse.input;
          const proposal = await memoryService.proposeFromAgent({
            instruction,
            sourceRefs: [{ type: 'resource_generation_run', id: runId }],
          });
          roundToolCalls.push({ name: 'propose_process_improvement', input: toolUse.input, result: `proposed procedural memory #${proposal.id}` });
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: `Recorded for human review (id ${proposal.id}).` });
        }
      } catch (err) {
        roundToolCalls.push({ name: toolUse.name, input: toolUse.input, error: err.message });
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: `Failed: ${err.message}`, is_error: true });
      }
    }
    messages.push({ role: 'user', content: toolResults });
    await appendRound(runId, { round: roundOffset + round, phase, text: roundText, toolCalls: roundToolCalls, usage: roundUsage });

    if (usage.inputTokens + usage.outputTokens >= TOKEN_CEILING) {
      usage.haltedForBudget = true;
      round += 1;
      break;
    }

    if (response.stop_reason !== 'tool_use') {
      round += 1;
      break;
    }
  }
  return round;
}

async function findTasksMissingRequirements(approvedTasks) {
  const { rows } = await pool.query(
    `SELECT t.id, t.name FROM tasks t
     WHERE t.id = ANY($1::int[])
       AND NOT EXISTS (SELECT 1 FROM task_resource_requirements r WHERE r.task_id = t.id)`,
    [approvedTasks.map((t) => t.id)]
  );
  return rows;
}

export async function startGeneration(workOrderId, userId) {
  const existing = await pool.query(
    `SELECT id FROM resource_generation_runs WHERE work_order_id = $1 AND status = 'running'`,
    [workOrderId]
  );
  if (existing.rows[0]) {
    throw new Error('Resource requirement generation is already running for this work order');
  }

  const allTasks = await taskService.listTasks(workOrderId);
  if (!allTasks.some((t) => t.status === 'approved')) {
    throw new Error('Approve the task list before generating resource requirements');
  }

  const { rows } = await pool.query(
    `INSERT INTO resource_generation_runs (work_order_id, created_by) VALUES ($1, $2) RETURNING *`,
    [workOrderId, userId]
  );
  const run = rows[0];

  executeGeneration(run.id, workOrderId).catch(async (err) => {
    console.error('Resource requirement generation failed:', err);
    await finishRun(run.id, 'error', err.message).catch(() => {});
  });

  return run;
}

async function executeGeneration(runId, workOrderId) {
  const { approvedTasks, existingReqById, ...context } = await gatherContext(workOrderId);
  const taskByName = new Map(approvedTasks.map((t) => [t.name.toLowerCase(), t]));
  const usage = { inputTokens: 0, outputTokens: 0, haltedForBudget: false };

  const baseSystem = buildEstimateSystemPrompt(context);
  const estimateRounds = await runPhase({
    runId,
    phase: 'estimate',
    system: baseSystem,
    initialMessage: 'Reconcile resource requirements for every approved task now -- add what\'s missing, revise what needs it, leave the rest.',
    tools: [ADD_RESOURCE_REQUIREMENT_TOOL, UPDATE_RESOURCE_REQUIREMENT_TOOL, FLAG_UNRESOLVED_RESOURCE_TOOL, PROPOSE_PROCESS_IMPROVEMENT_TOOL],
    taskByName,
    existingReqById,
    roundOffset: 0,
    maxRounds: ESTIMATE_MAX_ROUNDS,
    usage,
  });

  if (usage.haltedForBudget) {
    await finishRun(runId, 'stopped', `Token budget (${TOKEN_CEILING}) reached during estimation; partial results saved.`);
    return;
  }

  let missing = await findTasksMissingRequirements(approvedTasks);
  if (missing.length > 0) {
    // Rebuild context from scratch rather than reusing baseSystem -- a real
    // run showed why this matters: baseSystem's "existing requirements"
    // listing is a snapshot from before the estimate phase ran, so it still
    // shows "(none yet)" for a task the estimate phase itself just covered
    // moments earlier. The model followed that stale cue and duplicated
    // work already done in the same run, even though the explicit missing
    // list below was itself correct. Every phase needs its own fresh read.
    const { approvedTasks: _at, existingReqById: freshExistingReqById, ...freshContext } = await gatherContext(workOrderId);
    const missingListText = missing.map((t) => `- ${t.name}`).join('\n');
    await runPhase({
      runId,
      phase: 'repair-missing',
      system: buildRepairSystemPrompt(buildEstimateSystemPrompt(freshContext), missingListText),
      initialMessage: 'Add resource requirements for the missing tasks now.',
      tools: [ADD_RESOURCE_REQUIREMENT_TOOL, FLAG_UNRESOLVED_RESOURCE_TOOL],
      taskByName,
      existingReqById: freshExistingReqById,
      roundOffset: estimateRounds,
      maxRounds: REPAIR_MAX_ROUNDS,
      usage,
    });

    if (usage.haltedForBudget) {
      await finishRun(runId, 'stopped', `Token budget (${TOKEN_CEILING}) reached while filling in missing tasks; partial results saved.`);
      return;
    }

    missing = await findTasksMissingRequirements(approvedTasks);
  }

  if (missing.length > 0) {
    // Structural fallback, not another prompted attempt -- a real run showed
    // the model has flag_unresolved_resource available and is explicitly
    // told to use it for exactly this case, and still just silently left
    // tasks with nothing at all, with zero explanation, identically to
    // before the tool existed. Asking nicer didn't change the outcome, so
    // the code creates the flag itself rather than trusting a third prompted
    // attempt to work where two didn't. Every task ends up with something
    // visible either way -- this just guarantees it instead of hoping.
    for (const task of missing) {
      await resourceRequirementService.createGeneratedRequirement(task.id, {
        resourceType: 'other',
        description: 'Unresolved -- needs input',
        qty: 0,
        unit: '',
        rationale: 'The Resource Agent could not determine what this task needs after two attempts.',
        confident: false,
        uncertaintyNote: 'No resource could be estimated for this task -- needs a human answer (via the project conversation) on what it actually requires.',
        sourceRefs: [],
      });
    }
    await finishRun(
      runId,
      'stopped',
      `${missing.length} approved task(s) could not be estimated and were flagged for human input: ${missing.map((t) => t.name).join(', ')}`
    );
    return;
  }

  await finishRun(runId, 'converged');
}

export async function getLatestRun(workOrderId) {
  const { rows } = await pool.query(
    `SELECT * FROM resource_generation_runs WHERE work_order_id = $1 ORDER BY started_at DESC LIMIT 1`,
    [workOrderId]
  );
  return rows[0] || null;
}

export async function getRun(runId) {
  const { rows } = await pool.query('SELECT * FROM resource_generation_runs WHERE id = $1', [runId]);
  return rows[0] || null;
}
