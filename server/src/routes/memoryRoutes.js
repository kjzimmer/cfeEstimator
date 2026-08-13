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

// Read-only view of what's actually active/confirmed -- the queue above only
// ever shows status:proposed, so without this there's no way to see what the
// agent already knows (human_seeded entries in particular never pass through
// the queue at all -- see docs/requirements/agent-memory.md's seed-data note).
router.get('/active', asyncHandler(async (req, res) => {
  const [procedural, semantic] = await Promise.all([
    memoryService.listActiveProcedural(),
    memoryService.listActiveSemantic(),
  ]);
  res.json({
    procedural: procedural.map((p) => ({ type: 'procedural', ...p })),
    semantic: semantic.map((s) => ({ type: 'semantic', ...s })),
  });
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
