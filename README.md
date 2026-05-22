# Boxer Requisições

Sistema web interno de requisição de materiais da Boxer.

---

## O que é este sistema

Uma plataforma simples, rápida e mobile-first para que os colaboradores da Boxer solicitem materiais internamente, sem papel, sem e-mail, sem planilha.

O fluxo completo: o colaborador escolhe materiais num catálogo estilo e-commerce, monta um carrinho, revisa o pedido e confirma. O operador recebe no painel, processa e atualiza o status. O colaborador acompanha em tempo real no histórico.

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Banco de dados | PostgreSQL |
| Autenticação | JWT (JSON Web Tokens) |
| Validação | Zod |
| HTTP client | Axios |
| Ícones | Lucide React |

---

## Estrutura do projeto

```
boxer-requisicoes/
│
├── database/
│   ├── migrations/              # Scripts SQL numerados (executar em ordem)
│   │   ├── 001_departamentos_usuarios.sql
│   │   ├── 002_catalogo_materiais.sql
│   │   ├── 003_requisicoes.sql
│   │   └── 004_logs.sql
│   ├── seeds/
│   │   └── 001_dados_iniciais.sql   # Dados de exemplo para desenvolvimento
│   └── COMO_EXECUTAR.sql            # Views e instruções de execução
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js                # Pool de conexões PostgreSQL
│   │   ├── controllers/
│   │   │   ├── authController.js    # Login e autenticação
│   │   │   ├── materiaisController.js  # Catálogo e estoque
│   │   │   ├── requisicoesController.js # Requisições e status
│   │   │   └── usuariosController.js   # Gestão de usuários (admin)
│   │   ├── middlewares/
│   │   │   ├── auth.js              # Verificação JWT e controle de perfil
│   │   │   └── errorHandler.js      # Tratamento centralizado de erros
│   │   ├── integrations/
│   │   │   ├── erpZen.js            # Stub preparado para ERP Zen
│   │   │   └── pipefy.js            # Stub preparado para Pipefy
│   │   ├── routes/
│   │   │   └── index.js             # Todas as 13 rotas da API
│   │   └── server.js                # Ponto de entrada do servidor
│   ├── scripts/
│   │   └── generate-seed-passwords.js  # Gera hashes bcrypt para o seed
│   ├── .env.example                 # Variáveis de ambiente (desenvolvimento)
│   ├── .env.production.example      # Variáveis de ambiente (produção)
│   └── package.json
│
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── ui/index.jsx         # Button, Badge, Input, Spinner, Card, Empty
│       │   ├── layout/AppLayout.jsx # Header + nav adaptada ao perfil
│       │   ├── cart/CartDrawer.jsx  # Carrinho drawer (mobile + desktop)
│       │   ├── catalog/MaterialCard.jsx  # Card do catálogo com feedback
│       │   └── operador/RequisicaoCard.jsx  # Card do painel operador
│       ├── context/
│       │   ├── AuthContext.jsx      # Estado global de autenticação
│       │   └── CartContext.jsx      # Estado global do carrinho
│       ├── hooks/
│       │   └── useRequisicoes.js    # Hook para carregar e atualizar requisições
│       ├── pages/
│       │   ├── Login.jsx
│       │   ├── Catalogo.jsx         # Busca, filtros, grid de materiais
│       │   ├── Revisao.jsx          # Revisão e confirmação do pedido
│       │   ├── Historico.jsx        # Histórico com expansão e status
│       │   └── operador/
│       │       ├── PainelOperador.jsx  # Kanban + lista de requisições
│       │       └── PainelAdmin.jsx     # Usuários e estoque
│       ├── services/
│       │   └── api.js               # Axios centralizado + todos os endpoints
│       └── App.jsx                  # Roteamento com proteção por perfil
│
├── docs/
│   └── GUIA_DEPLOY.md              # Guia completo de instalação e deploy
│
└── setup-local.sh                  # Script de configuração automática
```

---

## Instalação rápida (desenvolvimento)

### Opção 1 — Script automático

```bash
bash setup-local.sh
```

O script instala dependências, cria o banco, executa as migrations e popula os dados de exemplo.

### Opção 2 — Manual

**1. Banco de dados**
```bash
psql -U postgres -c "CREATE DATABASE boxer_requisicoes;"
psql -U postgres -d boxer_requisicoes -f database/migrations/001_departamentos_usuarios.sql
psql -U postgres -d boxer_requisicoes -f database/migrations/002_catalogo_materiais.sql
psql -U postgres -d boxer_requisicoes -f database/migrations/003_requisicoes.sql
psql -U postgres -d boxer_requisicoes -f database/migrations/004_logs.sql
psql -U postgres -d boxer_requisicoes -f database/COMO_EXECUTAR.sql
```

