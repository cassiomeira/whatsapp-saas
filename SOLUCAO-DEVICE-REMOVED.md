# 🔧 Solução - Erro 401 device_removed

## 🔍 Problema Identificado

O erro nos logs mostra:
```
"code":"401","content":[{"tag":"conflict","attrs":{"type":"device_removed"}}]
```

Isso significa que o WhatsApp detectou um conflito de dispositivo/sessão.

## ✅ Solução Completa

### Passo 1: Limpar TUDO

```powershell
# Parar e remover container
docker stop evolution-api
docker rm evolution-api

# Remover volumes (limpa todas as sessões antigas)
docker volume rm $(docker volume ls -q | Select-String "evolution")
```

### Passo 2: Recriar Container Limpo

```powershell
docker run -d --name evolution-api -p 8080:8080 -e AUTHENTICATION_API_KEY=NetcarSecret2024 -e SERVER_URL=http://localhost:8080 -e CONFIG_SESSION_PHONE_VERSION=2.3000.1020885143 -e CONFIG_SESSION_PHONE_CLIENT=Chrome -e CONFIG_SESSION_PHONE_NAME=Chrome atendai/evolution-api:v1.7.4
```

### Passo 3: Limpar WhatsApp no Celular

**IMPORTANTE:** Antes de tentar conectar:

1. **Desconecte TODOS os WhatsApp Web:**
   - Abra WhatsApp no celular
   - Vá em: Configurações → Aparelhos conectados
   - Desconecte TODOS os dispositivos
   - Aguarde 2-3 minutos

2. **Reinicie o WhatsApp no celular** (fechar e abrir novamente)

3. **Aguarde 5 minutos** antes de tentar conectar novamente

### Passo 4: Remover Instâncias Antigas na Aplicação

1. Na aplicação, vá em WhatsApp
2. Remova TODAS as instâncias antigas
3. Aguarde 1 minuto

### Passo 5: Criar Nova Instância

1. Clique em "+ Nova Instância"
2. Dê um nome
3. Gere o QR Code
4. **Escaneie IMEDIATAMENTE** (QR Code expira rápido)

## ⚠️ Dicas Importantes

1. **Nunca escaneie o mesmo QR Code duas vezes**
2. **Aguarde pelo menos 5 minutos entre tentativas**
3. **Certifique-se de que o WhatsApp não está conectado em nenhum outro lugar**
4. **Use um QR Code fresco** (gerado há menos de 30 segundos)

## 🔄 Se Ainda Não Funcionar

O erro `device_removed` pode indicar que:

1. **O número foi banido temporariamente** pelo WhatsApp
   - Solução: Aguarde 24 horas e tente novamente

2. **Há muitas tentativas de conexão**
   - Solução: Aguarde algumas horas antes de tentar novamente

3. **O WhatsApp detectou atividade suspeita**
   - Solução: Use um número diferente ou aguarde

## 📝 Comandos Rápidos

```powershell
# Limpar tudo e recriar
docker stop evolution-api; docker rm evolution-api
docker volume rm $(docker volume ls -q | Select-String "evolution")
docker run -d --name evolution-api -p 8080:8080 -e AUTHENTICATION_API_KEY=NetcarSecret2024 -e SERVER_URL=http://localhost:8080 -e CONFIG_SESSION_PHONE_VERSION=2.3000.1020885143 -e CONFIG_SESSION_PHONE_CLIENT=Chrome -e CONFIG_SESSION_PHONE_NAME=Chrome atendai/evolution-api:v1.7.4

# Ver logs
docker logs -f evolution-api
```

---

**O erro `device_removed` geralmente resolve após limpar tudo e aguardar alguns minutos antes de tentar novamente.**

