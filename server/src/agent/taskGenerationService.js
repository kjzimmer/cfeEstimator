// Task Agent + Dependency Agent (docs/incoming/task-resource-pipeline.md §3).
// First pass: no live industry-standard research yet (that's a later
// increment) -- this tests whether the draft -> sequence -> gap-fill loop
// itself works, using the model's own general reasoning.
//
// Run as two enforced phases (draft, then sequence+gap-fill), not one open
// -ended session covering both. Tried the single-session version first --
// real testing showed it's unreliable: one run correctly drafted and
// sequenced together, a second run drafted 16 tasks and stopped without
// ever attempting a single add_dependency call, despite identical
// instructions telling it to do both. Splitting into two phases makes the
// sequencing attempt structural (phase 2 always runs) instead of hoping
// the model remembers to do it before considering itself done.
import Anthropic from '@anthropic-ai/sdk';
import { pool } from '../db/pool.js';
import * as projectService from '../services/projectService.js';
import * as messageService from '../services/messageService.js';
import * as workOrderService from '../services/workOrderService.js';
import * as taskService from '../services/taskService.js';
import * as storage from '../services/storage.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-5';
const DRAFT_MAX_ROUNDS = 4;
const SEQUENCE_MAX_ROUNDS = 8;
// The round caps above bound *how many calls* happen, not *how much they
// cost* -- each round resends the full message history plus project
// context, so a run that uses every round on a large project costs
// meaningfully more than one that converges fast. This is the actual cost
// circuit breaker, checked after every round independent of the round
// caps. ~150k total tokens is comfortably above what a normal run needs
// (a few thousand per round) while still catching a genuinely runaway one.
const TOKEN_CEILING = 150_000;
// Explicit rather than trusting an unverified SDK default -- this runs
// fire-and-forget with no request-level timeout of its own to inherit.
const REQUEST_TIMEOUT_MS = 90_000;

const ADD_TASK_TOOL = {
  name: 'add_task',
  description:
    'Add one task to the work breakdown. A task is a distinct phase of work someone would treat as its own ' +
    'checkable milestone during execution -- not an internal motion within performing one phase. Test: would ' +
    'CFE ever need to know "is this specific piece done yet" as a checkpoint separate from whatever comes ' +
    'before or after it? If two steps would always happen in lockstep and nobody would ever check on either ' +
    'independently, they\'re the same task, not two. Include tasks CFE does not itself perform (Owner-obtained ' +
    'permits, third-party regulatory approvals) when the scope implies them -- set responsibleParty ' +
    'accordingly, don\'t omit them just because CFE isn\'t the one doing the work.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short, distinct task name -- used to reference this task in add_dependency calls' },
      description: { type: 'string' },
      createdVia: {
        type: 'string',
        enum: ['sow_extraction', 'dependency_gap_fill'],
        description:
          'sow_extraction: drawn directly from the scope of work / project context. dependency_gap_fill: ' +
          'added because sequencing revealed a necessary step was missing.',
      },
      responsibleParty: { type: 'string', enum: ['CFE', 'owner', 'third_party'], description: 'Default CFE if omitted' },
      rationale: {
        type: 'string',
        description: 'Why this task exists -- required for dependency_gap_fill (explain what gap it fills), optional for sow_extraction',
      },
    },
    required: ['name', 'createdVia'],
  },
};

const ADD_DEPENDENCY_TOOL = {
  name: 'add_dependency',
  description:
    'Record that one task depends on another (the dependency must happen first). Reference tasks by their ' +
    'exact name. Call this for every real dependency you can identify, including ones on Owner/third-party ' +
    'tasks (e.g. "Mobilize equipment" depends on "Obtain demolition permit"). If you realize a required ' +
    'intermediate step has no task yet, call add_task for it first (createdVia: dependency_gap_fill), then add ' +
    'the dependency.',
  input_schema: {
    type: 'object',
    properties: {
      taskName: { type: 'string', description: 'The task that has the dependency (the successor)' },
      dependsOnTaskName: { type: 'string', description: 'The task that must happen first (the predecessor)' },
      basis: {
        type: 'string',
        enum: ['sow_stated', 'domain_sequencing_rule'],
        description: 'sow_stated: the scope/conversation says this directly. domain_sequencing_rule: inferred from general job-sequencing knowledge, not explicitly stated.',
      },
      confident: { type: 'boolean', description: 'false if this sequencing is a guess, not a clear-cut requirement -- surfaces it for review priority rather than hiding uncertainty' },
      uncertaintyNote: { type: 'string', description: 'Required when confident is false -- explain what\'s uncertain' },
    },
    required: ['taskName', 'dependsOnTaskName', 'basis'],
  },
};