**2. Backend**
```bash
cd backend
cp .env.example .env        # edite com sua senha do PostgreSQL
npm install
npm run generate-hash       # gere os hashes e cole no seed
psql -U postgres -d boxer_requisicoes -f ../database/seeds/001_dados_iniciais.sql
npm run dev                 # http://localhost:3001
```

**3. Frontend**
```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

---

## Usuários de teste

| E-mail | Senha | Perfil | Acesso |
|---|---|---|---|
| admin@boxer.com.br | boxer@2025 | Admin | Tudo |
| operador@boxer.com.br | boxer@2025 | Operador | Catálogo + Histórico + Painel Operador |
| colaborador@boxer.com.br | boxer@2025 | Colaborador | Catálogo + Carrinho + Histórico |

> Troque as senhas no primeiro acesso em produção via Painel Admin.

---

## Rotas da API

| Método | Rota | Perfil | Descrição |
|---|---|---|---|
| POST | /api/auth/login | Público | Login, retorna JWT |
| GET | /api/auth/me | Todos | Dados do usuário logado |
| GET | /api/materiais | Todos | Lista materiais (busca + filtro) |
| GET | /api/materiais/:id | Todos | Detalhe do material |
| GET | /api/categorias | Todos | Lista categorias |
| POST | /api/materiais | Admin | Cria material |
| PATCH | /api/materiais/:id/estoque | Operador/Admin | Atualiza estoque |
| POST | /api/requisicoes | Todos | Cria requisição |
| GET | /api/requisicoes | Todos | Lista (colaborador = só as suas) |
| GET | /api/requisicoes/:id | Todos | Detalhe com itens e histórico |
| PATCH | /api/requisicoes/:id/status | Operador/Admin | Muda status |
| GET | /api/admin/usuarios | Admin | Lista usuários |
| POST | /api/admin/usuarios | Admin | Cria usuário |
| PATCH | /api/admin/usuarios/:id | Admin | Atualiza usuário |
| GET | /api/admin/departamentos | Todos | Lista departamentos |

---

## Status do ciclo de uma requisição

```
solicitado → em_separacao → separado → entregue
     ↓              ↓
  cancelado      cancelado
```

Cada mudança de status é registrada em `historico_status` com data, responsável e observação.

---

## Banco de dados — tabelas

| Tabela | Descrição |
|---|---|
| usuarios | Colaboradores com perfil, departamento e hash de senha |
| departamentos | Departamentos da empresa |
| categorias | Categorias do catálogo (Papelaria, Informática…) |
| materiais | Itens disponíveis para requisição |
| estoques | Quantidade e nível mínimo por material |
| requisicoes | Cabeçalho de cada pedido |
| itens_requisicao | Materiais de cada requisição (com snapshots) |
| historico_status | Log imutável de mudanças de status |
| logs | Auditoria de todas as ações do sistema |

Além das tabelas, duas views facilitam as consultas:
- `vw_catalogo` — material + estoque + status visual calculado
- `vw_requisicoes` — requisição + nome do solicitante + total de itens

---

## Deploy em produção

Consulte o arquivo `docs/GUIA_DEPLOY.md` para instruções completas de:
- Deploy no Railway (recomendado — menos de 1 hora)
- Deploy em VPS com Nginx + PM2 + HTTPS
- Backup, rollback e manutenção

---

## Integrações futuras

O sistema está arquiteturalmente preparado para integrar:

**ERP Zen** (`backend/src/integrations/erpZen.js`)
Sincronização de estoque em tempo real. Ativar via variável de ambiente `ERP_ZEN_ATIVO=true`.

**Pipefy** (`backend/src/integrations/pipefy.js`)
Criação automática de cards no Pipefy ao submeter requisições. Ativar via `PIPEFY_ATIVO=true`.

Para implementar, apenas os arquivos de integração precisam ser editados — o restante do sistema não muda.

---

## Segurança

- Senhas armazenadas com hash bcrypt (custo 10)
- Autenticação via JWT com expiração configurável (padrão 8h)
- Rate limiting: 100 req/15min geral, 10 tentativas/15min no login
- Cabeçalhos HTTP de segurança via Helmet
- CORS restrito à URL do frontend
- Validação de entrada com Zod em todas as rotas de escrita
- Logs de auditoria de todas as ações relevantes
- Proteção de rotas por perfil no backend e no frontend

---

## Números do projeto

- **53 arquivos** criados
- **4.065 linhas de código** (1.026 backend · 2.436 frontend · 537 SQL · 66 scripts)
- **9 tabelas** no banco de dados
- **15 rotas** na API REST
- **5 telas** no frontend
- **3 perfis** de acesso
- **48 materiais** pré-cadastrados em 6 categorias
