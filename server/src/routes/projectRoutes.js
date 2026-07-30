import { Router } from 'express';
import multer from 'multer';
import * as projectService from '../services/projectService.js';
import * as messageService from '../services/messageService.js';
import * as storage from '../services/storage.js';
import * as workOrderService from '../services/workOrderService.js';
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

  const { agentMessage, project } = await runAgentTurn(projectId);

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
  const { scopeText = '', siteLocation = '', contingencyPercent = 0, terms = '' } = req.body;
  try {
    const updated = await workOrderService.updateDraftFields(req.params.woId, {
      scopeText,
      siteLocation,
      contingencyPercent,
      terms,
    });
    res.json(omitCostForNonAdmins(updated, req));
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
}));

function validateLinePayload(body) {
  const { rateCardType, rateCardItemId, rateCardItemName, name, unit, qty, rate } = body;
  if (rateCardType && !rateCardService.isRateCardKey(rateCardType)) {
    return { error: 'Unknown rate card type' };
  }
  if (rateCardType && !rateCardItemId && !rateCardItemName) {
    return { error: 'rateCardItemId or rateCardItemName is required with rateCardType' };
  }
  if (!rateCardType && !name) {
    return { error: 'name is required for a manual line item' };
  }
  return {
    value: {
      rateCardType,
      rateCardItemId,
      rateCardItemName,
      name,
      unit,
      qty: Number(qty) || 1,
      rate: Number(rate) || 0,
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
  const { name, unit = '', qty, rate } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const item = await workOrderService.updateLineItem(req.params.woId, req.params.itemId, {
      name,
      unit,
      qty: Number(qty) || 0,
      rate: Number(rate) || 0,
    });
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

export default router;
