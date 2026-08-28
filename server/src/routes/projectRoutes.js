import { Router } from 'express';
import multer from 'multer';
import * as projectService from '../services/projectService.js';
import * as messageService from '../services/messageService.js';
import * as storage from '../services/storage.js';
import * as workOrderService from '../services/workOrderService.js';
import * as taskService from '../services/taskService.js';
import * as taskGenerationService from '../agent/taskGenerationService.js';
import * as rateCardService from '../services/rateCardService.js';
import * as companyIdentityService from '../services/companyIdentityService.js';
import * as customerService from '../services/customerService.js';
import { generateWorkOrderPdf } from '../services/workOrderPdfService.js';
import { runAgentTurn } from '../agent/agentService.js';
import { requireAdmin } from '../middleware/requireAuth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const FILE_TYPES = ['site-note', 'photo', 'work-order', 'other'];
const router = Router();

// cost is admin-only wherever it appears -- see docs/requirements/company-info.md
// and work-orders.md. Stripped here at the API boundary for line items;
// the PDF path never has it in scope to begin with (see workOrderService.getLineItemsForPdf).
function omitCostForNonAdmins(workOrder, req) {
  if (req.user?.isAdmin) return workOrder;
  return { ...workOrder, lineItems: workOrder.lineItems.map(({ cost, ...rest }) => rest) };
}

router.get('/', asyncHandler(async (req, res) => {
  const { historical } = req.query;
  const filter = historical === undefined ? undefined : historical === 'true';
  res.json(await projectService.listProjects({ historical: filter }));
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, customerId, status, historical } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const project = await projectService.createProject({
    name,
    customerId: customerId ?? null,
    status,
    historical: Boolean(historical),
    createdBy: req.user.sub,
  });
  res.status(201).json(project);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const project = await projectService.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
}));

// Manual/human edit of a definition component (the agent calls
// projectService.updateDefinitionComponent directly via tool-calling rather
// than this HTTP route -- see docs/requirements/api-architecture.md).
router.put('/:id/definition/:componentKey', asyncHandler(async (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content (string) is required' });
  }
  const project = await projectService.updateDefinitionComponent(
    req.params.id,
    req.params.componentKey,
    content
  );
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
}));

router.get('/:id/messages', asyncHandler(async (req, res) => {
  res.json(await messageService.listMessages(req.params.id));
}));

// Posting a user message triggers one agent turn: the agent reads
// company info + this project's definition + full thread + files, then
// responds and may update definition components via tool-calling.
router.post('/:id/messages', asyncHandler(async (req, res) => {
  const { content, type = 'text' } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required' });

  const projectId = req.params.id;
  const userMessage = await messageService.appendMessage({
    projectId,
    senderType: 'user',
    userId: req.user.sub,
    type,
    content,
  });

  const { agentMessage, project } = await runAgentTurn(projectId, req.user.sub);

  res.status(201).json({ userMessage, agentMessage, project });
}));

router.get('/:id/files', asyncHandler(async (req, res) => {
  res.json(await storage.list(req.params.id));
}));

// Handles both chat file-attachment and direct Documents-tab upload -- one
// File model, not two (see docs/requirements/project-documents.md). `source`
// distinguishes them; only a chat upload also posts a thread message.
// Direct uploads pass `type` explicitly; chat uploads get a light mime-based
// guess since that flow stays a single lightweight click, not a form.
router.post('/:id/files', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  if (req.body.type && !FILE_TYPES.includes(req.body.type)) {
    return res.status(400).json({ error: `type must be one of: ${FILE_TYPES.join(', ')}` });
  }
  const source = req.body.source === 'direct' ? 'direct' : 'chat';
  const type =
    req.body.type ||
    (source === 'chat' && req.file.mimetype.startsWith('image/') ? 'photo' : 'other');

  const stored = await storage.put({
    projectId: req.params.id,
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
    buffer: req.file.buffer,
    uploadedBy: req.user.sub,
    type,
    source,
  });

  if (source === 'chat') {
    await messageService.appendMessage({
      projectId: req.params.id,
      senderType: 'user',
      userId: req.user.sub,
      type: 'file',
      content: req.file.originalname,
      fileId: stored.id,
    });
  }

  res.status(201).json(stored);
}));

router.get('/:id/files/:fileId', asyncHandler(async (req, res) => {
  const file = await storage.get(req.params.fileId);
  if (!file || String(file.project_id) !== req.params.id) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
  res.send(file.data);
}));

// --- Work Orders (docs/requirements/work-orders.md) ---
// Not admin-gated -- generating/drafting a work order isn't the sensitive
// action, what's in it is (cost, gated separately below and structurally
// absent from the PDF path).

