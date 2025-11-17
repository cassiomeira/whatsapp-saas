# 🔧 Troubleshooting - Erro 401 ao Conectar WhatsApp

## ❌ Problema
WhatsApp escaneia o QR Code mas não conecta, mostrando erro 401.

## 🔍 Possíveis Causas

### 1. WhatsApp já está conectado em outro lugar
**Solução:**
- Desconecte o WhatsApp Web de TODOS os dispositivos
- Vá em WhatsApp → Menu (3 pontos) → Dispositivos conectados
- Desconecte todos os dispositivos
- Tente conectar novamente

### 2. QR Code expirado
**Solução:**
- QR Codes expiram em ~30 segundos
- Clique em "Reconectar" para gerar um novo QR Code
- Escaneie IMEDIATAMENTE após gerar

### 3. Múltiplas tentativas de conexão
**Solução:**
- Aguarde 5-10 minutos entre tentativas
- O WhatsApp pode bloquear conexões muito frequentes

### 4. Versão da Evolution API incompatível
**Solução:**
- A versão v1.7.4 pode ter problemas
- Tente usar uma versão mais recente ou estável

## ✅ Soluções Passo a Passo

### Solução 1: Limpar Tudo e Recomeçar

1. **Desconectar WhatsApp Web:**
   - Abra WhatsApp no celular
   - Vá em Configurações → Aparelhos conectados
   - Desconecte TODOS os dispositivos

2. **Remover instâncias antigas:**
   - Na aplicação, remova todas as instâncias
   - No terminal:
     ```powershell
     docker stop evolution-api
     docker rm evolution-api
     ```

3. **Recriar container:**
   ```powershell
   docker run -d --name evolution-api -p 8080:8080 -e AUTHENTICATION_API_KEY=NetcarSecret2024 -e SERVER_URL=http://localhost:8080 atendai/evolution-api:v1.7.4
   ```

4. **Aguardar 30 segundos** para o container inicializar

5. **Criar nova instância:**
   - Na aplicação, crie uma nova instância
   - Gere o QR Code
   - Escaneie IMEDIATAMENTE

### Solução 2: Verificar Configurações

Certifique-se de que está configurado assim:

**Settings → Evolution API:**
- URL da Evolution API: `http://localhost:8080`
- API Key: `NetcarSecret2024`
- Webhook URL: `https://seymour-crustier-zara.ngrok-free.dev/api/webhook/evolution`

**Ngrok:**
- Deve estar rodando: `ngrok http 3000`
- URL pública deve estar acessível

### Solução 3: Testar com Versão Diferente

Se a v1.7.4 não funcionar, tente outras versões:

```powershell
# Versão estável
docker run -d --name evolution-api -p 8080:8080 -e AUTHENTICATION_API_KEY=NetcarSecret2024 -e SERVER_URL=http://localhost:8080 atendai/evolution-api:stable

# Ou versão específica
docker run -d --name evolution-api -p 8080:8080 -e AUTHENTICATION_API_KEY=NetcarSecret2024 -e SERVER_URL=http://localhost:8080 atendai/evolution-api:v2.0.0
```

## 🧪 Testar Conexão

1. **Verificar se Evolution API está respondendo:**
   ```powershell
   curl http://localhost:8080
   ```

2. **Verificar logs:**
   ```powershell
   docker logs -f evolution-api
   ```

3. **Verificar se webhook está recebendo:**
   - Veja no terminal do Ngrok se aparecem requisições POST

## ⚠️ Dicas Importantes

1. **Nunca escaneie o mesmo QR Code duas vezes**
2. **Aguarde o QR Code aparecer completamente antes de escanear**
3. **Use um QR Code fresco (gerado há menos de 30 segundos)**
4. **Certifique-se de que o WhatsApp não está conectado em outro lugar**
5. **Aguarde alguns minutos entre tentativas se falhar**

## 🔄 Se Nada Funcionar

1. Reinicie o celular
2. Desinstale e reinstale o WhatsApp (último recurso)
3. Tente com outro número de WhatsApp
4. Verifique se há atualizações da Evolution API

---

**O erro 401 geralmente é temporário e resolve após algumas tentativas com QR Codes frescos.**

