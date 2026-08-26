import Anthropic from '@anthropic-ai/sdk';
import { listSections } from '../services/companyInfoService.js';
import * as projectService from '../services/projectService.js';
import * as messageService from '../services/messageService.js';
import * as storage from '../services/storage.js';
import * as rateCardService from '../services/rateCardService.js';
import * as workOrderService from '../services/workOrderService.js';
import * as memoryService from '../services/memoryService.js';

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
      'Create or update the project\'s DRAFT work order -- the priced line-item list that ' +
      'becomes the customer-facing PDF once a human finalizes it. You can draft and revise ' +
      'this freely; only a human clicking "Generate Work Order" in the app can finalize it, ' +
      'so there\'s no harm in proposing a list early and refining it as the conversation ' +
      'clarifies scope. Omit fields you don\'t want to change. When you do pass lineItems, ' +
      'it fully REPLACES the current list -- include every line that should remain, not just new ones. ' +
      'Rates only ever come from a rate card -- there is no field for you to supply a rate directly, for ' +
      'any line, ever. For each line, try to reference a real rate card entry by rateCardType + ' +
      'rateCardItemName (name must match one from the catalog in your system context EXACTLY -- never a ' +
      'similar-but-different item you judge as "close enough," that defeats the point). If nothing in the ' +
      'catalog matches, still add the line with just name/unit/qty (no rateCardType) -- it\'ll be scope-only ' +
      'and unresolved, which is expected and fine while drafting. Mention in your reply that it has no rate ' +
      'yet and needs a rate card entry added before the work order can be finalized -- never invent a number.',
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
          description: 'Full replacement list of line items (omit this field entirely to leave the current list untouched)',
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

function buildSystemPrompt(companySections, rateCardContext, project, workOrderContext, fileContext, memoryContext) {
  const companyContext = companySections
    .map((s) => `### ${s.title}\n${s.content || '(not yet configured)'}`)
    .join('\n\n');

  const definitionContext = Object.entries(project.definition || {})
    .map(([key, value]) => `### ${key}\n${value}`)
    .join('\n\n') || '(empty -- nothing defined yet)';

  return `You are the CFE project agent, participating in a shared conversation with CFE's estimating team about a single excavation job. Your job is to read the conversation, any uploaded files, and company context, then incrementally build up this project's structured definition (SOW, location, materials, assets, labor, billing, site visit notes, etc.) toward something bid-ready -- and to draft a work order (priced line items) once you have enough information, using the rate card catalog below.

Use the update_project_component tool proactively whenever you learn something concrete -- don't wait to be asked. Use draft_work_order once scope and quantities are clear enough to price, and again whenever they change -- a human still has to review and click "Generate Work Order" before anything goes to the customer, so draft early and revise freely rather than waiting for certainty. Keep your chat replies conversational and short; put structured detail into components and the draft work order, not into the chat reply.

If a human explicitly asks you to remember something (they say "remember..." or clearly ask you to retain a rule or fact for the future), use propose_memory_entry per its own instructions -- this only logs a proposal for admin review, it doesn't take effect immediately, so tell them that's what happened. Never call it unless they explicitly asked you to remember something; don't proactively propose memories from an ordinary correction.

## Things you already know (Agent Memory -- admin-reviewed, applies company-wide)
${memoryContext}

## Company context
${companyContext}

## Rate cards (use these names verbatim in draft_work_order's rateCardItemName)
${rateCardContext}

## Current project: ${project.name} (customer: ${project.customer_name || 'unspecified'})
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
  const [companySections, project, threadMessages, rateCardContext, workOrderContext, memoryContext] = await Promise.all([
    listSections(),
    projectService.getProject(projectId),
    messageService.listMessages(projectId),
    buildRateCardContext(),
    buildWorkOrderContext(projectId),
    buildMemoryContext(),
  ]);

  const fileContext = await buildFileContext(projectId);
  const system = buildSystemPrompt(companySections, rateCardContext, project, workOrderContext, fileContext, memoryContext);
  const messages = toAnthropicMessages(threadMessages);

  let finalText = '';
  let currentProject = project;

  // Tool-calling loop: keep going while Claude asks to call tools, stop once
  // it produces a final text turn.
  for (let turn = 0; turn < 6; turn++) {
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

          if (lineItems) {
            await workOrderService.replaceLineItems(draft.id, lineItems);
          }

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
            content: 'Draft work order updated.',
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
