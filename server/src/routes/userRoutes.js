import { Router } from 'express';
import * as userService from '../services/userService.js';
import { hashPassword } from '../utils/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Mounted fully behind requireAuth + requireAdmin in app.js -- non-admins
// can't see the user list at all, not just edit it. See auth.md.
const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await userService.listUsers());
}));

router.post('/', asyncHandler(async (req, res) => {
  const { email, password, name, isAdmin } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password, and name are required' });
  }
  const existing = await userService.findUserByEmail(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'A user with that email already exists' });

  const passwordHash = await hashPassword(password);
  const user = await userService.createUser({
    email: email.toLowerCase(),
    passwordHash,
    name,
    isAdmin: Boolean(isAdmin),
  });
  res.status(201).json(user);
}));

// Edits name/isAdmin/isActive -- this is also how a user gets deactivated
// (isActive: false), not a delete. See auth.md.
router.put('/:id', asyncHandler(async (req, res) => {
  const { name, isAdmin, isActive } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const user = await userService.updateUser(req.params.id, {
    name,
    isAdmin: Boolean(isAdmin),
    isActive: isActive === undefined ? true : Boolean(isActive),
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
}));

export default router;
