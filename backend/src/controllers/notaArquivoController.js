// ============================================================
// controllers/notaArquivoController.js — XML e PDF (DANFE) da nota fiscal do Zen
// ============================================================
// GET .../:id/nf/xml | .../:id/nf/pdf — baixa o arquivo da nota de saída ligada ao
// card (Lojinha / Garantia: zen_nf_id; Orçamento: zen_nota_id). Só depois da nota
// autorizada (faturada) no Zen; antes disso responde 409. Só leitura no Zen.
// ============================================================
import { query } from '../config/db.js';
import { arquivoNotaZen } from '../integrations/zenPedidoVenda.js';

function arquivoNota(tabela, coluna) {
  return async (req, res) => {
    try {
      const tipo = req.params.tipo === 'xml' ? 'xml' : req.params.tipo === 'pdf' ? 'pdf' : null;
      if (!tipo) return res.status(400).json({ erro: 'Tipo inválido (xml ou pdf).' });
      const p = (await query(`SELECT ${coluna} AS nf FROM ${tabela} WHERE id = $1`, [parseInt(req.params.id)])).rows[0];
      if (!p) return res.status(404).json({ erro: 'Card não encontrado.' });
      if (!p.nf) return res.status(409).json({ erro: 'Este card ainda não tem nota fiscal no Zen.' });
      const a = await arquivoNotaZen(p.nf, tipo);
      res.setHeader('Content-Type', a.contentType);
      res.setHeader('Content-Disposition', `${tipo === 'pdf' ? 'inline' : 'attachment'}; filename="${a.nome}"`);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(a.buffer);
    } catch (e) { res.status(e.status || 502).json({ erro: e.message }); }
  };
}

export const arquivoNotaLojinha = arquivoNota('lojinha_boxer_pedidos', 'zen_nf_id');
export const arquivoNotaOrcamento = arquivoNota('pedidos_orcamento', 'zen_nota_id');