async function buildProjectContext(projectId) {
  const [project, messages, files] = await Promise.all([
    projectService.getProject(projectId),
    messageService.listMessages(projectId),
    storage.list(projectId),
  ]);

  const definitionContext =
    Object.entries(project.definition || {})
      .map(([key, value]) => `### ${key}\n${value}`)
      .join('\n\n') || '(empty -- nothing defined yet)';

  const threadContext = messages.length
    ? messages
        .map((m) => `[${m.sender_type === 'agent' ? 'Agent' : m.user_name || 'user'}]: ${m.content}`)
        .join('\n')
    : '(no conversation yet)';

  const fileContext = files.length
    ? files.map((f) => `- ${f.filename}`).join('\n')
    : '(no files uploaded)';

  return `## Project: ${project.name} (customer: ${project.customer_name || 'unspecified'})

## Project definition
${definitionContext}

## Full conversation thread
${threadContext}

## Files uploaded
${fileContext}
(Filenames only -- file contents aren't extracted yet.)`;
}

function buildDraftSystemPrompt(projectContext) {
  return `You are decomposing an excavation/site-work job into a work breakdown of discrete tasks (sequencing comes in a later step -- just focus on drafting a complete task list now). Draft tasks from everything in the project context below -- the scope of work, conversation, site visit notes, customer/location info. Call add_task for each (createdVia: sow_extraction). Don't invent tasks the job doesn't need, but don't omit real ones either, including ones CFE doesn't itself perform.

${projectContext}`;
}

function buildSequenceSystemPrompt(projectContext, taskListText) {
  return `You already drafted this task list for an excavation/site-work job:

${taskListText}

Your job now is to sequence it. For every task above, call add_dependency for what it genuinely depends on -- you must attempt this for every task before finishing, not just the obvious ones. Include dependencies on Owner/third-party tasks where they apply. If sequencing reveals a required step with no task yet, call add_task for it (createdVia: dependency_gap_fill, with rationale explaining the gap), then add its dependencies too. Stop once every task's real dependencies are captured and no further gaps are apparent -- don't keep looping once sequencing is clean.

## Project context, for reference
${projectContext}`;
}

async function appendRound(runId, roundEntry) {
  await pool.query('UPDATE task_generation_runs SET rounds = rounds || $2::jsonb WHERE id = $1', [
    runId,
    JSON.stringify([roundEntry]),
  ]);
}

async function finishRun(runId, status, errorMessage = null) {
  await pool.query(
    `UPDATE task_generation_runs SET status = $2, error_message = $3, finished_at = now() WHERE id = $1`,
    [runId, status, errorMessage]
  );
}

export async function startGeneration(workOrderId, userId) {
  const existing = await pool.query(
    `SELECT id FROM task_generation_runs WHERE work_order_id = $1 AND status = 'running'`,
    [workOrderId]
  );
  if (existing.rows[0]) {
    throw new Error('Task generation is already running for this work order');
  }

  const { rows } = await pool.query(
    `INSERT INTO task_generation_runs (work_order_id, created_by) VALUES ($1, $2) RETURNING *`,
    [workOrderId, userId]
  );
  const run = rows[0];

  // Fire-and-forget: the triggering request returns immediately (see the
  // route), this continues after the response is sent. Must catch its own
  // errors -- nothing else will.
  executeGeneration(run.id, workOrderId).catch(async (err) => {
    console.error('Task generation failed:', err);
    await finishRun(run.id, 'error', err.message).catch(() => {});
  });

  return run;
}

async function recordUsage(runId, usage) {
  await pool.query(
    'UPDATE task_generation_runs SET total_input_tokens = $2, total_output_tokens = $3 WHERE id = $1',
    [runId, usage.inputTokens, usage.outputTokens]
  );
}

