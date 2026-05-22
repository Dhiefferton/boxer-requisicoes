# Checklist de Entrega — Boxer Requisições
## Validação completa antes de ir ao ar

Use este checklist para garantir que tudo funciona antes de liberar para os 70 colaboradores.
Marque cada item conforme for testando.

---

## 1. Banco de dados

- [ ] Banco `boxer_requisicoes` criado
- [ ] Migration 001 executada sem erros (tabelas: usuarios, departamentos)
- [ ] Migration 002 executada sem erros (tabelas: categorias, materiais, estoques)
- [ ] Migration 003 executada sem erros (tabelas: requisicoes, itens_requisicao, historico_status)
- [ ] Migration 004 executada sem erros (tabela: logs)
- [ ] Views criadas: `vw_catalogo` e `vw_requisicoes`
- [ ] Seed carregado: 8 departamentos, 6 categorias, 48 materiais, 3 usuários
- [ ] Query de verificação: `SELECT COUNT(*) FROM materiais;` retorna 48

---

## 2. Backend

- [ ] `.env` criado com todos os valores preenchidos
- [ ] `npm run dev` sobe sem erros
- [ ] `/health` retorna `{"status":"ok"}`
- [ ] JWT_SECRET tem pelo menos 32 caracteres

**Teste de autenticação:**
- [ ] POST `/api/auth/login` com credenciais corretas retorna token e dados do usuário
- [ ] POST `/api/auth/login` com senha errada retorna 401
- [ ] GET `/api/auth/me` com token válido retorna usuário
- [ ] GET `/api/materiais` sem token retorna 401
- [ ] GET `/api/materiais` com token de colaborador retorna lista

**Teste de catálogo:**
- [ ] GET `/api/materiais` retorna 48 itens
- [ ] GET `/api/materiais?busca=papel` filtra corretamente
- [ ] GET `/api/materiais?categoria=1` filtra pela categoria
- [ ] GET `/api/categorias` retorna 6 categorias

**Teste de requisições:**
- [ ] POST `/api/requisicoes` cria requisição e retorna id
- [ ] GET `/api/requisicoes` com colaborador retorna apenas as suas
- [ ] GET `/api/requisicoes` com operador retorna todas
- [ ] GET `/api/requisicoes/:id` retorna itens e histórico
- [ ] PATCH `/api/requisicoes/:id/status` com colaborador retorna 403
- [ ] PATCH `/api/requisicoes/:id/status` com operador muda status

**Teste de admin:**
- [ ] GET `/api/admin/usuarios` com admin retorna lista
- [ ] GET `/api/admin/usuarios` com colaborador retorna 403
- [ ] POST `/api/admin/usuarios` cria usuário corretamente

---

## 3. Frontend — Colaborador

**Login:**
- [ ] Tela de login carrega corretamente
- [ ] Login com credenciais erradas mostra mensagem de erro
- [ ] Login correto redireciona para o catálogo
- [ ] Atualizar a página mantém o usuário logado
- [ ] Botão de logout funciona e volta para o login

**Catálogo:**
- [ ] 48 materiais carregam no grid
- [ ] Cards exibem: código, descrição, categoria, unidade, badge de estoque
- [ ] Badge verde/amarelo/vermelho aparece corretamente
- [ ] Campo de busca filtra em tempo real
- [ ] Filtro por categoria funciona
- [ ] Botão "Limpar filtros" aparece quando há filtro ativo
- [ ] Botão "Adicionar" muda para "Adicionado!" por 1.2s
- [ ] Material sem estoque mostra "Sem estoque" e não permite adicionar

**Carrinho:**
- [ ] Badge no ícone do carrinho conta corretamente
- [ ] Drawer abre ao clicar no carrinho (desktop: lateral / mobile: bottom sheet)
- [ ] Cada item mostra código, descrição, unidade e quantidade
- [ ] Botão + aumenta quantidade
- [ ] Botão − diminui e remove se chegar a zero
- [ ] Ícone de lixeira remove o item
- [ ] Carrinho vazio mostra estado vazio
- [ ] Fechar o drawer e reabrir mantém os itens
- [ ] Botão "Revisar e enviar" navega para a revisão

