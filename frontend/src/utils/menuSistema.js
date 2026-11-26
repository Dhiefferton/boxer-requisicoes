// ============================================================
// utils/menuSistema.js — telas do sistema por grupo (Início e sidebar nova)
// ============================================================
import {
  Wrench, ShoppingBag, ShieldCheck, Boxes, ClipboardList, History, LayoutDashboard, PackageOpen, Warehouse,
  Truck, BarChart3, ShoppingCart, Puzzle, Database, Video, Radar, Users, Fuel, FileText, UserCog, Settings,
  Gauge, ListChecks, RefreshCcw, PackageCheck, ScanLine, Smartphone, CarFront, CalendarDays, Route, ClipboardCheck, Calculator,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Kanban } from 'lucide-react';
import { useTelas } from './nomesTelas';
import { veTela } from './telas';
import { MODULOS, enderecoDe } from './modulos';
import { construtorService } from '../services/api';

export const ICONES_MODULO = { painel: Gauge, pedidos: ListChecks, reposicao: RefreshCcw, historico: History, separacao: ScanLine, conferencia: PackageCheck, coletor: Smartphone, frotas: CarFront, agenda: CalendarDays, viagens: Route, checklist: ClipboardCheck, custo: Calculator, operacoes: Radar, motoristas: Users, combustivel: Fuel, manutencao: Wrench, documentos: FileText, relatorios: BarChart3, usuarios: UserCog, configuracoes: Settings, motorista: Truck };
// Busca de telas: ignora maiúsculas e acentos
export const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();


// Telas do sistema, por grupo (ordem da tela inicial). As telas criadas entram depois da Garantia.
// Admin e Integrações ficam na barra superior.
export const SISTEMA = [
  { chave: 'orcamentos', grupo: 'logistica', rota: '/pedidos-orcamento', nome: 'Orçamentos', icon: Wrench, cor: '#4f46e5', conta: true },
  { chave: 'lojinha', grupo: 'logistica', rota: '/lojinha', nome: 'Lojinha Boxer', icon: ShoppingBag, cor: '#9333ea', conta: true },
  { chave: 'logistica_cif', grupo: 'logistica', rota: '/logistica-cif', nome: 'Garantia - Boxer Soldas', icon: ShieldCheck, cor: '#0284c7', conta: true },
  { quadros: true, grupo: 'logistica' },
  { chave: 'databases', grupo: 'logistica', rota: '/databases', nome: 'Databases', icon: Database, cor: '#0369a1', desc: 'Bases de registros' },
  { chave: 'armazenamento', grupo: 'logistica', rota: '/armazenamento', nome: 'Armazenamento', icon: Video, cor: '#4b5563', desc: 'Vídeos e arquivos' },
  { chave: 'relatorios', grupo: 'logistica', rota: '/relatorios', nome: 'Relatórios', icon: BarChart3, cor: '#0ea5e9', desc: 'Histórico do Pipefy' },
  { chave: 'painel', grupo: 'logistica', rota: '/painel-logistico', nome: 'Painel Logístico', icon: Gauge, cor: '#0f766e', desc: 'Indicadores e gestão' },
  { chave: 'inventario', grupo: 'almoxarifado', rota: '/inventario', nome: 'Inventário', icon: Boxes, cor: '#d97706', desc: 'Contagens de estoque' },
  { chave: 'catalogo', grupo: 'almoxarifado', rota: '/catalogo', nome: 'Catálogo / Requisição', icon: ClipboardList, cor: '#475569', desc: 'Requisição de materiais' },
  { chave: 'historico', grupo: 'almoxarifado', rota: '/historico', nome: 'Histórico', icon: History, cor: '#64748b', desc: 'Requisições feitas' },
  { chave: 'operador', grupo: 'almoxarifado', rota: '/operador', nome: 'Operador', icon: LayoutDashboard, cor: '#2563eb', desc: 'Separação das requisições' },
  { chave: 'entradas', grupo: 'almoxarifado', rota: '/entradas', nome: 'Entradas', icon: PackageOpen, cor: '#0d9488', desc: 'Notas de entrada' },
  { chave: 'estoque', grupo: 'almoxarifado', rota: '/estoque', nome: 'Estoque', icon: Warehouse, cor: '#0891b2', desc: 'Saldo de estoque' },
  { chave: 'recebimento_importacao', grupo: 'almoxarifado', rota: '/recebimento-importacao', nome: 'Recebimento / Importação', icon: Truck, cor: '#7c3aed', desc: 'Conferência de importação' },
  { chave: 'necessidade_pecas', grupo: 'almoxarifado', rota: '/necessidade-pecas', nome: 'Necessidade de Peças', icon: Puzzle, cor: '#dc2626', desc: 'Peças a comprar' },
  { chave: 'compras', grupo: 'almoxarifado', rota: '/compras', nome: 'Compras', icon: ShoppingCart, cor: '#ca8a04', desc: 'Pedidos de compra' },
  { chave: 'mrp', grupo: 'almoxarifado', rota: '/mrp', nome: 'MRP', icon: BarChart3, cor: '#be185d', desc: 'Planejamento' },
];
export const GRUPOS = [
  { chave: 'logistica', nome: 'Logística / Manutenção', resumo: 'orçamentos, lojinha, garantia, notas de serviços, tratativa' },
  { chave: 'almoxarifado', nome: 'Almoxarifado', resumo: 'inventário, requisições, estoque, compras' },
];
export const COR_PADRAO = '#2563eb'; // WMS / Frotas e o que vier sem cor
// Cores dos cards do Armazém (WMS) e do Frotas (mesma paleta das telas do sistema)
export const CORES_MODULO = {
  wms_painel: '#2563eb', wms_pedidos: '#4f46e5', wms_reposicao: '#d97706', wms_historico: '#64748b',
  wms_separacao: '#9333ea', wms_conferencia: '#0d9488', wms_coletor: '#475569',
  frotas_painel: '#0284c7', frotas_agenda: '#7c3aed', frotas_viagens: '#059669', frotas_operacoes: '#dc2626',
  frotas_veiculos: '#2563eb', frotas_motoristas: '#0891b2', frotas_combustivel: '#ca8a04', frotas_custo: '#be185d',
  frotas_manutencao: '#ea580c', frotas_documentos: '#0369a1', frotas_checklist: '#16a34a', frotas_relatorios: '#0ea5e9',
  frotas_motorista: '#9333ea',
};
export const CORES_QUADROS = ['#059669', '#0d9488', '#7c3aed', '#e11d48', '#2563eb', '#ca8a04', '#9333ea', '#0891b2'];


