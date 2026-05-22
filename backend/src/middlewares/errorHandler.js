// ============================================================
// middlewares/errorHandler.js — Tratamento Central de Erros
// ============================================================
// Captura todos os erros que os controllers jogam com next(err).
// Centraliza a resposta de erro para o frontend ter um formato
// consistente sempre.
// ============================================================

export function errorHandler(err, req, res, next) {
  // Erros de validação Zod
  if (err.name === 'ZodError') {
    const mensagens = err.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    return res.status(400).json({
      erro: 'Dados inválidos',
      detalhes: mensagens
    });
  }

  // Erro de unicidade do PostgreSQL (email duplicado, código duplicado etc.)
  if (err.code === '23505') {
    return res.status(409).json({
      erro: 'Registro já existe. Verifique os dados e tente novamente.'
    });
  }

  // Erro de chave estrangeira (ex: tentar deletar categoria que tem materiais)
  if (err.code === '23503') {
    return res.status(409).json({
      erro: 'Não é possível realizar esta operação pois existem registros relacionados.'
    });
  }

  // Log do erro real (apenas no servidor, nunca enviado ao cliente)
  console.error('Erro interno:', {
    message: err.message,
    stack:   process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url:     req.originalUrl,
    method:  req.method,
  });

  // Resposta genérica para o cliente (não expõe detalhes internos)
  res.status(err.status || 500).json({
    erro: process.env.NODE_ENV === 'development'
      ? err.message
      : 'Erro interno do servidor. Tente novamente.'
  });
}

// Rota não encontrada (404)
export function notFound(req, res) {
  res.status(404).json({ erro: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
}
