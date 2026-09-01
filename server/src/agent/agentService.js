import Anthropic from '@anthropic-ai/sdk';
import { listSections } from '../services/companyInfoService.js';
import * as companyIdentityService from '../services/companyIdentityService.js';
import * as projectService from '../services/projectService.js';
import * as messageService from '../services/messageService.js';
import * as storage from '../services/storage.js';
import * as rateCardService from '../services/rateCardService.js';
import * as workOrderService from '../services/workOrderService.js';
import * as memoryService from '../services/memoryService.js';
import * as taskService from '../services/taskService.js';
import * as resourceRequirementService from '../services/resourceRequirementService.js';

const RATE_CARD_KEYS = ['service_rates', 'material_costs', 'equipment_rates', 'employee_role_rates'];

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-5';

// One generic tool for updating any project definition component, rather
// than one tool per component -- keeps this compatible with the JSON-blob,
// evolving-shape project definition. See docs/requirements/api-architecture.md.
const TOOLS = [
  {
    name: 'update_project_component',
    description:
      'Create or update a single named component of this project\'s definition ' +
      '(e.g. "sow", "location", "materials", "assets", "labor", "billing", "siteVisit"). ' +
      'Call this whenever the conversation, an uploaded file, or your own reasoning ' +
      'gives you new or corrected information for a component. Content replaces ' +
      'whatever was previously stored for that key -- so include the full up-to-date ' +
      'text for the component, not just the delta. Component keys are freeform; ' +
      'invent a new one if nothing existing fits.',
    input_schema: {
      type: 'object',
      properties: {
        componentKey: {
          type: 'string',
          description: 'camelCase key identifying the component, e.g. "sow" or "siteVisit"',
        },
        content: {
          type: 'string',
          description: 'Full markdown/text content for this component, replacing any prior value',
        },
      },
      required: ['componentKey', 'content'],
    },
  },
  {
    name: 'draft_work_order',
    description:
      'Set the project\'s draft work order HEADER fields (scope text, site location, requested start, ' +
      'contingency, terms) -- NOT line items. Line items now come from the task/resource pipeline (Generate ' +
      'Tasks -> approve -> Generate Resource Requirements -> Generate Line Items in the app), not from this ' +
      'conversation -- omit lineItems entirely, always. If a human asks you to add, price, or change a line ' +
      'item directly in chat, don\'t do it here: explain that pricing now comes from that pipeline once tasks ' +
      'and resources are established, and that a one-off manual line (if one is genuinely needed outside the ' +
      'pipeline) can still be added directly in the Work Order tab\'s "Scope only" form. Omit any field you ' +
      'don\'t want to change.',
    input_schema: {
      type: 'object',
      properties: {
        scopeText: { type: 'string', description: 'Scope-of-work narrative for the PDF' },
        siteLocation: { type: 'string', description: 'Job site address, if different from the customer address' },
        requestedStart: { type: 'string', description: 'Freeform requested start, e.g. "Week of August 11, 2026"' },
        contingencyPercent: { type: 'number', description: 'Contingency percentage applied to the subtotal' },
        terms: { type: 'string', description: 'Payment/terms text for the PDF' },
        lineItems: {
          type: 'array',
          description: 'Deprecated -- always omit this. Line items come from the task/resource pipeline now, never from this tool.',
          items: {
            type: 'object',
            properties: {
              rateCardType: {
                type: 'string',
                enum: RATE_CARD_KEYS,
                description: 'Omit for a manual line with no backing rate card entry',
              },
              rateCardItemName: { type: 'string', description: 'Exact name of the catalog entry, when rateCardType is set' },
              name: { type: 'string', description: 'Line description -- required when rateCardType is omitted' },
              unit: { type: 'string' },
              qty: { type: 'number' },
            },
          },
        },
      },
    },
  },
  {
    name: 'propose_memory_entry',
    description:
      'Log a proposal for something durable to remember, company-wide, after a human EXPLICITLY asks you ' +
      'to remember something (e.g. "remember: don\'t ask me how far the dump site is" or "remember: CFE ' +
      'never subs out demo work"). Never call this unprompted -- only on an explicit ask.\n\n' +
      'FIRST, before classifying procedural vs semantic, check whether any part of the statement contains a ' +
      'specific rate, price, cost, or percentage that would need to be applied consistently in future ' +
      'estimates. If so, that makes the WHOLE statement Company-Info-shaped -- do NOT call this tool at all, ' +
      'even if the rate is mixed in with other domain context. E.g. "we\'re certified for asbestos removal ' +
      'and charge a flat $3,000 for it" mixes a capability claim with a rate; the rate makes the whole thing ' +
      'belong in Company Info, not semantic memory just because a capability claim is attached to it. Tell ' +
      'the human the pricing part needs to be added to Company Info instead.\n\n' +
      'Only once you\'ve ruled out a rate/price being present, classify what\'s left into "procedural" (an ' +
      'instruction about how you should behave, not a fact about the world -- test: would this ever be ' +
      'cited as the reason a specific line-item number is what it is? If no, it\'s procedural) or "semantic" ' +
      '(a durable generalization about excavation/CFE\'s domain that could be cited that way, with no price ' +
      'attached to it). This only logs a proposal; an admin must accept it before it affects anything.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['procedural', 'semantic'] },
        content: {
          type: 'string',
          description:
            'The rule (procedural) or generalization (semantic), in your own words. If the classification ' +
            'is genuinely ambiguous between procedural and semantic, append a short bracketed note saying so, ' +
            'e.g. "[uncertain: could be semantic instead]" -- still log it, don\'t guess silently.',
        },
        sourceConversationRef: {
          type: 'string',
          description: 'Optional short quote or paraphrase of what the human said and in what project, for the reviewer\'s context',
        },
      },
      required: ['type', 'content'],
    },
  },
  {
    name: 'resolve_resource_requirement',
    description:
      'Update a resource requirement based on what the human just told you in conversation -- most often ' +
      'answering one of the open resource questions listed in your context below, but usable for any ' +
      'correction to a resource requirement grounded in what the human actually said. This is how these get ' +
      'resolved: the human tells you the answer here in chat, you make the entry -- never tell them to go edit ' +
      'the Tasks tab themselves. Reflect what they actually said in the rationale; don\'t invent additional ' +
      'reasoning they didn\'t give you.',
    input_schema: {
      type: 'object',
      properties: {
        requirementId: { type: 'integer', description: 'The id from the open resource questions list, or another requirement the human is correcting' },
        resourceType: { type: 'string', enum: ['labor', 'material', 'equipment', 'other'] },
        description: { type: 'string' },
        qty: { type: 'number' },
        unit: { type: 'string', description: 'A real, measurable unit, e.g. hr, day, CY, ton, ea -- never a vague placeholder like "job"' },
        rationale: { type: 'string', description: "Reflect what the human actually told you -- required" },
        confident: { type: 'boolean', description: 'Default true -- the human just resolved it' },
        basisQuantity: { type: 'number' },
        basisQuantityUnit: { type: 'string' },
        basisRate: { type: 'number' },
        basisRateUnit: { type: 'string' },
      },
      required: ['requirementId', 'resourceType', 'description', 'qty', 'unit', 'rationale'],
    },
  },
  {
    name: 'form_memory_hypothesis',
    description:
      'Proactively capture something that might generalize beyond this one project -- distinct from ' +
      'propose_memory_entry, which only fires on an explicit "remember this" ask. After ANY substantive ' +
      'request, correction, or preference a human states -- even without asking you to remember anything -- ' +
      'consider: is this specific to just this one job, or could it reflect a broader CFE convention? If it ' +
      'plausibly generalizes, call this right away. It takes effect immediately (not gated behind admin ' +
      'review like propose_memory_entry) and reinforces automatically if the same pattern comes up again -- ' +
      'so forming one is cheap and low-risk, not a big commitment. This also covers the reverse case: if a ' +
      'human asks for something that seems to genuinely contradict what you\'d expect, and there\'s a real ' +
      'reason to question it, capturing that tension here is how it gets resolved through repeated experience ' +
      'rather than a one-off intervention. Do NOT use this for something obviously specific to just this job ' +
      '(this job\'s exact square footage, a one-time customer request) -- only for what reads as a pattern, ' +
      'rule, or tendency. Same procedural-vs-semantic classification as propose_memory_entry (procedural: how ' +
      'to behave/decompose work; semantic: a durable domain fact) -- check for an embedded rate/price the same ' +
      'way first; that belongs in Company Info, not here.\n\n' +
      'If content states a number (a duration, quantity, or rate), you MUST also fill in appliesWhen -- what ' +
      'the number is actually anchored to. A real example this caught: "mobilization takes about 2 hours" with ' +
      'no mention that this was for a specific ~90-mile trip -- mobilization time is fundamentally a function ' +
      'of distance, so a bare duration with nothing said about what it depends on is close to guaranteed to be ' +
      'wrong the next time distance differs. If you can\'t identify what the number depends on, don\'t state it ' +
      'as a fixed fact -- describe the relationship instead (e.g. "mobilization time scales with distance") ' +
      'rather than asserting an outcome.\n\n' +
      'Only call this if you are actually calling it -- never tell the human you\'ve "noted" or "will remember" ' +
      'something in your reply unless this tool call is genuinely present in the same turn. Saying so without ' +
      'doing it is worse than not mentioning it at all.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['procedural', 'semantic'] },
        content: {
          type: 'string',
          description: 'The pattern, rule, or tendency, in your own words -- specific enough to be checked against next time it comes up',
        },
        appliesWhen: {
          type: 'string',
          description: 'Required when content states a number -- the condition/variable it depends on (e.g. "for ~90 mile one-way trips"). Omit only when content has no number in it.',
        },
        sourceConversationRef: {
          type: 'string',
          description: 'Short quote or paraphrase of what triggered this, for traceability',
        },
      },
      required: ['type', 'content'],
    },
  },
];

