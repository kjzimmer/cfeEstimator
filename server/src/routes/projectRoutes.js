import { Router } from 'express';
import multer from 'multer';
import * as projectService from '../services/projectService.js';
import * as messageService from '../services/messageService.js';
import * as storage from '../services/storage.js';
import { runAgentTurn } from '../agent/agentService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = Router();

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

router.post('/:id/files', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const stored = await storage.put({
    projectId: req.params.id,
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
    buffer: req.file.buffer,
    uploadedBy: req.user.sub,
  });
  await messageService.appendMessage({
    projectId: req.params.id,
    senderType: 'user',
    userId: req.user.sub,
    type: 'file',
    content: req.file.originalname,
    fileId: stored.id,
  });
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

export default router;
