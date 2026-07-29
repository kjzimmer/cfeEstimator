import { Router } from 'express';
import { findUserByEmail } from '../services/userService.js';
import { verifyPassword, signToken } from '../utils/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const user = await findUserByEmail(email.toLowerCase());
  if (!user || !user.is_active || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, isAdmin: user.is_admin },
  });
}));

export default router;
