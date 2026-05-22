# Boxer Requisições — Guia Completo de Instalação e Deploy

Este guia cobre dois cenários:
- **Parte 1 — Rodar localmente** para testar na sua máquina
- **Parte 2 — Deploy em produção** para disponibilizar para os 70 colaboradores

---

## Parte 1 — Rodando localmente

### O que você precisa instalar antes

| Ferramenta | Para que serve | Como verificar se já tem |
|---|---|---|
| Node.js 18+ | Rodar o backend e o frontend | `node --version` |
| PostgreSQL 14+ | Banco de dados | `psql --version` |
| npm | Gerenciador de pacotes (vem com Node.js) | `npm --version` |

Se não tiver, instale:
- **Node.js**: https://nodejs.org (baixe a versão LTS)
- **PostgreSQL**: https://www.postgresql.org/download

---

### Passo 1 — Criar o banco de dados

Abra o terminal e conecte ao PostgreSQL:

```bash
psql -U postgres
```

Dentro do psql, execute:

```sql
CREATE DATABASE boxer_requisicoes;
\q
```

Agora execute as migrations **em ordem**:

```bash
psql -U postgres -d boxer_requisicoes -f database/migrations/001_departamentos_usuarios.sql
psql -U postgres -d boxer_requisicoes -f database/migrations/002_catalogo_materiais.sql
psql -U postgres -d boxer_requisicoes -f database/migrations/003_requisicoes.sql
psql -U postgres -d boxer_requisicoes -f database/migrations/004_logs.sql
psql -U postgres -d boxer_requisicoes -f database/COMO_EXECUTAR.sql
```

Verifique se deu certo:

```bash
psql -U postgres -d boxer_requisicoes -c "\dt"
```

Deve listar 9 tabelas: categorias, departamentos, estoques, historico_status, itens_requisicao, logs, materiais, requisicoes, usuarios.

---

### Passo 2 — Gerar as senhas do seed e popular o banco

```bash
cd backend
npm install
npm run generate-hash
```

O comando vai imprimir 3 hashes bcrypt no terminal. Copie-os e substitua os placeholders no arquivo `database/seeds/001_dados_iniciais.sql`:

Encontre as linhas com `$2b$10$YourHashHere...` e troque pelo hash correspondente a cada perfil.

Depois, popule o banco:

```bash
psql -U postgres -d boxer_requisicoes -f database/seeds/001_dados_iniciais.sql
```

---

### Passo 3 — Configurar o backend

```bash
cd backend
cp .env.example .env
```

Abra o arquivo `.env` e preencha:

```env
PORT=3001
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=boxer_requisicoes
DB_USER=postgres
DB_PASSWORD=SUA_SENHA_DO_POSTGRES_AQUI

# Gere uma chave com: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=cole_a_chave_gerada_aqui
JWT_EXPIRES_IN=8h

CORS_ORIGIN=http://localhost:5173
```

---

### Passo 4 — Subir o backend

```bash
cd backend
npm run dev
```

Você verá:
```
🚀 Boxer Requisições API
   Rodando em: http://localhost:3001
   Ambiente:   development
   Health:     http://localhost:3001/health
```

Teste no navegador: http://localhost:3001/health — deve retornar `{"status":"ok"}`.

---

### Passo 5 — Subir o frontend

Abra **um segundo terminal**:

```bash
cd frontend
npm install
npm run dev
```

Você verá:
```
  VITE v6.x.x  ready in XXX ms
  ➜  Local:   http://localhost:5173/
```

Acesse http://localhost:5173 no navegador.

---

### Passo 6 — Primeiro login

Use as credenciais do seed:

| E-mail | Senha | Perfil |
|---|---|---|
| admin@boxer.com.br | boxer@2025 | Administrador |
| operador@boxer.com.br | boxer@2025 | Operador |
| colaborador@boxer.com.br | boxer@2025 | Colaborador |

> **Importante:** Troque as senhas logo após o primeiro login em produção.

---

### Checklist de teste local

Antes de subir para produção, teste esses cenários:

- [ ] Login com cada um dos 3 perfis
- [ ] Catálogo carrega com os 48 materiais do seed
- [ ] Busca por texto funciona (ex: "papel")
- [ ] Filtro por categoria funciona
- [ ] Botão "Adicionar" mostra feedback "Adicionado!"
- [ ] Badge no carrinho aparece com a contagem
- [ ] Drawer do carrinho abre (mobile e desktop)
- [ ] +/- no carrinho ajusta a quantidade
- [ ] Tela de revisão mostra todos os dados
- [ ] Envio cria a requisição e mostra tela de sucesso
- [ ] Histórico mostra a requisição enviada
- [ ] Expansão do histórico mostra os itens
- [ ] Painel do operador (login como operador) mostra a requisição
- [ ] Mudar status para "em separação" funciona
- [ ] Modal de confirmação aparece antes de mudar status
- [ ] Painel admin (login como admin) lista os usuários
- [ ] Edição de estoque salva corretamente