// Runs one tool-calling phase to completion (natural stop, maxRounds
// reached, or the shared token ceiling tripped). Shared by both the draft
// and sequence phases -- only the system prompt, starting messages, tool
// set, and round budget differ. `usage` is a shared, mutable accumulator
// across both phases of one run, so the ceiling is a real total-run budget,
// not reset per phase.
async function runPhase({ runId, phase, system, initialMessage, tools, taskByName, workOrderId, roundOffset, maxRounds, usage }) {
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
        if (toolUse.name === 'add_task') {
          const { name, description, createdVia, responsibleParty, rationale } = toolUse.input;
          const task = await taskService.createGeneratedTask(workOrderId, {
            name,
            description,
            createdVia,
            responsibleParty,
            rationale,
          });
          taskByName.set(name.toLowerCase(), task);
          roundToolCalls.push({ name: 'add_task', input: toolUse.input, result: `created task #${task.id}` });
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: `Added task "${name}" (id ${task.id}).` });
        } else if (toolUse.name === 'add_dependency') {
          const { taskName, dependsOnTaskName, basis, confident, uncertaintyNote } = toolUse.input;
          const task = taskByName.get(taskName.toLowerCase()) || (await taskService.findTaskByName(workOrderId, taskName));
          const dependsOn = taskByName.get(dependsOnTaskName.toLowerCase()) || (await taskService.findTaskByName(workOrderId, dependsOnTaskName));
          if (!task || !dependsOn) {
            throw new Error(`Unknown task name(s): "${taskName}" / "${dependsOnTaskName}"`);
          }
          const dep = await taskService.addDependency(task.id, dependsOn.id, {
            basis,
            confident: confident ?? true,
            uncertaintyNote: uncertaintyNote || '',
          });
          roundToolCalls.push({ name: 'add_dependency', input: toolUse.input, result: `linked dependency #${dep.id}` });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Linked "${taskName}" depends on "${dependsOnTaskName}".`,
          });
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

async function executeGeneration(runId, workOrderId) {
  const workOrder = await workOrderService.getWorkOrder(workOrderId);
  const projectContext = await buildProjectContext(workOrder.project_id);
  const taskByName = new Map();
  // Shared across both phases -- the ceiling is a real total-run budget,
  // not reset per phase. See TOKEN_CEILING's comment for why this exists
  // independently of the round caps.
  const usage = { inputTokens: 0, outputTokens: 0, haltedForBudget: false };

  const draftRounds = await runPhase({
    runId,
    phase: 'draft',
    system: buildDraftSystemPrompt(projectContext),
    initialMessage: 'Draft the task list now.',
    tools: [ADD_TASK_TOOL],
    taskByName,
    workOrderId,
    roundOffset: 0,
    maxRounds: DRAFT_MAX_ROUNDS,
    usage,
  });

  if (taskByName.size === 0) {
    await finishRun(runId, 'error', 'Drafting produced no tasks.');
    return;
  }

  if (usage.haltedForBudget) {
    await finishRun(runId, 'stopped', `Token budget (${TOKEN_CEILING}) reached during drafting; ${taskByName.size} task(s) saved, sequencing not attempted.`);
    return;
  }

  const taskListText = [...taskByName.values()].map((t) => `- ${t.name}`).join('\n');
  await runPhase({
    runId,
    phase: 'sequence',
    system: buildSequenceSystemPrompt(projectContext, taskListText),
    initialMessage: 'Sequence every task above now.',
    tools: [ADD_TASK_TOOL, ADD_DEPENDENCY_TOOL],
    taskByName,
    workOrderId,
    roundOffset: draftRounds,
    maxRounds: SEQUENCE_MAX_ROUNDS,
    usage,
  });

  if (usage.haltedForBudget) {
    await finishRun(runId, 'stopped', `Token budget (${TOKEN_CEILING}) reached during sequencing; partial results saved -- review and complete sequencing manually.`);
    return;
  }

  // Sanity check, not just an optimistic "it ran, must be fine": with more
  // than one task, zero dependencies means sequencing didn't actually
  // happen, regardless of how the phase ended. Surface that plainly rather
  // than reporting a false "converged".
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM task_dependencies d
     JOIN tasks t ON t.id = d.task_id WHERE t.work_order_id = $1`,
    [workOrderId]
  );
  if (taskByName.size > 1 && rows[0].count === 0) {
    await finishRun(runId, 'stopped', 'Sequencing produced no dependencies -- review the drafted tasks and add them manually, or try again.');
    return;
  }

  await finishRun(runId, 'converged');
}

export async function getLatestRun(workOrderId) {
  const { rows } = await pool.query(
    `SELECT * FROM task_generation_runs WHERE work_order_id = $1 ORDER BY started_at DESC LIMIT 1`,
    [workOrderId]
  );
  return rows[0] || null;
}

export async function getRun(runId) {
  const { rows } = await pool.query('SELECT * FROM task_generation_runs WHERE id = $1', [runId]);
  return rows[0] || null;
}