// ── Grupos prontos para o menu (mesma regra do Início) ─────────────

export function useGruposMenu(usuario) {
  const { nomes, quadros } = useTelas();
  return useMemo(() => {
    const blocos = SISTEMA.flatMap(t => (t.quadros
      ? (quadros || []).filter(q => q.ativo !== false).map((q, i) => ({ grupo: t.grupo, chave: `quadro_${q.id}`, rota: `/quadro/${q.id}`, nome: q.nome, icon: Kanban, cor: CORES_QUADROS[i % CORES_QUADROS.length], conta: true }))
      : [{ ...t, nome: nomes?.[t.chave] || t.nome }]))
      .map(t => ({ ...t, liberada: veTela(usuario, t.chave) }));
    const modulos = MODULOS.map(m => ({
      ...m,
      itens: m.itens.filter(i => m.chave === 'frotas' || enderecoDe(i)).map(i => ({
        ...i, externo: m.chave === 'frotas' ? null : enderecoDe(i),
        rota: m.chave === 'frotas' ? (i.caminho === '/' ? '/frotas' : `/frotas${i.caminho}`) : undefined,
        icon: ICONES_MODULO[i.icone] || LayoutDashboard, cor: i.cor || CORES_MODULO[i.chave], liberada: veTela(usuario, m.chave),
      })),
    })).filter(m => m.itens.length);
    return [...GRUPOS.map(g => ({ ...g, itens: blocos.filter(b => b.grupo === g.chave) })), ...modulos];
  }, [usuario, nomes, quadros]);
}

// Sidebar nova (em teste): só o dono vê, mesmo critério do Início novo / Construtor beta.
let _dono = null;
export function useSidebarNova() {
  const [dono, setDono] = useState(_dono === true);
  useEffect(() => {
    let vivo = true;
    if (_dono === null) _dono = construtorService.status().then(r => !!r.data?.dono).catch(() => false);
    Promise.resolve(_dono).then(v => { _dono = v; if (vivo) setDono(v === true); });
    return () => { vivo = false; };
  }, []);
  return dono;
}
