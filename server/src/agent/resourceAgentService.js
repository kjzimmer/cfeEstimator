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

  const taskListText = approvedTasks.length
    ? approvedTasks.map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ''}`).join('\n')
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

  return { workOrder, approvedTasks, projectContext, taskListText, semanticMemoryText, rateCardVocabText };
}

function buildEstimateSystemPrompt({ projectContext, taskListText, semanticMemoryText, rateCardVocabText }) {
  return `You are estimating the labor, material, equipment, and other resources each approved task in a construction/site-work job needs.

## Approved tasks to estimate for
${taskListText}

## What CFE already knows about its own resource tendencies (semantic memory)
${semanticMemoryText}

## Existing rate card items (use these exact names when a resource is genuinely the same thing, so it resolves to a real price later instead of staying unresolved)
${rateCardVocabText}

For every task above, call add_resource_requirement for each resource it genuinely needs. You must attempt this for every task before finishing, not just the obvious ones.

- Decompose the basis whenever the estimate is rate-based (labor/equipment hours especially): state the scope quantity you're anchoring to (basisQuantity/basisQuantityUnit) and the productivity/coverage rate you applied (basisRate/basisRateUnit), so qty = basisQuantity / basisRate is checkable later. Not every resource decomposes this way -- a flat item (e.g. a permit fee) doesn't need basis fields.
- Prefer a rate you can trace: if semantic memory above has a relevant CFE-specific tendency, use it and cite it via semanticMemoryId. Otherwise use general construction estimating knowledge and say so plainly in the rationale -- never imply a CFE-specific basis that doesn't exist.
- Set confident: false with a specific uncertaintyNote whenever the project context doesn't actually state a real scope quantity to anchor the estimate -- don't silently guess at scope and call it confident. A quantity estimate is a continuous guess, not a discrete yes/no call, so uncertainty here matters more than it does for task sequencing.
- rationale is always required, and should be specific enough for a reviewer to judge whether it's reasonable.
- Use rate card names verbatim from the vocabulary above only when the resource is genuinely the same thing -- don't force a match that isn't real.

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

async function runPhase({ runId, phase, system, initialMessage, tools, taskByName, roundOffset, maxRounds, usage }) {
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
  const { approvedTasks, ...context } = await gatherContext(workOrderId);
  const taskByName = new Map(approvedTasks.map((t) => [t.name.toLowerCase(), t]));
  const usage = { inputTokens: 0, outputTokens: 0, haltedForBudget: false };

  const baseSystem = buildEstimateSystemPrompt(context);
  const estimateRounds = await runPhase({
    runId,
    phase: 'estimate',
    system: baseSystem,
    initialMessage: 'Estimate resource requirements for every approved task now.',
    tools: [ADD_RESOURCE_REQUIREMENT_TOOL, PROPOSE_PROCESS_IMPROVEMENT_TOOL],
    taskByName,
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
    const missingListText = missing.map((t) => `- ${t.name}`).join('\n');
    await runPhase({
      runId,
      phase: 'repair-missing',
      system: buildRepairSystemPrompt(baseSystem, missingListText),
      initialMessage: 'Add resource requirements for the missing tasks now.',
      tools: [ADD_RESOURCE_REQUIREMENT_TOOL],
      taskByName,
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
    await finishRun(
      runId,
      'stopped',
      `${missing.length} approved task(s) still have no resource requirement after a repair attempt -- review and add manually: ${missing.map((t) => t.name).join(', ')}`
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
