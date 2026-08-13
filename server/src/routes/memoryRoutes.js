import { Router } from 'express';
import * as memoryService from '../services/memoryService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Mounted fully behind requireAuth + requireAdmin in app.js, matching
// Company Info's edit permission level -- see docs/requirements/agent-memory.md
// ("Review queue: Admin-only").
const router = Router();

router.get('/proposals', asyncHandler(async (req, res) => {
  res.json(await memoryService.listProposals());
}));

router.post('/:type/:id/review', asyncHandler(async (req, res) => {
  const { type, id } = req.params;
  const { decision } = req.body;
  if (!['procedural', 'semantic'].includes(type)) {
    return res.status(400).json({ error: 'type must be procedural or semantic' });
  }
  if (!['accept', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be accept or reject' });
  }
  const reviewFn = type === 'procedural' ? memoryService.reviewProcedural : memoryService.reviewSemantic;
  const updated = await reviewFn(id, decision, req.user.sub);
  if (!updated) return res.status(404).json({ error: 'Proposal not found (or already reviewed)' });
  res.json(updated);
}));

export default router;
