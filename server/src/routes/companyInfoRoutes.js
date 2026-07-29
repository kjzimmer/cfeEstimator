import { Router } from 'express';
import { listSections, getSection, updateSection } from '../services/companyInfoService.js';
import * as rateCardService from '../services/rateCardService.js';
import { requireAdmin } from '../middleware/requireAuth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// cost is admin-only wherever rate cards appear (docs/requirements/company-info.md)
// -- stripped here at the API boundary, not left to callers to remember.
function omitCostForNonAdmins(items, req) {
  if (req.user?.isAdmin) return items;
  return items.map(({ cost, ...rest }) => rest);
}

// Structured rate-card sections (service_rates, material_costs) -- rows of
// { name, unit, rate, cost } in their own tables, not the freeform `content`
// column. See docs/requirements/company-info.md.
router.get('/:sectionKey/items', asyncHandler(async (req, res) => {
  if (!rateCardService.isRateCardKey(req.params.sectionKey)) {
    return res.status(400).json({ error: 'Not a structured rate card section' });
  }
  const items = await rateCardService.listItems(req.params.sectionKey);
  res.json(omitCostForNonAdmins(items, req));
}));

router.post('/:sectionKey/items', requireAdmin, asyncHandler(async (req, res) => {
  if (!rateCardService.isRateCardKey(req.params.sectionKey)) {
    return res.status(400).json({ error: 'Not a structured rate card section' });
  }
  const { name, unit, rate, cost } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const item = await rateCardService.createItem(req.params.sectionKey, { name, unit, rate, cost });
  res.status(201).json(item);
}));

router.put('/:sectionKey/items/:itemId', requireAdmin, asyncHandler(async (req, res) => {
  if (!rateCardService.isRateCardKey(req.params.sectionKey)) {
    return res.status(400).json({ error: 'Not a structured rate card section' });
  }
  const { name, unit, rate, cost } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const item = await rateCardService.updateItem(req.params.sectionKey, req.params.itemId, { name, unit, rate, cost });
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
}));

router.delete('/:sectionKey/items/:itemId', requireAdmin, asyncHandler(async (req, res) => {
  if (!rateCardService.isRateCardKey(req.params.sectionKey)) {
    return res.status(400).json({ error: 'Not a structured rate card section' });
  }
  const deleted = await rateCardService.deleteItem(req.params.sectionKey, req.params.itemId);
  if (!deleted) return res.status(404).json({ error: 'Item not found' });
  res.status(204).end();
}));

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listSections());
}));

router.get('/:sectionKey', asyncHandler(async (req, res) => {
  const section = await getSection(req.params.sectionKey);
  if (!section) return res.status(404).json({ error: 'Section not found' });
  res.json(section);
}));

router.put('/:sectionKey', requireAdmin, asyncHandler(async (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'content (string) is required' });
  }
  const section = await updateSection(req.params.sectionKey, content, req.user.sub);
  if (!section) return res.status(404).json({ error: 'Section not found' });
  res.json(section);
}));

export default router;
