import Anthropic from '@anthropic-ai/sdk';
import { listSections } from '../services/companyInfoService.js';
import * as projectService from '../services/projectService.js';
import * as messageService from '../services/messageService.js';
import * as storage from '../services/storage.js';

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
];

async function buildFileContext(projectId) {
  const files = await storage.list(projectId);
  if (files.length === 0) return '(no files uploaded yet)';
  return files.map((f) => `- ${f.filename} (${f.mime_type}, ${f.size_bytes} bytes)`).join('\n');
}

function buildSystemPrompt(companySections, project, fileContext) {
  const companyContext = companySections
    .map((s) => `### ${s.title}\n${s.content || '(not yet configured)'}`)
    .join('\n\n');

  const definitionContext = Object.entries(project.definition || {})
    .map(([key, value]) => `### ${key}\n${value}`)
    .join('\n\n') || '(empty -- nothing defined yet)';

  return `You are the CFE project agent, participating in a shared conversation with CFE's estimating team about a single excavation job. Your job is to read the conversation, any uploaded files, and company context, then incrementally build up this project's structured definition (SOW, location, materials, assets, labor, billing, site visit notes, etc.) toward something bid-ready.

Use the update_project_component tool proactively whenever you learn something concrete -- don't wait to be asked. Keep your chat replies conversational and short; put structured detail into components, not into the chat reply.

## Company context
${companyContext}

## Current project: ${project.name} (customer: ${project.customer_name || 'unspecified'})
## Current project definition
${definitionContext}

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

export async function runAgentTurn(projectId) {
  const [companySections, project, threadMessages] = await Promise.all([
    listSections(),
    projectService.getProject(projectId),
    messageService.listMessages(projectId),
  ]);

  const fileContext = await buildFileContext(projectId);
  const system = buildSystemPrompt(companySections, project, fileContext);
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
