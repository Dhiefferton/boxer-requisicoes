// ============================================================
// controllers/configOrcamentoController.js — Configuração da tela de Orçamentos
// ============================================================
// Colunas (fases) e campos de cada coluna, configurados pelo admin no
// B-Requisições. Nada aqui consulta ou altera o Pipefy.
//   orc_colunas: as colunas da tela (as do sistema + as criadas aqui)
//   orc_campos : campos de cada coluna ('inicio' = formulário do Novo card)
// Os valores dos campos ficam no card, com id "bx_<id do campo>". Campo trazido de uma
// fase do Pipefy (pipefy_campo) usa o id do campo do Pipefy, onde o valor já está.
// orc_colunas.campos_importados: os campos da fase do Pipefy já vieram para a coluna
// (a partir daí a coluna mostra só os campos configurados aqui).
// ============================================================
import { query, transaction } from '../config/db.js';

// Colunas do sistema (mesma ordem/ids de frontend/src/utils/fasesOrcamento.js).
// zen = o que o sistema faz no Zen nessa coluna (só informação; não se edita aqui).
export const COLUNAS_PADRAO = [
  { chave: 'entrada',              nome: 'Entrada',                  cor: '#64748b', so_admin: true,  fase: '309113139' },
  { chave: 'divergencia_entrada',  nome: 'Divergência de entrada',   cor: '#f43f5e', so_admin: true,  fase: '321786152' },
  { chave: 'liberado_orcar',       nome: 'Liberado p/ Orçar',        cor: '#0ea5e9', so_admin: true,  fase: '309251963' },
  { chave: 'orcando',              nome: 'Orçando',                  cor: '#6366f1', so_admin: true,  fase: '309113140' },
  { chave: 'solicitacao',          nome: 'Requisitar Peças',         cor: '#3b82f6', so_admin: false, fase: '344449850', zen: 'Cria o pedido de venda e a ordem de separação e leva o card para Em Separação.' },
  { chave: 'separando',            nome: 'Em Separação',             cor: '#f59e0b', so_admin: false, zen: 'Etapa do Zen: espera a separação terminar.' },
  { chave: 'separado',             nome: 'Separado',                 cor: '#a855f7', so_admin: false, zen: 'Etapa do Zen: separação concluída.' },
  { chave: 'envio_orcamento',      nome: 'Envio de orçamento',       cor: '#14b8a6', so_admin: true,  fase: '309113141' },
  { chave: 'aguardando_aprovacao', nome: 'Aguardando aprovação',     cor: '#eab308', so_admin: true,  fase: '312761688' },
  { chave: 'aprovado_recusado',    nome: 'Aprovado/Recusado',        cor: '#06b6d4', so_admin: false, fase: '309113142' },
  { chave: 'em_manutencao',        nome: 'Em manutenção',            cor: '#f97316', so_admin: true,  fase: '309252064' },
  { chave: 'nao_liberado',         nome: 'Concluído - Não Liberado', cor: '#ef4444', so_admin: true,  fase: '309113144', zen: 'Fecha o romaneio e cria a nota fiscal.' },
  { chave: 'liberado_saida',       nome: 'Liberado para Saída',      cor: '#84cc16', so_admin: true,  fase: '309713436' },
  { chave: 'finalizado',           nome: 'Expedição',                cor: '#22c55e', so_admin: false, fase: '309113145', arquivada: true },
  { chave: 'sucata',               nome: 'Sucata',                   cor: '#71717a', so_admin: true,  fase: '310056658', arquivada: true },
];
const PADRAO_POR_CHAVE = new Map(COLUNAS_PADRAO.map(c => [c.chave, c]));

export const TIPOS_CAMPO = ['texto', 'longo', 'anexo', 'checkbox', 'responsavel', 'data', 'datahora', 'vencimento',
  'etiquetas', 'email', 'telefone', 'lista', 'unica', 'numero', 'moeda', 'documento', 'conexao'];
const LISTAS = ['Modelos de máquina'];

