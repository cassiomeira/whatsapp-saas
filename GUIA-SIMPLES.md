# 🚀 Guia Simples - Subir o Projeto com Docker e Ngrok

Este guia vai te ajudar a subir o projeto no seu computador de forma simples usando Docker e Ngrok.

## 📋 Pré-requisitos

Antes de começar, você precisa ter instalado:

1. **Docker Desktop** - [Baixar aqui](https://www.docker.com/products/docker-desktop/)
2. **Conta no Ngrok** (gratuita) - [Criar conta aqui](https://dashboard.ngrok.com/signup)

---

## 🔧 Passo 1: Configurar o Ngrok

1. Acesse [https://dashboard.ngrok.com](https://dashboard.ngrok.com)
2. Faça login na sua conta
3. Vá em **"Your Authtoken"** (ou **"Getting Started"**)
4. **Copie o seu authtoken** (algo como: `2abc123def456ghi789jkl012mno345pqr678stu901vwx234yz`)

---

## 📝 Passo 2: Configurar o Projeto

### 2.1 Criar arquivo `.env`

1. Na pasta do projeto, copie o arquivo `.env.example` para `.env`:
   ```bash
   copy .env.example .env
   ```
   (No PowerShell: `Copy-Item .env.example .env`)

2. Abra o arquivo `.env` e preencha as variáveis necessárias:
   - `JWT_SECRET`: Gere uma chave aleatória (pode usar: `openssl rand -base64 32`)
   - `VITE_APP_ID`: Seu App ID do Manus
   - `OWNER_OPEN_ID`: Seu Open ID
   - `OWNER_NAME`: Seu nome
   - `BUILT_IN_FORGE_API_KEY`: Sua chave da API Manus
   - Outras variáveis conforme necessário

### 2.2 Configurar o Ngrok

1. Abra o arquivo `ngrok.yml`
2. Substitua `SEU_NGROK_AUTH_TOKEN_AQUI` pelo authtoken que você copiou no Passo 1
3. Salve o arquivo

---

## 🐳 Passo 3: Subir o Projeto com Docker

### 3.1 Construir e iniciar os containers

Abra o PowerShell ou Terminal na pasta do projeto e execute:

```bash
docker-compose up -d --build
```

Este comando vai:
- ✅ Construir a imagem Docker
- ✅ Instalar todas as dependências
- ✅ Fazer o build da aplicação
- ✅ Iniciar o servidor na porta 3000
- ✅ Iniciar o Ngrok para expor a aplicação

**Aguarde alguns minutos** enquanto o Docker faz o build (primeira vez pode demorar 5-10 minutos).

### 3.2 Verificar se está funcionando

1. **Ver os logs:**
   ```bash
   docker-compose logs -f
   ```

2. **Verificar se os containers estão rodando:**
   ```bash
   docker-compose ps
   ```

   Você deve ver dois containers:
   - `whatsapp-saas` (aplicação)
   - `whatsapp-ngrok` (ngrok)

---

## 🌐 Passo 4: Acessar a Aplicação

### 4.1 URL Local

A aplicação estará disponível em:
- **http://localhost:3000**

### 4.2 URL Pública (Ngrok)

1. Acesse a interface web do Ngrok: **http://localhost:4040**
2. Você verá uma URL pública tipo: `https://abc123.ngrok-free.app`
3. **Esta é a URL que você pode usar para acessar de qualquer lugar!**

**Importante:** Copie essa URL, pois ela será necessária para configurar webhooks do WhatsApp.

---

## 🛠️ Comandos Úteis

### Parar os containers
```bash
docker-compose down
```

### Parar e remover volumes (limpar banco de dados)
```bash
docker-compose down -v
```

### Ver logs em tempo real
```bash
docker-compose logs -f app
```

### Ver logs do Ngrok
```bash
docker-compose logs -f ngrok
```

### Reiniciar os containers
```bash
docker-compose restart
```

### Reconstruir tudo do zero
```bash
docker-compose down
docker-compose up -d --build
```

---

## 🔄 Atualizar o Código

Se você fizer alterações no código:

1. **Parar os containers:**
   ```bash
   docker-compose down
   ```

2. **Reconstruir e iniciar:**
   ```bash
   docker-compose up -d --build
   ```

---

## ⚠️ Solução de Problemas

### Erro: "Port 3000 is already in use"

**Solução:** Altere a porta no `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Mude 3000 para 3001 (ou outra porta)
```

### Erro: "Ngrok authtoken invalid"

**Solução:** Verifique se você colocou o authtoken correto no arquivo `ngrok.yml`

### Erro: "Cannot connect to database"

**Solução:** 
1. Verifique se o arquivo `.env` existe e tem `DATABASE_URL` configurado
2. Execute: `docker-compose down -v` e depois `docker-compose up -d --build`

### Container não inicia

**Solução:**
1. Veja os logs: `docker-compose logs app`
2. Verifique se todas as variáveis no `.env` estão preenchidas
3. Tente reconstruir: `docker-compose up -d --build --force-recreate`

---

## 📱 Configurar Webhook do WhatsApp

Quando você configurar o webhook do Evolution API ou WhatsApp, use a URL do Ngrok:

```
https://sua-url-ngrok.ngrok-free.app/api/webhook/evolution
```

**Lembre-se:** A URL do Ngrok muda toda vez que você reinicia o Ngrok (no plano gratuito). Para ter uma URL fixa, você precisa do plano pago do Ngrok.

---

## ✅ Pronto!

Agora seu projeto está rodando! 🎉

- **Local:** http://localhost:3000
- **Público:** Veja em http://localhost:4040

Se tiver dúvidas, verifique os logs com `docker-compose logs -f`

