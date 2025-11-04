# 🚀 Guia de Deploy no Render

Este guia explica como fazer deploy do WhatsApp SaaS Platform no Render.

## 📋 Pré-requisitos

- Conta no Render (https://render.com)
- Conta no GitHub
- Código do projeto

## 🔧 Passo 1: Preparar Repositório GitHub

### 1.1 Baixar o projeto da Manus

1. Na interface Manus, clique no ícone **"Code"** (</>) no canto superior direito
2. Clique em **"Download all files"**
3. Extraia o ZIP em uma pasta local

### 1.2 Criar repositório no GitHub

```bash
# Entre na pasta do projeto
cd whatsapp-saas

# Inicializar git (se ainda não estiver inicializado)
git init

# Adicionar todos os arquivos
git add .

# Fazer commit
git commit -m "Initial commit"

# Criar repositório no GitHub e conectar
git remote add origin https://github.com/SEU_USUARIO/whatsapp-saas.git
git branch -M main
git push -u origin main
```

## 🎯 Passo 2: Criar Serviços no Render

### 2.1 Criar Banco de Dados MySQL

1. No dashboard do Render, clique em **"New +"**
2. Selecione **"PostgreSQL"** (Render não oferece MySQL no plano gratuito)
   - **Alternativa:** Use PlanetScale, Railway ou Supabase para MySQL
3. Configure:
   - **Name:** `whatsapp-saas-db`
   - **Database:** `whatsapp_saas`
   - **User:** `whatsapp_saas_user`
   - **Region:** Escolha a mais próxima
   - **Plan:** Free ou Starter
4. Clique em **"Create Database"**
5. **Copie a URL de conexão** (DATABASE_URL)

### 2.2 Criar Web Service

1. No dashboard do Render, clique em **"New +"**
2. Selecione **"Web Service"**
3. Conecte seu repositório GitHub
4. Configure:

#### Build & Deploy

- **Name:** `whatsapp-saas`
- **Region:** Mesma do banco de dados
- **Branch:** `main`
- **Runtime:** `Node`
- **Build Command:** `pnpm render:build`
- **Start Command:** `pnpm render:start`
- **Plan:** Starter ($7/mês) ou Free (com limitações)

#### Environment Variables

Adicione as seguintes variáveis de ambiente:

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `NODE_ENV` | `production` | Ambiente de produção |
| `PORT` | `3000` | Porta do servidor |
| `DATABASE_URL` | `[URL do banco]` | URL de conexão do banco de dados |
| `JWT_SECRET` | `[gerar aleatório]` | Secret para JWT (use gerador do Render) |
| `VITE_APP_ID` | `[seu app ID]` | ID do app OAuth |
| `VITE_APP_TITLE` | `WhatsApp SaaS Platform` | Título do app |
| `VITE_APP_LOGO` | `[URL do logo]` | URL do logo |
| `OAUTH_SERVER_URL` | `https://api.manus.im` | URL do servidor OAuth |
| `VITE_OAUTH_PORTAL_URL` | `https://auth.manus.im` | URL do portal OAuth |
| `OWNER_OPEN_ID` | `[seu openId]` | OpenID do proprietário |
| `OWNER_NAME` | `[seu nome]` | Nome do proprietário |
| `BUILT_IN_FORGE_API_URL` | `[URL da API]` | URL da API Manus |
| `BUILT_IN_FORGE_API_KEY` | `[sua chave]` | Chave da API Manus |

**Importante:** Algumas variáveis você precisará obter da sua conta Manus ou configurar manualmente.

5. Clique em **"Create Web Service"**

## 🔄 Passo 3: Aguardar Deploy

O Render vai:
1. ✅ Clonar o repositório
2. ✅ Instalar dependências (`pnpm install`)
3. ✅ Fazer build do frontend e backend
4. ✅ Aplicar migrações do banco de dados
5. ✅ Iniciar o servidor

**Tempo estimado:** 5-10 minutos

## 🌐 Passo 4: Acessar Aplicação

Após o deploy concluir:

1. Render fornecerá uma URL: `https://whatsapp-saas.onrender.com`
2. Acesse a URL e faça login
3. Configure sua primeira instância WhatsApp

## ⚙️ Passo 5: Configurações Adicionais

### 5.1 Domínio Customizado (Opcional)

1. No painel do Web Service, vá em **"Settings"**
2. Clique em **"Custom Domain"**
3. Adicione seu domínio (ex: `app.seudominio.com`)
4. Configure DNS conforme instruções do Render

### 5.2 Configurar Evolution API

1. Acesse sua aplicação
2. Vá em **"Configurações"** → **"Evolution API"**
3. Configure:
   - URL da API Evolution
   - API Key
   - Nome da instância

### 5.3 Configurar IXC Soft (Opcional)

1. Vá em **"Configurações"** → **"IXC Soft"**
2. Configure:
   - URL da API IXC
   - Token de acesso

## 🔧 Troubleshooting

### Erro de Build

Se o build falhar:
1. Verifique os logs no Render
2. Confirme que todas as dependências estão no `package.json`
3. Tente fazer build localmente primeiro

### Erro de Banco de Dados

Se houver erro de conexão com banco:
1. Verifique se `DATABASE_URL` está correta
2. Confirme que o banco está rodando
3. Verifique se as migrações foram aplicadas

### Aplicação não inicia

Se a aplicação não iniciar:
1. Verifique os logs no Render
2. Confirme que todas as variáveis de ambiente estão configuradas
3. Verifique se a porta está correta (3000)

## 📊 Monitoramento

O Render oferece:
- ✅ Logs em tempo real
- ✅ Métricas de CPU e memória
- ✅ Alertas de downtime
- ✅ Auto-deploy em push no GitHub

## 💰 Custos Estimados

| Serviço | Plano | Custo/mês |
|---------|-------|-----------|
| Web Service | Starter | $7 |
| Database | Starter | $7 |
| **Total** | | **$14/mês** |

**Plano Free:** Disponível mas com limitações (hibernação após inatividade, 750 horas/mês)

## 🔄 Atualizações

Para atualizar a aplicação:

1. Faça alterações no código
2. Commit e push para GitHub
3. Render faz deploy automático

Ou faça deploy manual:
1. No painel do Render
2. Clique em **"Manual Deploy"**
3. Selecione a branch

## 📞 Suporte

- **Render:** https://render.com/docs
- **Manus:** https://help.manus.im
- **Evolution API:** https://doc.evolution-api.com

---

✅ **Pronto! Sua aplicação está online 24/7!** 🎉

