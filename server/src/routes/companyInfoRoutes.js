import { Router } from 'express';
import { listSections, getSection, updateSection } from '../services/companyInfoService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listSections());
}));

router.get('/:sectionKey', asyncHandler(async (req, res) => {
  const section = await getSection(req.params.sectionKey);
  if (!section) return res.status(404).json({ error: 'Section not found' });
  res.json(section);
}));

router.put('/:sectionKey', asyncHandler(async (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content (string) is required' });
  }
  const section = await updateSection(req.params.sectionKey, content, req.user.sub);
  if (!section) return res.status(404).json({ error: 'Section not found' });
  res.json(section);
}));

export default router;
