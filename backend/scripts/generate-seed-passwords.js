// ============================================================
// scripts/generate-seed-passwords.js
// ============================================================
// Gera os hashes bcrypt para as senhas do seed de desenvolvimento.
// Execute com: npm run generate-hash
//
// Ele vai imprimir o SQL atualizado com os hashes reais.
// Cole o resultado no arquivo seeds/001_dados_iniciais.sql
// ============================================================

import bcrypt from 'bcryptjs';

const usuarios = [
  { email: 'admin@boxer.com.br',       senha: 'boxer@2025', perfil: 'admin' },
  { email: 'operador@boxer.com.br',    senha: 'boxer@2025', perfil: 'operador' },
  { email: 'colaborador@boxer.com.br', senha: 'boxer@2025', perfil: 'colaborador' },
];

console.log('\n=== Hashes gerados para o seed ===\n');

for (const u of usuarios) {
  const hash = await bcrypt.hash(u.senha, 10);
  console.log(`-- ${u.perfil}: ${u.email}`);
  console.log(`-- Senha: ${u.senha}`);
  console.log(`-- Hash: ${hash}`);
  console.log('');
}

console.log('=== Substitua os hashes no arquivo seeds/001_dados_iniciais.sql ===\n');