async function buildFileContext(projectId) {
  const files = await storage.list(projectId);
  if (files.length === 0) return '(no files uploaded yet)';
  return files.map((f) => `- ${f.filename} (${f.mime_type}, ${f.size_bytes} bytes)`).join('\n');
}

const RATE_CARD_TITLES = {
  service_rates: 'Service Rate Card',
  material_costs: 'Material Cost Card',
  equipment_rates: 'Equipment/Asset Rate Card',
  employee_role_rates: 'Employee Role Rate Card',
};

// name/unit/rate only -- cost is deliberately left out of the agent's
// context for now (see docs/requirements/work-orders.md: cost access is
// *allowed* for internal estimating, not required this phase).
async function buildRateCardContext() {
  const cards = await Promise.all(RATE_CARD_KEYS.map((key) => rateCardService.listItems(key)));
  return RATE_CARD_KEYS.map((key, i) => {
    const items = cards[i];
    const lines = items.length
      ? items.map((it) => `- ${it.name} (${it.unit}): $${it.rate}`).join('\n')
      : '(none configured yet)';
    return `### ${RATE_CARD_TITLES[key]} (rateCardType: "${key}")\n${lines}`;
  }).join('\n\n');
}

// Surfaces resource_estimation requirements the Resource Agent flagged
// confident: false (including ones it couldn't determine at all, via
// flag_unresolved_resource) so a human can resolve them right here in
// conversation -- the app's normal way data enters -- rather than editing
// the Tasks tab form directly. resolve_resource_requirement is how the
// answer actually gets written; this context is what makes the agent aware
// there's something to resolve in the first place.
async function buildOpenResourceQuestionsContext(projectId) {
  const draft = await workOrderService.getCurrentDraft(projectId);
  if (!draft) return '(no draft work order yet)';
  const [requirements, tasks] = await Promise.all([
    resourceRequirementService.listRequirements(draft.id),
    taskService.listTasks(draft.id),
  ]);
  const open = requirements.filter((r) => r.confident === false);
  if (open.length === 0) return '(none currently open)';
  const taskNameById = new Map(tasks.map((t) => [t.id, t.name]));
  return open
    .map((r) => `- [id ${r.id}] Task "${taskNameById.get(r.task_id) || 'unknown'}": ${r.uncertainty_note || r.rationale}`)
    .join('\n');
}

