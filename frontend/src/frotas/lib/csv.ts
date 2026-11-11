// Utilitário simples para exportar tabelas de dados como CSV (usado pela
// tela de Relatórios). Gera o arquivo no navegador via Blob, sem dependências.

export function paraCSV(linhas: (string | number)[][]): string {
  return linhas
    .map((linha) => linha.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n')
}

const BOM_UTF8 = '﻿' // garante acentuação correta ao abrir o CSV no Excel.

export function baixarCSV(nomeArquivo: string, linhas: (string | number)[][]) {
  const conteudo = paraCSV(linhas)
  const blob = new Blob([BOM_UTF8 + conteudo], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