**Revisão:**
- [ ] Dados do solicitante (nome, departamento) estão corretos e não editáveis
- [ ] Lista de itens com quantidades está correta
- [ ] Campo de data de necessidade funciona (não aceita datas no passado)
- [ ] Campo de observações funciona
- [ ] Link "Editar itens no catálogo" volta para o catálogo sem perder o carrinho
- [ ] Botão "Voltar" funciona
- [ ] Botão "Confirmar envio" envia a requisição
- [ ] Tela de sucesso exibe número da requisição
- [ ] Botão "Ver no histórico" navega para o histórico
- [ ] Botão "Nova requisição" volta para o catálogo com o carrinho limpo

**Histórico:**
- [ ] Lista apenas as requisições do colaborador logado
- [ ] Status exibido com badge colorido
- [ ] Filtro de status funciona
- [ ] Clicar em uma requisição expande o detalhe
- [ ] Detalhe mostra itens com código, descrição e quantidade
- [ ] Detalhe mostra histórico de status com datas

---

## 4. Frontend — Operador

- [ ] Menu mostra "Operador" (não aparece para colaborador)
- [ ] Painel carrega com as 3 colunas: Solicitado, Em separação, Separado
- [ ] Cards de resumo no topo mostram contagens corretas
- [ ] Botão "Iniciar separação" aparece nas requisições com status "solicitado"
- [ ] Modal de confirmação aparece ao clicar no botão de ação
- [ ] Status muda após confirmar
- [ ] Modal de cancelamento exige motivo
- [ ] Cancelamento sem motivo mantém o botão desabilitado
- [ ] Botão "Detalhes" expande e mostra itens e histórico
- [ ] Modo lista mostra todas as requisições em coluna única
- [ ] Botão de atualizar recarrega as requisições
- [ ] Seção "Arquivados" aparece e expande ao clicar

---

## 5. Frontend — Admin

- [ ] Menu mostra "Admin" (não aparece para colaborador/operador)
- [ ] Aba "Usuários" lista todos os colaboradores
- [ ] Formulário "Novo usuário" cria usuário corretamente
- [ ] E-mail duplicado mostra mensagem de erro
- [ ] Botão "Desativar/Ativar" altera o status do usuário
- [ ] Aba "Estoque" lista todos os materiais com quantidades
- [ ] Clicar na quantidade abre os campos de edição
- [ ] Editar e confirmar salva a nova quantidade
- [ ] Badge de status atualiza após salvar

---

## 6. Testes mobile (viewport 390px)

- [ ] Tela de login renderiza corretamente
- [ ] Catálogo exibe 2 colunas de cards
- [ ] Barra de busca e filtros funcionam no toque
- [ ] Área dos botões +/- é grande o suficiente para o dedo
- [ ] Carrinho abre como bottom sheet (vem de baixo)
- [ ] Handle do drawer (risquinho no topo) está visível
- [ ] Nav inferior está visível e funcional
- [ ] Tela de revisão rolável sem elementos cortados
- [ ] Histórico expansível funciona no toque

---

## 7. Segurança

- [ ] Colaborador não acessa `/operador` (redireciona para o catálogo)
- [ ] Colaborador não acessa `/admin` (redireciona para o catálogo)
- [ ] Token expirado redireciona para o login
- [ ] Após logout, voltar com o botão do navegador redireciona para o login
- [ ] Senha nunca aparece em respostas da API

---

## 8. Antes de ir ao ar em produção

- [ ] `.env` de produção criado com JWT_SECRET forte (64+ caracteres hex)
- [ ] Senhas dos usuários de seed trocadas
- [ ] Banco de dados em produção populado com dados reais da Boxer
- [ ] Backend respondendo em HTTPS
- [ ] Frontend apontando para a URL correta do backend
- [ ] Health check de produção respondendo: `GET /health`
- [ ] Teste de login com usuário real de produção
- [ ] Backup automático do banco configurado
- [ ] PM2 configurado para reiniciar no boot (VPS) ou serviço monitorado (Railway)

---

## Resultado esperado ao concluir o checklist

✅ Sistema funcional para ~70 colaboradores
✅ Três perfis operando corretamente
✅ Fluxo completo testado: catálogo → carrinho → revisão → operador → entrega
✅ Dados protegidos com autenticação e validação
✅ Experiência mobile validada