async function buildWorkOrderContext(projectId) {
  const draft = await workOrderService.getCurrentDraft(projectId);
  if (!draft) return '(no draft yet)';
  const lines = draft.lineItems.length
    ? draft.lineItems.map((li) => `- ${li.name} — qty ${li.qty} ${li.unit} @ $${li.rate} = $${li.amount.toFixed(2)}`).join('\n')
    : '(no line items yet)';
  return `Status: draft (revision ${draft.revision})
Scope text: ${draft.scope_text || '(not set)'}
Site location: ${draft.site_location || '(not set)'}
Requested start: ${draft.requested_start || '(not set)'}
Contingency: ${draft.contingency_percent}%
Line items:
${lines}
Subtotal: $${draft.subtotal.toFixed(2)}`;
}

// Agent Memory Phase 1 prompt-assembly hook (docs/requirements/agent-memory.md)
// -- this is what makes the review queue's "accept" button do anything.
// Company-wide, not project-scoped, so it doesn't take a projectId.
async function buildMemoryContext() {
  const [procedural, semantic] = await Promise.all([
    memoryService.listActiveProcedural(),
    memoryService.listActiveSemantic(),
  ]);
  const proceduralLines = procedural.length
    ? procedural.map((p) => `- ${p.instruction}`).join('\n')
    : '(none yet)';
  const semanticLines = semantic.length
    ? semantic.map((s) => `- ${s.content}`).join('\n')
    : '(none yet)';
  return `### Behavioral rules (procedural)\n${proceduralLines}\n\n### Domain knowledge (semantic)\n${semanticLines}`;
}

