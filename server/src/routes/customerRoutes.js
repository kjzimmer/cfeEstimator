import { Router } from 'express';
import * as customerService from '../services/customerService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await customerService.listCustomers());
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, address, primaryContactName, phone, email, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const customer = await customerService.createCustomer({
    name,
    address,
    primaryContactName,
    phone,
    email,
    notes,
  });
  res.status(201).json(customer);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const customer = await customerService.getCustomer(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { name, address, primaryContactName, phone, email, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const customer = await customerService.updateCustomer(req.params.id, {
    name,
    address,
    primaryContactName,
    phone,
    email,
    notes,
  });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
}));

router.get('/:id/projects', asyncHandler(async (req, res) => {
  res.json(await customerService.listCustomerProjects(req.params.id));
}));

export default router;
