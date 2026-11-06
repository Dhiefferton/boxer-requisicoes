// ============================================================
// utils/perfilAtual.js — Perfil do usuário logado, para regras que não estão num componente
// ============================================================
// "Pode mover cards desta coluna para": o admin tem a lista dele (destinos_admin) e os
// colaboradores a deles (destinos). destinos_admin: null = igual aos colaboradores,
// 'todas' = todas as colunas, lista = só as marcadas.
// ============================================================
let perfil = null;
export function definirPerfilAtual(p) { perfil = p || null; }
function perfilAgora() {
  if (perfil) return perfil;
  try { return JSON.parse(localStorage.getItem('boxer_usuario') || 'null')?.perfil || null; } catch { return null; }
}
export const ehAdminAtual = () => perfilAgora() === 'admin';
/** Lista de colunas para onde o usuário logado pode mover (null = todas). */
export function destinosDoPerfil(c) {
  const colab = Array.isArray(c?.destinos) ? c.destinos : null;
  if (!ehAdminAtual()) return colab;
  if (c?.destinos_admin === 'todas') return null;
  return Array.isArray(c?.destinos_admin) ? c.destinos_admin : colab;
}
