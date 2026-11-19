// ============================================================
// integrations/baseCards.js — Database "Cards do sistema"
// ============================================================
// Database (tela Databases) com todos os cards das telas: Orçamentos, Lojinha,
// Garantia e as telas criadas pelo admin. Serve para o tipo de campo
// "Lista do B-Requisições": quem preenche o card escolhe outro card.
// Criada sozinha (bx_bases.sistema = 'cards') e atualizada a cada poucos
// minutos quando alguém abre a lista; cards que saem da tela (excluídos,
// encaminhados) ficam inativos. Só lê as telas — não muda nenhum card.
// Chave de cada registro em pipefy_id: orc:<id>, loj:<id>, gar:<id>, qd<N>:<id>.
// ============================================================
import { query } from '../config/db.js';

export const NOME_BASE_CARDS = 'Cards do sistema';
const COLUNAS = [
  { id: 'ctela', nome: 'Tela', tipo: 'texto', opcoes: [] },
  { id: 'cfase', nome: 'Fase', tipo: 'texto', opcoes: [] },
  { id: 'ccard', nome: 'Card', tipo: 'texto', opcoes: [] },
  { id: 'cpipefy', nome: 'Pipefy', tipo: 'texto', opcoes: [] },
  { id: 'ccriado', nome: 'Criado em', tipo: 'data', opcoes: [] },
];
const INTERVALO = 3 * 60 * 1000;
let ultima = 0, rodando = null;

const ler = (sql, par = []) => query(sql, par).then(r => r.rows).catch(() => null);
// Com o nome da fase (tabela de colunas da tela); sem a tabela, usa a chave da fase
const lerFase = async (sql, tabCol, par = []) => (await ler(sql, par))
  ?? (await ler(sql.replace(new RegExp(`LEFT JOIN ${tabCol} [a-z]+ ON [^\n]+`), '').replace(/COALESCE\((c|col)\.nome, ([^)]+)\)/, '$2'), par)) ?? [];
const dia = (d) => { try { return d ? new Date(d).toISOString().slice(0, 10) : ''; } catch { return ''; } };

/** Id da database "Cards do sistema" (cria se não existir). */
export async function baseCardsId() {
  await query(`ALTER TABLE bx_bases ADD COLUMN IF NOT EXISTS sistema VARCHAR(30)`);
  const ja = (await query(`SELECT id FROM bx_bases WHERE ativo AND sistema = 'cards' ORDER BY id LIMIT 1`)).rows[0];
  if (ja) return ja.id;
  const mesmoNome = (await query(`SELECT id FROM bx_bases WHERE ativo AND LOWER(nome) = LOWER($1) LIMIT 1`, [NOME_BASE_CARDS])).rows[0];
  if (mesmoNome) {
    await query(`UPDATE bx_bases SET sistema = 'cards', com_valor = FALSE, colunas = $2::jsonb WHERE id = $1`, [mesmoNome.id, JSON.stringify(COLUNAS)]);
    return mesmoNome.id;
  }
  const r = await query(`INSERT INTO bx_bases (nome, com_valor, colunas, sistema) VALUES ($1, FALSE, $2::jsonb, 'cards') RETURNING id`,
    [NOME_BASE_CARDS, JSON.stringify(COLUNAS)]);
  return r.rows[0].id;
}