let estrutura = null;
function garantirConfig() {
  if (!estrutura) {
    estrutura = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS orc_colunas (
          chave      VARCHAR(60) PRIMARY KEY,
          nome       VARCHAR(80) NOT NULL,
          cor        VARCHAR(9)  NOT NULL DEFAULT '#64748b',
          ordem      INTEGER     NOT NULL DEFAULT 0,
          so_admin   BOOLEAN     NOT NULL DEFAULT TRUE,
          arquivada  BOOLEAN     NOT NULL DEFAULT FALSE,
          sistema    BOOLEAN     NOT NULL DEFAULT FALSE,
          ativo      BOOLEAN     NOT NULL DEFAULT TRUE,
          atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS orc_campos (
          id         SERIAL PRIMARY KEY,
          coluna     VARCHAR(60) NOT NULL,
          tipo       VARCHAR(20) NOT NULL,
          rotulo     VARCHAR(120) NOT NULL,
          descricao  VARCHAR(300),
          obrigatorio BOOLEAN NOT NULL DEFAULT FALSE,
          opcoes     JSONB,
          lista      VARCHAR(60),
          ordem      INTEGER NOT NULL DEFAULT 0,
          ativo      BOOLEAN NOT NULL DEFAULT TRUE,
          atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_orc_campos_coluna ON orc_campos (coluna);
        ALTER TABLE orc_campos  ADD COLUMN IF NOT EXISTS pipefy_campo VARCHAR(80);
        ALTER TABLE orc_colunas ADD COLUMN IF NOT EXISTS campos_importados BOOLEAN NOT NULL DEFAULT FALSE;
          ALTER TABLE orc_colunas ADD COLUMN IF NOT EXISTS destinos JSONB;`);
      // Colunas do sistema que ainda não estão na tabela (primeira vez ou coluna nova no código)
      const tem = new Set((await query(`SELECT chave FROM orc_colunas`)).rows.map(r => r.chave));
      for (const [i, c] of COLUNAS_PADRAO.entries()) {
        if (tem.has(c.chave)) { await query(`UPDATE orc_colunas SET sistema = TRUE WHERE chave = $1`, [c.chave]); continue; }
        await query(`INSERT INTO orc_colunas (chave, nome, cor, ordem, so_admin, arquivada, sistema) VALUES ($1,$2,$3,$4,$5,$6,TRUE)`,
          [c.chave, c.nome, c.cor, (i + 1) * 10, !!c.so_admin, !!c.arquivada]);
      }
    })().catch(err => { estrutura = null; throw err; });
  }
  return estrutura;
}

let cache = null;
/** Configuração atual: { colunas: [...em ordem], campos: [...] }. Cache curto (invalidado ao salvar). */
export async function lerConfigOrcamento() {
  if (cache && Date.now() - cache.em < 30000) return cache.dados;
  await garantirConfig();
  const [col, cam] = await Promise.all([
    query(`SELECT chave, nome, cor, ordem, so_admin, arquivada, sistema, campos_importados, destinos FROM orc_colunas WHERE ativo ORDER BY ordem, chave`),
    query(`SELECT id, coluna, tipo, rotulo, descricao, obrigatorio, COALESCE(opcoes, '[]'::jsonb) AS opcoes, lista, ordem, pipefy_campo
             FROM orc_campos WHERE ativo ORDER BY coluna, ordem, id`),
  ]);
  const dados = {
    colunas: col.rows.map(c => {
      const p = PADRAO_POR_CHAVE.get(c.chave);
      return { ...c, fase_pipefy: p?.fase || null, zen: p?.zen || null };
    }),
    campos: cam.rows,
  };
  cache = { em: Date.now(), dados };
  return dados;
}

// GET /pedidos-orcamento/config
export async function verConfig(req, res, next) {
  try { res.json({ ...(await lerConfigOrcamento()), tipos: TIPOS_CAMPO, listas: LISTAS }); }
  catch (err) { next(err); }
}

/** Id do valor do campo no card: o do Pipefy (campo trazido da fase) ou bx_<id>. */
export const idCampoConfig = (c) => c.pipefy_campo || `bx_${c.id}`;

const COR_OK = /^#[0-9a-f]{6}$/i;
const limpar = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// POST /pedidos-orcamento/config (admin) — grava a configuração inteira
// { colunas: [{ chave?, nome, cor, so_admin, arquivada }], campos: [{ id?, coluna, tipo, rotulo, descricao, obrigatorio, opcoes, lista }] }
// A ordem das listas é a ordem na tela. Coluna sem chave = coluna nova.
export async function salvarConfig(req, res, next) {
  try {
    await garantirConfig();
    const colunas = Array.isArray(req.body?.colunas) ? req.body.colunas : null;
    const campos = Array.isArray(req.body?.campos) ? req.body.campos : null;
    if (!colunas || !campos) return res.status(400).json({ erro: 'Envie { colunas: [...], campos: [...] }.' });
    if (colunas.length > 60 || campos.length > 600) return res.status(400).json({ erro: 'Configuração grande demais.' });

    const atuais = (await query(`SELECT chave, sistema FROM orc_colunas WHERE ativo`)).rows;
    const sistema = new Set(atuais.filter(c => c.sistema).map(c => c.chave));
    const existentes = new Set(atuais.map(c => c.chave));

    // Colunas recebidas (as novas ganham chave aqui)
    const novasChaves = {};
    const lista = colunas.map((c, i) => {
      const nome = limpar(c?.nome, 80);
      if (!nome) throw Object.assign(new Error('Toda coluna precisa de um nome.'), { status: 400 });
      let chave = String(c?.chave || '').trim();
      if (chave && !existentes.has(chave)) chave = '';
      if (!chave) {
        chave = `col_${Date.now().toString(36)}_${i}`;
        if (c?.chave_temp) novasChaves[c.chave_temp] = chave;
      }
      return { chave, nome, cor: COR_OK.test(c?.cor || '') ? c.cor : '#64748b', ordem: (i + 1) * 10,
        so_admin: c?.so_admin !== false, arquivada: !!c?.arquivada, campos_importados: !!c?.campos_importados,
          destinos: Array.isArray(c?.destinos) ? c.destinos.map(String) : null };
    });
    const nomes = lista.map(c => c.nome.toLowerCase());
    const repetido = nomes.find((n, i) => nomes.indexOf(n) !== i);
    if (repetido) return res.status(400).json({ erro: `Há duas colunas com o nome "${repetido}".` });

    // Para onde cada coluna pode mover (null = todas): chaves novas trocadas, só colunas que ficam
    const chavesFinais = new Set(lista.map(c => c.chave));
    for (const c of lista) if (c.destinos) c.destinos = [...new Set(c.destinos.map(k => novasChaves[k] || k))].filter(k => k !== c.chave && chavesFinais.has(k));

    // Colunas que saíram: as do sistema não podem ser excluídas; as criadas aqui só se estiverem vazias
    const ficam = new Set(lista.map(c => c.chave));
    const saem = atuais.filter(c => !ficam.has(c.chave));
    const doSistema = saem.filter(c => sistema.has(c.chave));
    if (doSistema.length) {
      return res.status(400).json({ erro: `As colunas do sistema não podem ser excluídas: ${doSistema.map(c => PADRAO_POR_CHAVE.get(c.chave)?.nome || c.chave).join(', ')}.` });
    }
    if (saem.length) {
      const comCards = (await query(
        `SELECT status, COUNT(*)::int AS n FROM pedidos_orcamento WHERE status = ANY($1::text[]) GROUP BY status`,
        [saem.map(c => c.chave)])).rows;
      if (comCards.length) {
        return res.status(400).json({ erro: `Não dá para excluir coluna com cards. Mova os cards antes: ${comCards.map(r => `${r.status} (${r.n})`).join(', ')}.` });
      }
    }

    // Campos
    const colunasValidas = new Set(['inicio', ...lista.map(c => c.chave)]);
    const ordemPorColuna = {};
    const camposOk = [];
    for (const c of campos) {
      const coluna = novasChaves[c?.coluna] || String(c?.coluna || '');
      if (!colunasValidas.has(coluna)) continue;
      const tipo = TIPOS_CAMPO.includes(c?.tipo) ? c.tipo : null;
      const rotulo = limpar(c?.rotulo, 120);
      if (!tipo) return res.status(400).json({ erro: `Tipo de campo inválido: ${c?.tipo}.` });
      if (!rotulo) return res.status(400).json({ erro: 'Todo campo precisa de um nome.' });
      ordemPorColuna[coluna] = (ordemPorColuna[coluna] || 0) + 10;
      const opcoes = Array.isArray(c?.opcoes) ? [...new Set(c.opcoes.map(o => limpar(o, 120)).filter(Boolean))].slice(0, 100) : [];
      camposOk.push({ id: Number(c?.id) || null, coluna, tipo, rotulo, descricao: limpar(c?.descricao, 300) || null,
        obrigatorio: !!c?.obrigatorio, opcoes, ordem: ordemPorColuna[coluna], pipefy_campo: limpar(c?.pipefy_campo, 80) || null,
        lista: tipo === 'conexao' && !c?.pipefy_campo ? (LISTAS.includes(c?.lista) ? c.lista : LISTAS[0]) : null });
    }

    await transaction(async (cli) => {
      for (const c of lista) {
        await cli.query(
          `INSERT INTO orc_colunas (chave, nome, cor, ordem, so_admin, arquivada, campos_importados, destinos, sistema, ativo, atualizado_em)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,FALSE,TRUE,NOW())
           ON CONFLICT (chave) DO UPDATE SET nome = EXCLUDED.nome, cor = EXCLUDED.cor, ordem = EXCLUDED.ordem,
             so_admin = EXCLUDED.so_admin, arquivada = EXCLUDED.arquivada, destinos = EXCLUDED.destinos,
             campos_importados = orc_colunas.campos_importados OR EXCLUDED.campos_importados, ativo = TRUE, atualizado_em = NOW()`,
          [c.chave, c.nome, c.cor, c.ordem, c.so_admin, c.arquivada, c.campos_importados, c.destinos ? JSON.stringify(c.destinos) : null]);
      }
      if (saem.length) await cli.query(`UPDATE orc_colunas SET ativo = FALSE, atualizado_em = NOW() WHERE chave = ANY($1::text[])`, [saem.map(c => c.chave)]);
      // Campos que saíram ficam desativados (os valores já preenchidos nos cards continuam guardados)
      const manter = camposOk.filter(c => c.id).map(c => c.id);
      await cli.query(`UPDATE orc_campos SET ativo = FALSE, atualizado_em = NOW() WHERE ativo AND NOT (id = ANY($1::int[]))`, [manter]);
      for (const c of camposOk) {
        const vals = [c.coluna, c.tipo, c.rotulo, c.descricao, c.obrigatorio, JSON.stringify(c.opcoes), c.lista, c.ordem, c.pipefy_campo];
        if (c.id) {
          const r = await cli.query(
            `UPDATE orc_campos SET coluna=$1, tipo=$2, rotulo=$3, descricao=$4, obrigatorio=$5, opcoes=$6::jsonb, lista=$7, ordem=$8, pipefy_campo=$9,
                    ativo = TRUE, atualizado_em = NOW() WHERE id = $10`, [...vals, c.id]);
          if (r.rowCount) continue;
        }
        await cli.query(
          `INSERT INTO orc_campos (coluna, tipo, rotulo, descricao, obrigatorio, opcoes, lista, ordem, pipefy_campo) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`, vals);
      }
    });
    cache = null;
    res.json({ sucesso: true, ...(await lerConfigOrcamento()) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ erro: err.message });
    next(err);
  }
}
