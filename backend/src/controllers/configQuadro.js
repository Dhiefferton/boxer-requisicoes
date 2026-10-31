// ============================================================
// controllers/configQuadro.js — Configuração de colunas e campos de um quadro
// ============================================================
// Mesma configuração da tela de Orçamentos (configOrcamentoController.js),
// para outros quadros (ex.: Lojinha): tabelas próprias de colunas e campos.
// Os valores dos campos ficam no pedido com id "bx_<id do campo>".
// ============================================================
import { query, transaction } from '../config/db.js';

export const TIPOS_CAMPO = ['texto', 'longo', 'anexo', 'checkbox', 'responsavel', 'data', 'datahora', 'vencimento',
  'etiquetas', 'email', 'telefone', 'lista', 'unica', 'numero', 'moeda', 'documento', 'conexao'];
const LISTAS = ['Modelos de máquina'];

/**
 * Campo obrigatório agora? Sem condição: se marcado obrigatório. Com condição
 * ({ campo: id de outro campo, valor }): só quando o outro campo tem esse valor.
 */
export function exigidoAgora(c, todos, valores, idCampo) {
  if (!c.obrigatorio) return false;
  if (!c.condicao?.campo) return true;
  const ref = (todos || []).find(x => Number(x.id) === Number(c.condicao.campo));
  if (!ref) return true;
  const v = String(valores?.[idCampo(ref)] ?? '').trim();
  let lista = [v];
  if (v.startsWith('[')) { try { const a = JSON.parse(v); if (Array.isArray(a)) lista = a; } catch { /* texto */ } }
  return lista.map(x => String(x).trim()).includes(String(c.condicao.valor).trim());
}

/**
 * @param {{ TC: string, TF: string, tabPedidos: string, padrao: Array<{chave,nome,cor,so_admin?,arquivada?,zen?}> }} o
 */
