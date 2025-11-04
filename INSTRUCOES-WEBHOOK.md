# 🚀 INSTRUÇÕES PARA FAZER FUNCIONAR

## ⚠️ PROBLEMA IDENTIFICADO

O webhook NÃO está configurado na instância antiga `ws1_1761612053209`.
Por isso as mensagens não chegam no sistema.

---

## ✅ SOLUÇÃO RÁPIDA (2 minutos)

### **Passo 1:** Encontrar a API Key

1. Abra o arquivo `docker-compose.yml` da Evolution API
2. Procure por `AUTHENTICATION_API_KEY` ou `API_KEY`
3. Copie o valor (exemplo: `B6D711FCDE4D4FD5936544120E713976`)

### **Passo 2:** Executar o script

No terminal do seu computador (onde está o Docker), execute:

```bash
cd /caminho/para/whatsapp-saas
bash fix-webhook.sh
```

Quando pedir, cole a API Key que você copiou.

### **Passo 3:** Testar

1. Envie uma mensagem para o WhatsApp conectado
2. Veja no ngrok se aparece **POST /api/webhook/evolution**
3. A IA deve responder!

---

## 🔄 ALTERNATIVA (se não funcionar)

### Criar nova instância pelo sistema:

1. Acesse: https://3000-iuqotsz3u16ix37n9row9-e2a4aa5c.manusvm.computer/whatsapp
2. Clique em "Remover Instância" na instância antiga
3. Clique em "Nova Instância"
4. Dê um nome (ex: "Principal")
5. Escaneie o QR Code
6. **PRONTO!** O webhook já está configurado automaticamente

---

## 📋 VERIFICAR SE FUNCIONOU

Depois de configurar, envie uma mensagem e veja no ngrok:

✅ **FUNCIONANDO:** Aparece `POST /api/webhook/evolution 200 OK`  
❌ **NÃO FUNCIONANDO:** Só aparece `GET /instance/connectionState`

---

## 🆘 PRECISA DE AJUDA?

Me envie:
1. Screenshot do ngrok após enviar mensagem
2. A API Key da Evolution API (se souber)
3. Qual solução você tentou (script ou nova instância)

