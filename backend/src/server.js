import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import db from './config/db.js';
import { iniciarSyncErp } from './jobs/syncErpEstoque.js';
import erpRoutes from './routes/erp.js';

const app  = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin:      process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

app.locals.db = db;

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app:    'Boxer Requisicoes API',
    versao: '1.0.0',
    env:    process.env.NODE_ENV,
  });
});

app.use('/api', routes);
app.use('/api/erp', erpRoutes);
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\nBoxer Requisicoes API`);
  console.log(`   Rodando em: http://localhost:${PORT}`);
  console.log(`   Ambiente:   ${process.env.NODE_ENV || 'development'}\n`);
  iniciarSyncErp(db);
});

export default app;