export function criarConfigQuadro({ TC, TF, tabPedidos, padrao }) {
  const porChave = new Map(padrao.map(c => [c.chave, c]));
  let estrutura = null;
  function garantirConfig() {
    if (!estrutura) {
      estrutura = (async () => {
        await query(`
          CREATE TABLE IF NOT EXISTS ${TC} (
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
          CREATE TABLE IF NOT EXISTS ${TF} (
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
          CREATE INDEX IF NOT EXISTS idx_${TF}_coluna ON ${TF} (coluna);
          ALTER TABLE ${TF}  ADD COLUMN IF NOT EXISTS pipefy_campo VARCHAR(80);
          ALTER TABLE ${TC} ADD COLUMN IF NOT EXISTS campos_importados BOOLEAN NOT NULL DEFAULT FALSE;
          ALTER TABLE ${TC} ADD COLUMN IF NOT EXISTS destinos JSONB;
          ALTER TABLE ${TF} ADD COLUMN IF NOT EXISTS condicao JSONB;`);
        // Colunas do sistema que ainda não estão na tabela (primeira vez ou coluna nova no código)
        const tem = new Set((await query(`SELECT chave FROM ${TC}`)).rows.map(r => r.chave));
        for (const [i, c] of padrao.entries()) {
          if (tem.has(c.chave)) { await query(`UPDATE ${TC} SET sistema = TRUE WHERE chave = $1`, [c.chave]); continue; }
          await query(`INSERT INTO ${TC} (chave, nome, cor, ordem, so_admin, arquivada, sistema) VALUES ($1,$2,$3,$4,$5,$6,TRUE)`,
            [c.chave, c.nome, c.cor, (i + 1) * 10, !!c.so_admin, !!c.arquivada]);
        }
      })().catch(err => { estrutura = null; throw err; });
    }
    return estrutura;
  }
  
  let cache = null;
  /** Configuração atual: { colunas: [...em ordem], campos: [...] }. Cache curto (invalidado ao salvar). */
  async function ler() {
    if (cache && Date.now() - cache.em < 30000) return cache.dados;
    await garantirConfig();
    const [col, cam] = await Promise.all([
      query(`SELECT chave, nome, cor, ordem, so_admin, arquivada, sistema, campos_importados, destinos FROM ${TC} WHERE ativo ORDER BY ordem, chave`),
      query(`SELECT id, coluna, tipo, rotulo, descricao, obrigatorio, COALESCE(opcoes, '[]'::jsonb) AS opcoes, lista, ordem, pipefy_campo, condicao
               FROM ${TF} WHERE ativo ORDER BY coluna, ordem, id`),
    ]);
    const dados = {
      colunas: col.rows.map(c => {
        const p = porChave.get(c.chave);
        return { ...c, fase_pipefy: p?.fase || null, zen: p?.zen || null };
      }),
      campos: cam.rows,
    };
    cache = { em: Date.now(), dados };
    return dados;
  }
  
  // GET /pedidos-orcamento/config
  async function verConfig(req, res, next) {
    try { res.json({ ...(await ler()), tipos: TIPOS_CAMPO, listas: LISTAS }); }
    catch (err) { next(err); }
  }
  
  /** Id do valor do campo no card: o do Pipefy (campo trazido da fase) ou bx_<id>. */
  const idCampoConfig = (c) => c.pipefy_campo || `bx_${c.id}`;
  
  const COR_OK = /^#[0-9a-f]{6}$/i;
  const limpar = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  
  // POST /pedidos-orcamento/config (admin) — grava a configuração inteira
  // { colunas: [{ chave?, nome, cor, so_admin, arquivada }], campos: [{ id?, coluna, tipo, rotulo, descricao, obrigatorio, opcoes, lista }] }
  // A ordem das listas é a ordem na tela. Coluna sem chave = coluna nova.
  async function salvarConfig(req, res, next) {
    try {
      await garantirConfig();
      const colunas = Array.isArray(req.body?.colunas) ? req.body.colunas : null;
      const campos = Array.isArray(req.body?.campos) ? req.body.campos : null;
      if (!colunas || !campos) return res.status(400).json({ erro: 'Envie { colunas: [...], campos: [...] }.' });
      if (colunas.length > 60 || campos.length > 600) return res.status(400).json({ erro: 'Configuração grande demais.' });
  
      const atuais = (await query(`SELECT chave, sistema FROM ${TC} WHERE ativo`)).rows;
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
        return res.status(400).json({ erro: `As colunas do sistema não podem ser excluídas: ${doSistema.map(c => porChave.get(c.chave)?.nome || c.chave).join(', ')}.` });
      }
      if (saem.length) {
        const comCards = (await query(
          `SELECT status, COUNT(*)::int AS n FROM ${tabPedidos} WHERE status = ANY($1::text[]) GROUP BY status`,
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
          lista: tipo === 'conexao' && !c?.pipefy_campo ? (LISTAS.includes(c?.lista) ? c.lista : LISTAS[0]) : null,
          // Obrigatório só quando outro campo tem um valor: { campo: uid do outro campo, valor }
          uid: String(c?.uid || ''), condicao: c?.condicao?.campo && c?.condicao?.valor ? { campo: String(c.condicao.campo), valor: limpar(c.condicao.valor, 120) } : null });
      }
  
      await transaction(async (cli) => {
        for (const c of lista) {
          await cli.query(
            `INSERT INTO ${TC} (chave, nome, cor, ordem, so_admin, arquivada, campos_importados, destinos, sistema, ativo, atualizado_em)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,FALSE,TRUE,NOW())
             ON CONFLICT (chave) DO UPDATE SET nome = EXCLUDED.nome, cor = EXCLUDED.cor, ordem = EXCLUDED.ordem,
               so_admin = EXCLUDED.so_admin, arquivada = EXCLUDED.arquivada, destinos = EXCLUDED.destinos,
               campos_importados = ${TC}.campos_importados OR EXCLUDED.campos_importados, ativo = TRUE, atualizado_em = NOW()`,
            [c.chave, c.nome, c.cor, c.ordem, c.so_admin, c.arquivada, c.campos_importados, c.destinos ? JSON.stringify(c.destinos) : null]);
        }
        if (saem.length) await cli.query(`UPDATE ${TC} SET ativo = FALSE, atualizado_em = NOW() WHERE chave = ANY($1::text[])`, [saem.map(c => c.chave)]);
        // Campos que saíram ficam desativados (os valores já preenchidos nos cards continuam guardados)
        const manter = camposOk.filter(c => c.id).map(c => c.id);
        await cli.query(`UPDATE ${TF} SET ativo = FALSE, atualizado_em = NOW() WHERE ativo AND NOT (id = ANY($1::int[]))`, [manter]);
        const idPorUid = {};
        for (const c of camposOk) {
          const vals = [c.coluna, c.tipo, c.rotulo, c.descricao, c.obrigatorio, JSON.stringify(c.opcoes), c.lista, c.ordem, c.pipefy_campo];
          if (c.id) {
            const r = await cli.query(
              `UPDATE ${TF} SET coluna=$1, tipo=$2, rotulo=$3, descricao=$4, obrigatorio=$5, opcoes=$6::jsonb, lista=$7, ordem=$8, pipefy_campo=$9,
                      ativo = TRUE, atualizado_em = NOW() WHERE id = $10`, [...vals, c.id]);
            if (r.rowCount) idPorUid[c.uid] = c.id;
            if (r.rowCount) continue;
          }
          const ins = await cli.query(
            `INSERT INTO ${TF} (coluna, tipo, rotulo, descricao, obrigatorio, opcoes, lista, ordem, pipefy_campo) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) RETURNING id`, vals);
          idPorUid[c.uid] = ins.rows[0]?.id;
        }
        // Condições ("obrigatório só quando"): o outro campo pelo id gravado
        for (const c of camposOk) {
          const id = idPorUid[c.uid] || c.id;
          if (!id) continue;
          const ref = c.condicao ? (idPorUid[c.condicao.campo] || Number(String(c.condicao.campo).replace(/^id_/, '')) || null) : null;
          await cli.query(`UPDATE ${TF} SET condicao = $1::jsonb WHERE id = $2`,
            [ref && ref !== id ? JSON.stringify({ campo: ref, valor: c.condicao.valor }) : null, id]);
        }
      });
      cache = null;
      res.json({ sucesso: true, ...(await ler()) });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ erro: err.message });
      next(err);
    }
  }

  return { ler, verConfig, salvarConfig, idCampoConfig, invalidar: () => { cache = null; } };
}