---

## Parte 2 — Deploy em Produção

### Onde hospedar (opções recomendadas)

Para um sistema interno com 70 usuários, estas opções funcionam bem e têm plano gratuito ou barato:

| Opção | Custo | Complexidade | Recomendado para |
|---|---|---|---|
| **Railway** | ~$5/mês | Baixa ⭐ | Primeira vez, tudo em um lugar |
| **Render** | Grátis (com limitações) / $7/mês | Baixa ⭐ | Custo zero para começar |
| **VPS própria** (Hostinger, DigitalOcean) | ~R$40-80/mês | Média | Controle total |

**Recomendação para a Boxer:** Railway — sobe banco + backend + frontend em menos de 1 hora.

---

### Opção A — Deploy no Railway (mais simples)

#### 1. Criar conta
Acesse https://railway.app e crie uma conta com GitHub.

#### 2. Criar o banco PostgreSQL no Railway

No dashboard do Railway:
1. Clique em **New Project**
2. Selecione **Add a service → Database → PostgreSQL**
3. O Railway cria o banco automaticamente
4. Clique no banco criado → aba **Connect** → copie a **Connection URL**

A URL terá este formato:
```
postgresql://postgres:senha@containers-xxx.railway.app:5432/railway
```

#### 3. Executar as migrations no banco do Railway

Substitua `URL_COPIADA` pela connection URL:

```bash
psql "URL_COPIADA" -f database/migrations/001_departamentos_usuarios.sql
psql "URL_COPIADA" -f database/migrations/002_catalogo_materiais.sql
psql "URL_COPIADA" -f database/migrations/003_requisicoes.sql
psql "URL_COPIADA" -f database/migrations/004_logs.sql
psql "URL_COPIADA" -f database/COMO_EXECUTAR.sql
```

Gere os hashes e popule o seed:
```bash
cd backend && npm run generate-hash
# Cole os hashes no seed, depois:
psql "URL_COPIADA" -f database/seeds/001_dados_iniciais.sql
```

#### 4. Deploy do backend no Railway

1. No Railway, clique em **New Service → GitHub Repo**
2. Selecione o repositório do projeto
3. Na configuração do serviço, defina **Root Directory** como `backend`
4. Adicione as variáveis de ambiente (aba **Variables**):

```
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://... (a mesma URL copiada do banco)
JWT_SECRET=gere_uma_chave_longa_aqui
JWT_EXPIRES_IN=8h
CORS_ORIGIN=https://SEU-FRONTEND.up.railway.app
```

> Para gerar JWT_SECRET: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

5. O Railway detecta o `package.json` e faz o deploy automaticamente
6. Anote a URL gerada (ex: `https://boxer-backend.up.railway.app`)

#### 5. Ajuste necessário no backend para Railway

O Railway injeta `DATABASE_URL` como uma variável de ambiente única. Atualize o `backend/src/config/db.js` para suportar os dois formatos:

```javascript
// No início do arquivo db.js, substitua o bloco do Pool por:
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }, // necessário no Railway
      }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME     || 'boxer_requisicoes',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      }
);
```

#### 6. Deploy do frontend no Railway

1. Novo serviço → GitHub Repo → mesmo repositório
2. **Root Directory**: `frontend`
3. **Build Command**: `npm run build`
4. **Start Command**: `npx serve dist -p 3000`
5. Adicione a variável:

```
VITE_API_URL=https://boxer-backend.up.railway.app
```

6. Atualize o `frontend/vite.config.js` para usar a variável em produção:

```javascript
server: {
  proxy: {
    '/api': {
      target: process.env.VITE_API_URL || 'http://localhost:3001',
      changeOrigin: true,
    }
  }
}
```

> **Atenção:** Em produção o proxy do Vite não é usado (o Vite só serve o build estático). A URL do backend precisa ser configurada diretamente no `frontend/src/services/api.js`:

```javascript
// Substitua a linha baseURL no api.js:
baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
```

---

### Opção B — VPS própria (controle total)

Use se a empresa já tem servidor ou quer mais controle.

#### 1. Instalar dependências no servidor

```bash
# Conecte via SSH ao servidor
ssh usuario@ip-do-servidor

# Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# PM2 (mantém o Node rodando em background)
sudo npm install -g pm2

# Nginx (serve o frontend e faz proxy do backend)
sudo apt install -y nginx
```

#### 2. Banco de dados no servidor

```bash
sudo -u postgres psql -c "CREATE DATABASE boxer_requisicoes;"
sudo -u postgres psql -c "CREATE USER boxer_user WITH PASSWORD 'senha_forte_aqui';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE boxer_requisicoes TO boxer_user;"
```

Execute as migrations:
```bash
psql -U boxer_user -d boxer_requisicoes -h localhost -f migrations/001_departamentos_usuarios.sql
# ... repita para 002, 003, 004 e COMO_EXECUTAR.sql
```

