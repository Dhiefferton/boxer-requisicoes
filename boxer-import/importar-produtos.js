// importar-produtos.js
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

const produtos = JSON.parse(readFileSync('./produtos.json', 'utf-8'));

async function main() {
  await client.connect();
  console.log('✅ Conectado ao banco!');

  console.log('🗑️  Limpando tabelas...');
  await client.query('DELETE FROM itens_requisicao');
  await client.query('DELETE FROM requisicoes');
  await client.query('DELETE FROM estoques');
  await client.query('DELETE FROM materiais');
  console.log('✅ Tabelas limpas!');

  console.log(`📦 Inserindo ${produtos.length} produtos...`);
  let inseridos = 0;

  for (const p of produtos) {
    await client.query(
      `INSERT INTO materiais (codigo, descricao, categoria_id, unidade, ativo)
       VALUES ($1, $2, $3, 'UN', true)
       ON CONFLICT (codigo) DO NOTHING`,
      [p.codigo, p.descricao, p.categoria_id]
    );
    inseridos++;
    if (inseridos % 100 === 0) process.stdout.write(`\r  Progresso: ${inseridos}/${produtos.length}`);
  }
  console.log(`\n✅ ${inseridos} materiais inseridos!`);

  console.log('📊 Criando registros de estoque...');
  await client.query(`
    INSERT INTO estoques (material_id, quantidade, nivel_minimo)
    SELECT id, 0, 0 FROM materiais
  `);

  console.log('💰 Atualizando saldos...');
  const comSaldo = produtos.filter(p => p.quantidade > 0);
  let atualizados = 0;

  for (const p of comSaldo) {
    await client.query(
      `UPDATE estoques e SET quantidade = $1
       FROM materiais m
       WHERE e.material_id = m.id AND m.codigo = $2`,
      [p.quantidade, p.codigo]
    );
    atualizados++;
    if (atualizados % 100 === 0) process.stdout.write(`\r  Saldos: ${atualizados}/${comSaldo.length}`);
  }
  console.log(`\n✅ ${atualizados} saldos atualizados!`);

  const result = await client.query(`
    SELECT c.nome, COUNT(*) as total
    FROM materiais m
    JOIN categorias c ON c.id = m.categoria_id
    GROUP BY c.nome ORDER BY c.nome
  `);

  console.log('\n📋 Resultado final:');
  result.rows.forEach(r => console.log(`  ${r.nome}: ${r.total}`));

  const total = await client.query('SELECT COUNT(*) FROM materiais');
  console.log(`\n🎉 Total: ${total.rows[0].count} produtos no banco!`);

  await client.end();
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  client.end();
});
