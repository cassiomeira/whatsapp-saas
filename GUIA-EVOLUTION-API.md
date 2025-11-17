# 🚀 Guia - Evolution API no Docker

## 📋 Resumo das Portas

- **Aplicação:** Porta 3000 (rodando localmente)
- **Ngrok:** Expõe a porta 3000 publicamente (não usa porta própria)
- **Evolution API:** Porta 8080 (no Docker)

---

## 🐳 Passo 1: Iniciar Evolution API

Execute no terminal:

```powershell
docker-compose up -d evolution-api
```

Isso vai:
- ✅ Baixar a imagem da Evolution API
- ✅ Iniciar o container na porta 8080
- ✅ Criar volumes para persistir dados

---

## ⏱️ Passo 2: Aguardar Inicialização

Aguarde alguns segundos para a Evolution API inicializar completamente.

Verifique os logs:

```powershell
docker-compose logs -f evolution-api
```

Quando aparecer algo como "Server is running", está pronto!

---

## ✅ Passo 3: Verificar se Está Funcionando

Acesse no navegador:

**http://localhost:8080/health**

Deve retornar: `{"status":"ok"}`

---

## ⚙️ Passo 4: Configurar na Aplicação

1. Acesse sua aplicação: **http://localhost:3000**
2. Vá em **Settings** (Configurações)
3. Procure por **"Evolution API"**
4. Configure:
   - **URL da Evolution API:** `http://localhost:8080`
   - **API Key:** `NetcarSecret2024` (ou a chave que você definiu no `.env`)

---

## 🔑 Passo 5: Configurar API Key (Opcional)

Se quiser mudar a API Key, edite o arquivo `.env`:

```env
EVOLUTION_API_KEY=sua-chave-secreta-aqui
```

Depois reinicie o container:

```powershell
docker-compose restart evolution-api
```

**Importante:** Use a mesma chave na aplicação!

---

## 📱 Passo 6: Configurar Webhook

Quando criar uma instância do WhatsApp na aplicação, o webhook será configurado automaticamente.

O webhook precisa ser acessível pela Evolution API. Se estiver usando Ngrok:

1. Inicie o Ngrok:
   ```powershell
   ngrok http 3000
   ```

2. Copie a URL pública (ex: `https://abc123.ngrok-free.app`)

3. Na aplicação, configure o webhook como:
   ```
   https://sua-url-ngrok.ngrok-free.app/api/webhook/evolution
   ```

---

## 🛠️ Comandos Úteis

```powershell
# Iniciar Evolution API
docker-compose up -d evolution-api

# Ver logs
docker-compose logs -f evolution-api

# Parar Evolution API
docker-compose stop evolution-api

# Reiniciar Evolution API
docker-compose restart evolution-api

# Parar e remover (limpar dados)
docker-compose down -v evolution-api
```

---

## 🔍 Verificar Status

```powershell
docker-compose ps
```

Deve mostrar `evolution-api` como `Up`.

---

## ⚠️ Solução de Problemas

### Evolution API não inicia

**Verifique os logs:**
```powershell
docker-compose logs evolution-api
```

### Porta 8080 já está em uso

**Solução:** Altere a porta no `docker-compose.yml`:
```yaml
ports:
  - "8081:8080"  # Mude 8080 para 8081
```

E atualize a URL na aplicação para `http://localhost:8081`

### Erro de conexão

**Verifique:**
1. Se o container está rodando: `docker-compose ps`
2. Se a porta está correta: `http://localhost:8080/health`
3. Se a API Key está correta no `.env` e na aplicação

---

## ✅ Pronto!

Agora você tem:
- ✅ Aplicação rodando localmente (porta 3000)
- ✅ Evolution API rodando no Docker (porta 8080)
- ✅ Ngrok configurado (se necessário)

**Próximo passo:** Configure a Evolution API nas Settings da aplicação e crie sua primeira instância do WhatsApp! 🎉

