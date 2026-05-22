import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';

const app  = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);

app.use(helmet());

app.use(cors({
  origin:      process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app:    'Boxer Requisições API',
    versao: '1.0.0',
    env:    process.env.NODE_ENV,
  });
});

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n🚀 Boxer Requisições API`);
  console.log(`   Rodando em: http://localhost:${PORT}`);
  console.log(`   Ambiente:   ${process.env.NODE_ENV || 'development'}\n`);
});

export default app;