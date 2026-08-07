-- ============================================================
-- SUPABASE — Agendar sincronização ZenERP via pg_cron + pg_net
-- Boxer Sistema de Requisição de Materiais
-- ============================================================
-- Este script é específico do Supabase (usa extensões pg_cron e
-- pg_net que só existem lá, não no Postgres do Railway). Ele agenda
-- uma chamada HTTP de 5 em 5 minutos para a rota GET /api/erp/cron
-- do backend na Vercel, substituindo o setInterval que só funcionava
-- em processo contínuo (Railway).
--
-- ANTES DE RODAR: troque SEU_CRON_SECRET_AQUI pelo valor real da
-- variável de ambiente CRON_SECRET configurada no Vercel.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove um agendamento anterior com o mesmo nome, se existir
-- (permite rodar este script de novo sem duplicar o job)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-erp-zenerp';

-- Agenda a chamada de 5 em 5 minutos
SELECT cron.schedule(
  'sync-erp-zenerp',
  '*/5 * * * *',
  $$
  SELECT net.http_get(
    url     := 'https://boxer-requisicoes.vercel.app/api/erp/cron',
    headers := jsonb_build_object('Authorization', 'Bearer SEU_CRON_SECRET_AQUI')
  );
  $$
);

-- Confirma que o job foi criado
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'sync-erp-zenerp';