router.get('/:id/work-orders', asyncHandler(async (req, res) => {
  res.json(await workOrderService.listWorkOrders(req.params.id));
}));

router.get('/:id/work-orders/draft', asyncHandler(async (req, res) => {
  const draft = await workOrderService.getCurrentDraft(req.params.id);
  if (!draft) return res.json(null);
  res.json(omitCostForNonAdmins(draft, req));
}));

router.post('/:id/work-orders/draft', asyncHandler(async (req, res) => {
  const draft = await workOrderService.ensureDraft(req.params.id, req.user.sub);
  res.status(201).json(omitCostForNonAdmins(draft, req));
}));

router.get('/:id/work-orders/:woId', asyncHandler(async (req, res) => {
  const workOrder = await workOrderService.getWorkOrder(req.params.woId);
  if (!workOrder || String(workOrder.project_id) !== req.params.id) {
    return res.status(404).json({ error: 'Work order not found' });
  }
  res.json(omitCostForNonAdmins(workOrder, req));
}));

router.put('/:id/work-orders/:woId', asyncHandler(async (req, res) => {
  const { scopeText = '', siteLocation = '', requestedStart = '', contingencyPercent = 0, terms = '' } = req.body;
  try {
    const updated = await workOrderService.updateDraftFields(req.params.woId, {
      scopeText,
      siteLocation,
      requestedStart,
      contingencyPercent,
      terms,
    });
    res.json(omitCostForNonAdmins(updated, req));
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
}));

// No `rate` field accepted here at all -- rates only ever come from a rate
// card (docs/feedback/2026-08-13-rate-card-authority-gap.md). A line
// without a rateCardType is scope-only and stays unresolved; there is no
// path for a client to supply a rate directly, for a manual line or
// otherwise.
function validateLinePayload(body) {
  const { rateCardType, rateCardItemId, rateCardItemName, name, unit, qty } = body;
  if (rateCardType && !rateCardService.isRateCardKey(rateCardType)) {
    return { error: 'Unknown rate card type' };
  }
  if (rateCardType && !rateCardItemId && !rateCardItemName) {
    return { error: 'rateCardItemId or rateCardItemName is required with rateCardType' };
  }
  if (!rateCardType && !name) {
    return { error: 'name is required for a scope-only line item' };
  }
  return {
    value: {
      rateCardType,
      rateCardItemId,
      rateCardItemName,
      name,
      unit,
      qty: Number(qty) || 1,
    },
  };
}

router.post('/:id/work-orders/:woId/line-items', asyncHandler(async (req, res) => {
  const { error, value } = validateLinePayload(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const item = await workOrderService.addLineItem(req.params.woId, value);
    res.status(201).json(req.user.isAdmin ? item : { ...item, cost: undefined });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
}));

router.put('/:id/work-orders/:woId/line-items/:itemId', asyncHandler(async (req, res) => {
  const { error, value } = validateLinePayload(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const item = await workOrderService.updateLineItem(req.params.woId, req.params.itemId, value);
    if (!item) return res.status(404).json({ error: 'Line item not found' });
    res.json(req.user.isAdmin ? item : { ...item, cost: undefined });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
}));

router.delete('/:id/work-orders/:woId/line-items/:itemId', asyncHandler(async (req, res) => {
  try {
    const deleted = await workOrderService.deleteLineItem(req.params.woId, req.params.itemId);
    if (!deleted) return res.status(404).json({ error: 'Line item not found' });
    res.status(204).end();
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
}));

// Generates the PDF and locks the draft. The PDF path only ever reads
// getLineItemsForPdf() -- structurally no access to cost, not just
// "has it but doesn't render it." See docs/requirements/work-orders.md.
router.post('/:id/work-orders/:woId/finalize', asyncHandler(async (req, res) => {
  const workOrder = await workOrderService.getWorkOrder(req.params.woId);
  if (!workOrder || String(workOrder.project_id) !== req.params.id) {
    return res.status(404).json({ error: 'Work order not found' });
  }
  if (workOrder.status !== 'draft') {
    return res.status(409).json({ error: 'Work order is not in draft state' });
  }

  // The rate-authority gate: every line item must resolve to a rate card
  // entry before this can be finalized -- unresolved is fine mid-draft,
  // never fine on the customer-facing document. See
  // docs/feedback/2026-08-13-rate-card-authority-gap.md.
  const unresolved = workOrder.lineItems.filter((li) => li.rate === null);
  if (unresolved.length > 0) {
    return res.status(409).json({
      error: `Cannot finalize: ${unresolved.length} line item(s) have no rate card entry -- ${unresolved
        .map((li) => li.name)
        .join(', ')}`,
    });
  }

  const [identity, project, lineItems] = await Promise.all([
    companyIdentityService.getIdentity(),
    projectService.getProject(req.params.id),
    workOrderService.getLineItemsForPdf(req.params.woId),
  ]);
  const customer = project.customer_id ? await customerService.getCustomer(project.customer_id) : null;

  const pdfBuffer = await generateWorkOrderPdf({
    identity,
    customer,
    project,
    workOrder: { ...workOrder, finalized_at: new Date() },
    lineItems,
  });

  const file = await storage.put({
    projectId: req.params.id,
    filename: `Work Order - ${project.name} v${workOrder.revision}.pdf`,
    mimeType: 'application/pdf',
    buffer: pdfBuffer,
    uploadedBy: req.user.sub,
    type: 'work-order',
    source: 'system',
  });

  const finalized = await workOrderService.finalize(req.params.woId, req.user.sub, file.id);
  res.json(omitCostForNonAdmins(finalized, req));
}));

router.post('/:id/work-orders/:woId/revise', asyncHandler(async (req, res) => {
  try {
    const revision = await workOrderService.createRevision(req.params.woId, req.user.sub);
    res.status(201).json(omitCostForNonAdmins(revision, req));
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
}));

router.get('/:id/work-orders/:woId/profit', requireAdmin, asyncHandler(async (req, res) => {
  res.json(await workOrderService.getProfitSummary(req.params.woId));
}));

// --- Tasks (docs/incoming/task-resource-pipeline.md) ---
// Manual (human_added) tasks/dependencies only this phase -- not admin-gated,
// matching Work Orders' posture (scoping isn't the sensitive action). The AI
// generation loop is a later increment on this same data model/API.

router.get('/:id/work-orders/:woId/tasks', asyncHandler(async (req, res) => {
  res.json(await taskService.listTasks(req.params.woId));
}));

router.post('/:id/work-orders/:woId/tasks', asyncHandler(async (req, res) => {
  const { name, description, responsibleParty } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const task = await taskService.createTask(req.params.woId, { name, description, responsibleParty });
  res.status(201).json(task);
}));

router.put('/:id/work-orders/:woId/tasks/:taskId', asyncHandler(async (req, res) => {
  const { name, description, responsibleParty, rationale } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const task = await taskService.updateTask(req.params.taskId, { name, description, responsibleParty, rationale });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
}));

router.delete('/:id/work-orders/:woId/tasks/:taskId', asyncHandler(async (req, res) => {
  const deleted = await taskService.deleteTask(req.params.taskId);
  if (!deleted) return res.status(404).json({ error: 'Task not found' });
  res.status(204).end();
}));

router.post('/:id/work-orders/:woId/tasks/:taskId/dependencies', asyncHandler(async (req, res) => {
  const { dependsOnTaskId } = req.body;
  if (!dependsOnTaskId) return res.status(400).json({ error: 'dependsOnTaskId is required' });
  try {
    const dependency = await taskService.addDependency(Number(req.params.taskId), Number(dependsOnTaskId));
    res.status(201).json(dependency);
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
}));

router.delete('/:id/work-orders/:woId/tasks/:taskId/dependencies/:depId', asyncHandler(async (req, res) => {
  const deleted = await taskService.deleteDependency(req.params.depId);
  if (!deleted) return res.status(404).json({ error: 'Dependency not found' });
  res.status(204).end();
}));

router.post('/:id/work-orders/:woId/tasks/approve', asyncHandler(async (req, res) => {
  const approvedCount = await taskService.approveTaskList(req.params.woId);
  res.json({ approvedCount });
}));

// Task Agent + Dependency Agent generation (docs/incoming/task-resource-pipeline.md
// §3). Async by design -- returns immediately, client polls generation-status.
// See docs/feedback/ for why (proxy timeout risk on a multi-round LLM loop).
router.post('/:id/work-orders/:woId/tasks/generate', asyncHandler(async (req, res) => {
  try {
    const run = await taskGenerationService.startGeneration(req.params.woId, req.user.sub);
    res.status(202).json(run);
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
}));

router.get('/:id/work-orders/:woId/tasks/generation-status', asyncHandler(async (req, res) => {
  const run = await taskGenerationService.getLatestRun(req.params.woId);
  res.json(run);
}));

// Dev-mode visibility into the round-by-round trace (§3.1) -- admin-only,
// never surfaced in the normal end-user flow.
router.get('/:id/work-orders/:woId/tasks/generation-runs/:runId', requireAdmin, asyncHandler(async (req, res) => {
  const run = await taskGenerationService.getRun(req.params.runId);
  if (!run || String(run.work_order_id) !== req.params.woId) {
    return res.status(404).json({ error: 'Run not found' });
  }
  res.json(run);
}));

export default router;