function buildSystemPrompt(companySections, rateCardContext, project, workOrderContext, fileContext, memoryContext, openResourceQuestionsContext, companyIdentity) {
  const companyContext = companySections
    .map((s) => `### ${s.title}\n${s.content || '(not yet configured)'}`)
    .join('\n\n');

  const definitionContext = Object.entries(project.definition || {})
    .map(([key, value]) => `### ${key}\n${value}`)
    .join('\n\n') || '(empty -- nothing defined yet)';

  return `You are the CFE project agent, participating in a shared conversation with CFE's estimating team about a single excavation job. Your job is to read the conversation, any uploaded files, and company context, then incrementally build up this project's structured definition (SOW, location, materials, assets, labor, billing, site visit notes, etc.) toward something bid-ready.

Use the update_project_component tool proactively whenever you learn something concrete -- don't wait to be asked. Keep your chat replies conversational and short; put structured detail into components, not into the chat reply.

Pricing does NOT happen in this conversation anymore. The actual sequence is: the human generates a task list (Tasks tab), approves it, generates resource requirements, then generates priced line items from those -- all outside this chat. Your job is to help establish the facts those steps need (scope, site details, quantities, preferences), not to price anything yourself. If a human asks you to draft, price, or add a line item, don't -- explain the sequence above and that a one-off manual line (if genuinely needed outside that pipeline) goes in the Work Order tab's "Scope only" form instead. draft_work_order still exists, but only for the work order's header fields (scope text, site location, contingency, terms), never line items.

If a human explicitly asks you to remember something (they say "remember..." or clearly ask you to retain a rule or fact for the future), use propose_memory_entry per its own instructions -- this only logs a proposal for admin review, it doesn't take effect immediately, so tell them that's what happened. Never call it unless they explicitly asked you to remember something.

Separately, and more often: after any substantive request, correction, or stated preference -- with no "remember" needed -- use form_memory_hypothesis if it looks like it could generalize beyond this one job (per its own instructions for exactly how to judge that, including when a number requires stating what it depends on). This is the normal, expected way learning happens here, not an edge case -- a human asking for something once is itself the teaching signal, and forming the hypothesis costs nothing since it just gets reinforced or naturally fades in relevance if it doesn't come up again. Don't ask the human whether to log it -- just do it. Mention it briefly and naturally in your reply, the way a person would in conversation -- e.g. "I'll keep this in mind for future work orders too" -- not a formal status report like "I've noted that X should always be Y."

The Resource Agent (a separate background process) sometimes can't determine what a task needs and flags it, listed below under "Open resource questions." If the human's message answers one of these -- or corrects a resource requirement more generally -- call resolve_resource_requirement with the real values, reflecting what they actually said in the rationale. This is the only way these get resolved; never tell a human to go edit the Tasks tab themselves, the conversation is how data enters this system.

## Open resource questions (from the Resource Agent, awaiting your answer)
${openResourceQuestionsContext}

## Things you already know (Agent Memory -- admin-reviewed, applies company-wide)
${memoryContext}

## Company context
${companyContext}

## CFE's own address (derive travel distance from this and the customer's address below rather than asking -- see the procedural rule above about that)
${companyIdentity?.address || '(not set in Company Info)'}

## Rate cards (use these names verbatim in draft_work_order's rateCardItemName)
${rateCardContext}

## Current project: ${project.name} (customer: ${project.customer_name || 'unspecified'})
## Customer's address on file (usually the work site for these jobs, unless told otherwise)
${project.customer_address || '(not set on the customer record)'}
## Current project definition
${definitionContext}

## Current draft work order
${workOrderContext}

## Files uploaded to this project
${fileContext}
(File contents aren't extracted yet this phase -- only filenames are visible to you.)`;
}

