import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/authRoutes.js';
import companyInfoRoutes from './routes/companyInfoRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import userRoutes from './routes/userRoutes.js';
import { requireAuth, requireAdmin } from './middleware/requireAuth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/company-info', requireAuth, companyInfoRoutes);
  app.use('/api/projects', requireAuth, projectRoutes);
  app.use('/api/customers', requireAuth, customerRoutes);
  app.use('/api/users', requireAuth, requireAdmin, userRoutes);

  // In production, Express serves the built React app alongside the API.
  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.join(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
