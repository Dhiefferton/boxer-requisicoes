// ============================================================
// server.js — Ponto de entrada do backend
// Boxer Sistema de Requisição de Materiais
// ============================================================

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Segurança ────────────────────────────────────────────────
// helmet adiciona cabeçalhos HTTP de segurança automaticamente
app.use(helmet());

// CORS: só permite requisições da URL do frontend
app.use(cors({
  origin:      process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// Rate limiting: limita a 100 requisições por IP a cada 15 minutos
// Protege contra bots e uso abusivo
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutos
  max:      100,
  message:  { erro: 'Muitas requisições. Aguarde alguns minutos.' },
});
app.use('/api/', limiter);

// Limite menor especificamente para o login (proteção contra força bruta)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { erro: 'Muitas tentativas de login. Aguarde 15 minutos.' },
});
app.use('/api/auth/login', loginLimiter);

// ── Parser ───────────────────────────────────────────────────
// Aceita JSON no corpo das requisições, máximo 1mb
app.use(express.json({ limit: '1mb' }));

// ── Health check ─────────────────────────────────────────────
// Rota simples para verificar se o servidor está rodando
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app:    'Boxer Requisições API',
    versao: '1.0.0',
    env:    process.env.NODE_ENV,
  });
});

// ── Rotas da API ─────────────────────────────────────────────
app.use('/api', routes);

// ── Tratamento de erros ──────────────────────────────────────
// Rota não encontrada (deve ficar ANTES do errorHandler)
app.use(notFound);
// Handler central de erros (deve ser o ÚLTIMO middleware)
app.use(errorHandler);

// ── Inicialização ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Boxer Requisições API`);
  console.log(`   Rodando em: http://localhost:${PORT}`);
  console.log(`   Ambiente:   ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Health:     http://localhost:${PORT}/health\n`);
});

export default app;