// Anthropic's API requires strict user/assistant alternation, but our thread
// can have consecutive messages from the same sender_type (two employees in
// a row, or a user message immediately re-triggering the agent). Merge
// consecutive same-role turns into one turn to satisfy that.
function toAnthropicMessages(messages) {
  const history = messages.map((m) => ({
    role: m.sender_type === 'agent' ? 'assistant' : 'user',
    content: m.sender_type === 'agent' ? m.content : `[${m.user_name || 'user'}]: ${m.content}`,
  }));

  const merged = [];
  for (const msg of history) {
    const last = merged[merged.length - 1];
    if (last && last.role === msg.role) {
      last.content += `\n${msg.content}`;
    } else {
      merged.push({ ...msg });
    }
  }

  if (merged.length > 0 && merged[0].role === 'assistant') merged.shift();
  return merged;
}

export async function runAgentTurn(projectId, triggeredByUserId = null) {
  const [companySections, project, threadMessages, rateCardContext, workOrderContext, memoryContext, openResourceQuestionsContext, companyIdentity] = await Promise.all([
    listSections(),
    projectService.getProject(projectId),
    messageService.listMessages(projectId),
    buildRateCardContext(),
    buildWorkOrderContext(projectId),
    buildMemoryContext(),
    buildOpenResourceQuestionsContext(projectId),
    companyIdentityService.getIdentity(),
  ]);

  const fileContext = await buildFileContext(projectId);
  const system = buildSystemPrompt(companySections, rateCardContext, project, workOrderContext, fileContext, memoryContext, openResourceQuestionsContext, companyIdentity);
  const messages = toAnthropicMessages(threadMessages);

  let finalText = '';
  let currentProject = project;

  // Tool-calling loop: keep going while Claude asks to call tools, stop once
  // it produces a final text turn. 8, not the original 6 -- the tool surface
  // has grown since that cap was set (form_memory_hypothesis and
  // resolve_resource_requirement didn't exist yet), and one live run came
  // back with an empty reply, plausibly from running out of turns on
  // tool-only rounds before reaching a final text response.
  for (let turn = 0; turn < 8; turn++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1536,
      system,
      messages,
      tools: TOOLS,
    });

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    const textBlocks = response.content.filter((b) => b.type === 'text');
    finalText = textBlocks.map((b) => b.text).join('\n').trim();

    if (toolUses.length === 0) break;

    messages.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    for (const toolUse of toolUses) {
      try {
        if (toolUse.name === 'update_project_component') {
          const { componentKey, content } = toolUse.input;
          currentProject = await projectService.updateDefinitionComponent(
            projectId,
            componentKey,
            content
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Saved component "${componentKey}".`,
          });
        } else if (toolUse.name === 'draft_work_order') {
          const { scopeText, siteLocation, requestedStart, contingencyPercent, terms, lineItems } = toolUse.input;
          // No user row for the agent -- created_by/updated_by stay NULL for
          // agent-driven drafts and edits, same nullable-FK pattern used
          // elsewhere for system-attributed rows.
          const draft = await workOrderService.ensureDraft(projectId, null);

          // Structural, not just a prompt request: line items come from the
          // task/resource pipeline now, not this tool. Ignored even if the
          // model still sends them, rather than trusting the description
          // alone -- consistent with this project's practice of backing a
          // prompt instruction with a real check once a failure mode is
          // understood, not just asking more clearly.
          const ignoredLineItemCount = Array.isArray(lineItems) ? lineItems.length : 0;

          const hasFieldUpdates =
            scopeText !== undefined ||
            siteLocation !== undefined ||
            requestedStart !== undefined ||
            contingencyPercent !== undefined ||
            terms !== undefined;
          if (hasFieldUpdates) {
            const current = await workOrderService.getWorkOrder(draft.id);
            await workOrderService.updateDraftFields(draft.id, {
              scopeText: scopeText ?? current.scope_text,
              siteLocation: siteLocation ?? current.site_location,
              requestedStart: requestedStart ?? current.requested_start,
              contingencyPercent: contingencyPercent ?? current.contingency_percent,
              terms: terms ?? current.terms,
            });
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content:
              ignoredLineItemCount > 0
                ? `Header fields updated. lineItems was ignored (${ignoredLineItemCount} line(s)) -- line items come from the task/resource pipeline now, not this tool. Tell the human that, don't imply the lines were saved.`
                : 'Draft work order header fields updated.',
          });
        } else if (toolUse.name === 'propose_memory_entry') {
          const { type, content, sourceConversationRef } = toolUse.input;
          const { entry } = await memoryService.proposeEntry({
            type,
            content,
            proposedBy: triggeredByUserId,
            sourceConversationRef,
          });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Logged as a ${type} memory proposal (id ${entry.id}), pending admin review.`,
          });
        } else if (toolUse.name === 'resolve_resource_requirement') {
          const { requirementId, resourceType, description, qty, unit, rationale, confident, basisQuantity, basisQuantityUnit, basisRate, basisRateUnit } = toolUse.input;
          // Scope check: only resolve a requirement that actually belongs to
          // this project's draft work order, not an arbitrary id.
          const draft = await workOrderService.getCurrentDraft(projectId);
          const belongsHere = draft && (await resourceRequirementService.listRequirements(draft.id)).some((r) => r.id === requirementId);
          if (!belongsHere) throw new Error(`Requirement ${requirementId} isn't part of this project's draft work order`);
          // The human-facing path, not the agent-facing one -- this is
          // fundamentally the human's answer, just entered via conversation
          // instead of the Tasks tab form, so it sets human_reviewed and
          // triggers the same correction-evidence capture any other human
          // edit does.
          const updated = await resourceRequirementService.updateRequirement(requirementId, {
            resourceType,
            description,
            qty,
            unit,
            rationale,
            confident: confident ?? true,
            uncertaintyNote: '',
            basisQuantity,
            basisQuantityUnit,
            basisRate,
            basisRateUnit,
          });
          if (!updated) throw new Error(`Unknown resource requirement id: ${requirementId}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Resolved requirement ${requirementId} ("${description}").`,
          });
        } else if (toolUse.name === 'form_memory_hypothesis') {
          const { type, content, appliesWhen, sourceConversationRef } = toolUse.input;
          const sourceRefs = sourceConversationRef ? [sourceConversationRef] : [];
          const entry =
            type === 'procedural'
              ? await memoryService.formProceduralHypothesis({ instruction: content, sourceRefs })
              : await memoryService.formSemanticHypothesis({ content, appliesWhen, sourceRefs });
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: `Noted as a ${type} hypothesis (id ${entry.id}) -- already in effect, no review needed.`,
          });
        }
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Failed: ${err.message}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: 'user', content: toolResults });

    if (response.stop_reason !== 'tool_use') break;
  }

  const agentMessage = await messageService.appendMessage({
    projectId,
    senderType: 'agent',
    type: 'text',
    content: finalText || '(no response)',
  });

  return { agentMessage, project: currentProject };
}