#### 3. Subir o backend com PM2

```bash
cd /var/www/boxer/backend
cp .env.example .env
# Edite o .env com os dados de produção

npm install --production
pm2 start src/server.js --name boxer-backend
pm2 save          # salva para reiniciar com o servidor
pm2 startup       # configura para iniciar no boot
```

Comandos úteis do PM2:
```bash
pm2 status        # ver se está rodando
pm2 logs boxer-backend  # ver logs em tempo real
pm2 restart boxer-backend  # reiniciar após mudanças
```

#### 4. Build e deploy do frontend

```bash
cd /var/www/boxer/frontend
npm install
npm run build
# Os arquivos estáticos ficam em dist/
```

#### 5. Configurar o Nginx

Crie o arquivo `/etc/nginx/sites-available/boxer`:

```nginx
server {
    listen 80;
    server_name SEU_DOMINIO_OU_IP;

    # Frontend (arquivos estáticos do React)
    root /var/www/boxer/frontend/dist;
    index index.html;

    # Redireciona todas as rotas do React para index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy para o backend Node.js
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Ative e reinicie:
```bash
sudo ln -s /etc/nginx/sites-available/boxer /etc/nginx/sites-enabled/
sudo nginx -t          # testa a configuração
sudo systemctl restart nginx
```

#### 6. HTTPS com certificado gratuito (Let's Encrypt)

Só funciona se você tiver um domínio apontando para o servidor:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seudominio.com.br
```

O Certbot configura o HTTPS automaticamente e renova o certificado.

---

## Parte 3 — Manutenção e operação

### Como atualizar o sistema após mudanças

```bash
# No servidor VPS:
cd /var/www/boxer

# Atualizar o código (se usar Git)
git pull origin main

# Backend: reinstalar dependências se tiver mudado
cd backend && npm install --production
pm2 restart boxer-backend

# Frontend: rebuild
cd ../frontend && npm run build
# Nginx serve automaticamente os novos arquivos
```

### Como fazer backup do banco

```bash
# Criar backup
pg_dump -U postgres boxer_requisicoes > backup_$(date +%Y%m%d).sql

# Restaurar backup
psql -U postgres -d boxer_requisicoes < backup_20250101.sql
```

Configure um cron para backup automático diário:
```bash
crontab -e
# Adicione esta linha (backup todo dia às 2h da manhã):
0 2 * * * pg_dump -U postgres boxer_requisicoes > /backups/boxer_$(date +\%Y\%m\%d).sql
```

### Como ver os logs em produção

```bash
# Backend (PM2):
pm2 logs boxer-backend --lines 100

# Nginx:
sudo tail -f /var/log/nginx/error.log

# PostgreSQL:
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### Como adicionar um novo colaborador

1. Acesse o sistema como admin
2. Vá em **Painel Admin → Usuários → Novo usuário**
3. Preencha nome, e-mail, senha inicial e departamento
4. O colaborador faz login e troca a senha

### Como adicionar novo material ao catálogo

Via painel admin (Estoque), você pode atualizar quantidades. Para adicionar novos materiais ou categorias, use SQL diretamente:

```sql
-- Adicionar novo material
INSERT INTO materiais (codigo, descricao, categoria_id, unidade)
VALUES ('PAP-015', 'Caixa de clipes', 1, 'cx');

-- Criar o estoque do material
INSERT INTO estoques (material_id, quantidade, nivel_minimo)
VALUES (currval('materiais_id_seq'), 10, 2);
```

---

## Parte 4 — Rollback de emergência

### Rollback do código (backend ou frontend)

```bash
# Se algo der errado após um deploy, volta para a versão anterior:

# Com Git:
git log --oneline -5   # vê os commits recentes
git checkout HASH_DO_COMMIT_ANTERIOR

# Reinicia o backend:
pm2 restart boxer-backend

# Rebuild do frontend:
cd frontend && npm run build
```

### Rollback do banco (reversão de migration)

As migrations não têm scripts de rollback automático. Para reverter:

```bash
# Conecte ao banco
psql -U postgres -d boxer_requisicoes

-- Se precisar desfazer a migration 004 (logs):
DROP TABLE logs;

-- Se precisar desfazer a 003 (requisições):
DROP TABLE historico_status;
DROP TABLE itens_requisicao;
DROP TABLE requisicoes;

-- Nunca delete usuarios, departamentos, categorias ou materiais
-- sem ter backup — esses dados são difíceis de recuperar
```

> **Regra de ouro:** Sempre faça backup antes de qualquer mudança no banco em produção.

---

## Resumo das portas e URLs

| Serviço | Ambiente local | Produção |
|---|---|---|
| Frontend | http://localhost:5173 | https://seudominio.com.br |
| Backend API | http://localhost:3001/api | https://seudominio.com.br/api |
| Health check | http://localhost:3001/health | https://seudominio.com.br/health |
| Banco PostgreSQL | localhost:5432 | interno ao servidor |
