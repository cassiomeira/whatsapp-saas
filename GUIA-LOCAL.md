# 🚀 Guia - Rodar Aplicação Localmente no Windows

Este guia mostra como rodar a aplicação diretamente no Windows, sem Docker.

## 📋 Pré-requisitos

1. **Node.js 20+** - [Baixar aqui](https://nodejs.org/)
2. **pnpm** - Será instalado automaticamente
3. **Ngrok** (opcional, para URL pública) - [Baixar aqui](https://ngrok.com/download)

---

## 🔧 Passo 1: Instalar Dependências

Abra o PowerShell na pasta do projeto e execute:

```powershell
# Instalar pnpm globalmente (se ainda não tiver)
npm install -g pnpm

# Instalar dependências do projeto
pnpm install
```

---

## 📝 Passo 2: Configurar Variáveis de Ambiente

1. Certifique-se que o arquivo `.env` existe e está configurado
2. Verifique especialmente:
   - `DATABASE_URL=file:./local.db`
   - `PORT=3000` (ou outra porta de sua preferência)
   - `JWT_SECRET` (deve ter um valor)
   - Outras variáveis conforme necessário

---

## 🚀 Passo 3: Inicializar Banco de Dados

```powershell
pnpm db:push
```

Isso vai criar/atualizar o banco de dados SQLite local.

---

## ▶️ Passo 4: Rodar a Aplicação

### Modo Desenvolvimento (com hot reload):

```powershell
pnpm dev
```

A aplicação estará disponível em: **http://localhost:3000**

### Modo Produção:

```powershell
# Primeiro, fazer build
pnpm build

# Depois, iniciar
pnpm start
```

---

## 🌐 Passo 5: Configurar Ngrok (Opcional)

Se quiser expor a aplicação publicamente:

### 5.1 Instalar Ngrok

1. Baixe o Ngrok: https://ngrok.com/download
2. Extraia o arquivo `ngrok.exe` em uma pasta (ex: `C:\ngrok\`)
3. Adicione a pasta ao PATH do Windows ou use o caminho completo

### 5.2 Autenticar Ngrok

```powershell
ngrok config add-authtoken SEU_AUTHTOKEN_AQUI
```

(O authtoken você pega em: https://dashboard.ngrok.com)

### 5.3 Iniciar Ngrok

Em um **novo terminal**, execute:

```powershell
ngrok http 3000
```

Você verá uma URL pública tipo: `https://abc123.ngrok-free.app`

---

## 🛠️ Comandos Úteis

```powershell
# Desenvolvimento (com hot reload)
pnpm dev

# Build para produção
pnpm build

# Rodar em produção
pnpm start

# Verificar tipos TypeScript
pnpm check

# Atualizar banco de dados
pnpm db:push
```

---

## ⚠️ Solução de Problemas

### Erro: "Port 3000 is already in use"

**Solução:** Altere a porta no arquivo `.env`:
```
PORT=3001
```

### Erro: "Cannot find module"

**Solução:** 
```powershell
pnpm install
```

### Erro: "Database not found"

**Solução:**
```powershell
pnpm db:push
```

### Erro ao rodar `pnpm dev`

**Solução:** Certifique-se que todas as dependências estão instaladas:
```powershell
pnpm install
```

---

## 📱 Configurar Webhook do WhatsApp

Quando configurar o webhook do Evolution API, use:

- **Local:** `http://localhost:3000/api/webhook/evolution`
- **Público (Ngrok):** `https://sua-url-ngrok.ngrok-free.app/api/webhook/evolution`

---

## ✅ Pronto!

Agora sua aplicação está rodando localmente! 🎉

- **Local:** http://localhost:3000
- **Público (se usar Ngrok):** Veja no terminal do Ngrok

