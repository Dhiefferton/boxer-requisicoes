// ============================================================
// controllers/marketplaceController.js — Saídas e reposição do marketplace
// ============================================================
// Usado na tela do Inventário com o local "Marketplace".
// Regras e origem dos dados: integrations/marketplaceSaidas.js
// ============================================================
import {
  sincronizarSaidas, resumoSaidas, calcularReposicao, garantirRelatorioSemanal,
  listarRelatorios, obterRelatorio,
} from '../integrations/marketplaceSaidas.js';

// GET /marketplace/saidas?canal=&dias=
export async function saidasMarketplace(req, res, next) {
  try {
    // Copia o que faltar do Zen antes de responder (rápido quando já está em dia)
    let aviso = null;
    try { await sincronizarSaidas({ limiteMs: 15000 }); }
    catch (e) { aviso = `Não consegui atualizar as saídas do Zen agora (${e.message}). Mostrando o que já foi copiado.`; }
    try { await garantirRelatorioSemanal(); } catch (e) { console.error('[Marketplace] relatório semanal:', e.message); }
    const dados = await resumoSaidas({ canal: req.query.canal, dias: req.query.dias });
    res.json({ ...dados, aviso });
  } catch (err) { next(err); }
}

// GET /marketplace/reposicao?janela=28&margem=20&canal=
export async function reposicaoMarketplace(req, res, next) {
  try {
    res.json(await calcularReposicao({ janela: req.query.janela, margem: req.query.margem, canal: req.query.canal }));
  } catch (err) { next(err); }
}

// GET /marketplace/relatorios
export async function relatoriosMarketplace(req, res, next) {
  try { res.json({ relatorios: await listarRelatorios() }); }
  catch (err) { next(err); }
}

// GET /marketplace/relatorios/:id
export async function relatorioMarketplace(req, res, next) {
  try {
    const r = await obterRelatorio(req.params.id);
    if (!r) return res.status(404).json({ erro: 'Relatório não encontrado.' });
    res.json({ relatorio: r });
  } catch (err) { next(err); }
}

// POST /marketplace/relatorios/gerar (admin) — refaz o relatório da última sexta
export async function gerarRelatorioMarketplace(req, res, next) {
  try {
    await sincronizarSaidas({ intervaloMs: 0, limiteMs: 20000 });
    const r = await garantirRelatorioSemanal({ forcar: true, usuario: req.usuario?.nome });
    if (r.aguardando) return res.status(409).json({ erro: `Ainda não dá para fechar a semana: ${r.aguardando}.` });
    res.json(r);
  } catch (err) { next(err); }
}

// POST /marketplace/sincronizar (admin)
export async function sincronizarMarketplace(req, res, next) {
  try { res.json(await sincronizarSaidas({ intervaloMs: 0, limiteMs: 40000 })); }
  catch (err) { next(err); }
}
