# ✅ Configuração Correta - Evolution API + Ngrok

## 🎯 Configuração Correta

### 1. Ngrok (SEMPRE na porta 3000)
```powershell
ngrok http 3000
```

Isso cria uma URL pública tipo: `https://seymour-crustier-zara.ngrok-free.app`

### 2. Na Aplicação (Settings → Evolution API)

Configure **DUAS coisas diferentes**:

#### A) URL da Evolution API (para a aplicação se comunicar)
```
http://localhost:8080
```
**Importante:** Esta é LOCAL, não use a URL do Ngrok aqui!

#### B) Webhook URL (para a Evolution API enviar mensagens)
```
https://seymour-crustier-zara.ngrok-free.app/api/webhook/evolution
```
**Importante:** Esta é a URL PÚBLICA do Ngrok + `/api/webhook/evolution`

---

## 📋 Resumo das Configurações

| Item | Valor | Por quê? |
|------|-------|----------|
| **Ngrok** | `ngrok http 3000` | Expõe a aplicação publicamente |
| **Evolution API URL** | `http://localhost:8080` | Aplicação acessa Evolution API localmente |
| **Webhook URL** | `https://sua-url-ngrok.ngrok-free.app/api/webhook/evolution` | Evolution API envia webhooks para URL pública |

---

## 🔄 Fluxo Correto

```
1. WhatsApp → Evolution API (localhost:8080)
2. Evolution API → Webhook → URL Pública do Ngrok
3. Ngrok → Redireciona → Aplicação (localhost:3000)
4. Aplicação processa a mensagem
```

---

## ⚠️ Problemas Comuns

### ❌ Erro: "Aplicação não encontra Evolution API"
**Causa:** Evolution API URL está usando URL do Ngrok em vez de localhost:8080
**Solução:** Configure `http://localhost:8080` (não a URL do Ngrok!)

### ❌ Erro: "QR Code gerado mas WhatsApp não conecta"
**Causa:** Webhook URL está errada ou Ngrok não está na porta 3000
**Solução:** 
- Ngrok deve estar em `ngrok http 3000`
- Webhook URL deve ser: `https://sua-url-ngrok.ngrok-free.app/api/webhook/evolution`

### ❌ Erro: "WhatsApp conecta mas não recebe mensagens"
**Causa:** Webhook não está configurado corretamente
**Solução:** Verifique se o webhook está apontando para a URL pública do Ngrok

---

## ✅ Checklist de Configuração

- [ ] Evolution API rodando no Docker (porta 8080)
- [ ] Aplicação rodando localmente (porta 3000)
- [ ] Ngrok rodando: `ngrok http 3000`
- [ ] Evolution API URL configurada: `http://localhost:8080`
- [ ] Webhook URL configurada: `https://sua-url-ngrok.ngrok-free.app/api/webhook/evolution`
- [ ] API Key configurada corretamente (mesma em ambos)

---

## 🧪 Testar Configuração

1. **Teste Evolution API:**
   ```powershell
   # Deve retornar algo (mesmo que erro 404, significa que está respondendo)
   curl http://localhost:8080
   ```

2. **Teste Aplicação:**
   ```powershell
   # Deve retornar a página
   curl http://localhost:3000
   ```

3. **Teste Webhook:**
   - Crie uma instância do WhatsApp
   - Escaneie o QR Code
   - Verifique no Ngrok se aparecem requisições POST para `/api/webhook/evolution`

---

## 📝 Exemplo de Configuração Completa

**No Settings da aplicação:**

```
Evolution API URL: http://localhost:8080
API Key: NetcarSecret2024
Webhook URL: https://seymour-crustier-zara.ngrok-free.app/api/webhook/evolution
```

**Ngrok rodando:**
```
Forwarding: https://seymour-crustier-zara.ngrok-free.app -> http://localhost:3000
```

**Evolution API rodando:**
```
Container: evolution-api
Porta: 8080
```

---

✅ **Com essa configuração, tudo deve funcionar!**