async function todosOsCards() {
  const out = [];
  const add = (chave, tela, id, titulo, fase, pipefy, criado) => out.push({
    chave, descricao: `${String(titulo || '').trim() || `Card #${id}`} · ${tela} #${id}`.slice(0, 300),
    dados: { ctela: tela, cfase: fase || '', ccard: `#${id}`, ...(pipefy ? { cpipefy: String(pipefy) } : {}), ...(dia(criado) ? { ccriado: dia(criado) } : {}) },
  });
  // Orçamentos
  for (const r of await lerFase(`SELECT p.id, COALESCE(NULLIF(p.cliente_nome, ''), NULLIF(p.referencia, ''), 'Orçamento #' || p.id) AS titulo,
      COALESCE(c.nome, p.status) AS fase, p.pipefy_card_id, p.created_at
      FROM pedidos_orcamento p LEFT JOIN orc_colunas c ON c.chave = p.status
      WHERE TRUE`, 'orc_colunas')) {
    add(`orc:${r.id}`, 'Orçamentos', r.id, r.titulo, r.fase, r.pipefy_card_id, r.created_at);
  }
  // Lojinha
  for (const r of await lerFase(`SELECT p.id, p.numero_pedido, p.cliente_nome, COALESCE(c.nome, p.status) AS fase, p.criado_em
      FROM lojinha_boxer_pedidos p LEFT JOIN loj_colunas c ON c.chave = (CASE WHEN p.status = 'liberacao' THEN 'entrada' ELSE p.status END)
      WHERE p.status <> 'garantia'`, 'loj_colunas')) {
    add(`loj:${r.id}`, 'Lojinha', r.id, `Pedido ${r.numero_pedido}${r.cliente_nome ? ` — ${r.cliente_nome}` : ''}`, r.fase, null, r.criado_em);
  }
  // Garantia
  for (const r of await lerFase(`SELECT p.id, p.numero_pedido, p.cliente_nome, COALESCE(c.nome, p.cif_status) AS fase, p.pipefy_garantia_id, p.cif_entrou_em
      FROM lojinha_boxer_pedidos p LEFT JOIN cif_colunas c ON c.chave = p.cif_status
      WHERE p.cif_status IS NOT NULL AND p.cif_status <> '_excluido'`, 'cif_colunas')) {
    add(`gar:${r.id}`, 'Garantia', r.id, r.cliente_nome || `Pedido ${r.numero_pedido}`, r.fase, r.pipefy_garantia_id, r.cif_entrou_em);
  }
  // Telas criadas pelo admin
  for (const q of (await ler(`SELECT id, nome FROM bx_quadros WHERE ativo`)) || []) {
    const n = Number(q.id);
    const cards = await lerFase(`SELECT c.id, c.titulo, COALESCE(col.nome, c.status) AS fase, c.criado_em
      FROM bx_quadro_cards c LEFT JOIN qd${n}_colunas col ON col.chave = c.status
      WHERE c.quadro_id = $1 AND c.status <> '_encaminhado'`, `qd${n}_colunas`, [n]);
    for (const r of cards) add(`qd${n}:${r.id}`, q.nome, r.id, r.titulo, r.fase, null, r.criado_em);
  }
  return out;
}

/** Atualiza a database com os cards de todas as telas (no máx. a cada 3 min; force ignora o intervalo). */
export function sincronizarBaseCards(force = false) {
  if (rodando) return rodando;
  if (!force && Date.now() - ultima < INTERVALO) return Promise.resolve();
  ultima = Date.now();
  rodando = (async () => {
    const baseId = await baseCardsId();
    const cards = await todosOsCards();
    for (let i = 0; i < cards.length; i += 800) {
      await query(`INSERT INTO bx_base_registros (base_id, descricao, valor, pipefy_id, dados, ativo, criado_por_nome)
        SELECT $1, x.descricao, 0, x.chave, x.dados, TRUE, 'Sistema' FROM jsonb_to_recordset($2::jsonb) AS x(chave text, descricao text, dados jsonb)
        ON CONFLICT (base_id, pipefy_id) WHERE pipefy_id IS NOT NULL DO UPDATE
          SET descricao = EXCLUDED.descricao, dados = EXCLUDED.dados, ativo = TRUE, atualizado_em = NOW()
          WHERE bx_base_registros.descricao IS DISTINCT FROM EXCLUDED.descricao
             OR bx_base_registros.dados IS DISTINCT FROM EXCLUDED.dados OR NOT bx_base_registros.ativo`,
        [baseId, JSON.stringify(cards.slice(i, i + 800))]);
    }
    // Cards que saíram das telas: inativos (os cards que já escolheram continuam com o texto escolhido)
    await query(`UPDATE bx_base_registros SET ativo = FALSE, atualizado_em = NOW()
      WHERE base_id = $1 AND ativo AND pipefy_id IS NOT NULL AND NOT (pipefy_id = ANY($2::text[]))`, [baseId, cards.map(c => c.chave)]);
  })().catch(e => { console.error('[Base Cards]', e.message); }).finally(() => { rodando = null; });
  return rodando;
}

export async function ehBaseCards(id) {
  const r = await query(`SELECT 1 FROM bx_bases WHERE id = $1 AND sistema = 'cards'`, [Number(id) || 0]).catch(() => ({ rows: [] }));
  return !!r.rows[0];
}
