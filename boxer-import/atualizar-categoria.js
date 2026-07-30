// atualizar-categoria.js
// Muda a categoria dos produtos da planilha para Partes e Peças
// Execute: node atualizar-categoria.js

import pg from 'pg';
import { readFileSync } from 'fs';

const { Client } = pg;

const client = new Client({
  host:     'kodama.proxy.rlwy.net',
  port:     55892,
  database: 'railway',
  user:     'postgres',
  password: 'IybhaAnKFzqHXdpvkBsxHciulALmCoFv',
  ssl:      { rejectUnauthorized: false },
});

const codigos = JSON.parse(readFileSync('./codigos_partes_pecas.json', 'utf-8'));

async function main() {
  await client.connect();
  console.log('✅ Conectado ao banco!');

  // Busca o ID da categoria Partes e Peças
  const catResult = await client.query(
    `SELECT id FROM categorias WHERE nome = 'Partes e Peças'`
  );
  const categoriaId = catResult.rows[0]?.id;
  console.log(`📦 Categoria "Partes e Peças" ID: ${categoriaId}`);

  // Verifica distribuição atual
  const distResult = await client.query(`
    SELECT c.nome, COUNT(*) as total
    FROM materiais m
    JOIN categorias c ON c.id = m.categoria_id
    WHERE m.codigo = ANY($1)
    GROUP BY c.nome ORDER BY total DESC
  `, [codigos]);

  console.log('\n📊 Distribuição atual dos produtos:');
  distResult.rows.forEach(r => console.log(`  ${r.nome}: ${r.total}`));

  // Atualiza todos para Partes e Peças
  console.log('\n🔄 Atualizando categorias...');
  const result = await client.query(
    `UPDATE materiais SET categoria_id = $1
     WHERE codigo = ANY($2)`,
    [categoriaId, codigos]
  );

  console.log(`\n✅ ${result.rowCount} produtos atualizados para "Partes e Peças"!`);

  // Verifica resultado
  const check = await client.query(`
    SELECT COUNT(*) FROM materiais
    WHERE codigo = ANY($1) AND categoria_id = $2
  `, [codigos, categoriaId]);

  console.log(`✅ Confirmado: ${check.rows[0].count} produtos agora em "Partes e Peças"`);

  await client.end();
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  client.end();
});
