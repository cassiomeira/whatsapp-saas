#!/bin/bash

# Script para configurar webhook na instância existente

EVOLUTION_API_URL="http://localhost:8081"
INSTANCE_NAME="ws1_1761612053209"
WEBHOOK_URL="https://unpuckered-jacinda-sulphurously.ngrok-free.dev/api/webhook/evolution"

echo "🔧 Configurando webhook para instância: $INSTANCE_NAME"
echo "📡 Webhook URL: $WEBHOOK_URL"
echo ""

# Ler API Key do usuário
echo "Digite a API Key da Evolution API:"
read -r API_KEY

echo ""
echo "Configurando webhook..."

# Configurar webhook
curl -X POST "$EVOLUTION_API_URL/webhook/set/$INSTANCE_NAME" \
  -H "Content-Type: application/json" \
  -H "apikey: $API_KEY" \
  -d "{
    \"url\": \"$WEBHOOK_URL\",
    \"webhook_by_events\": false,
    \"webhook_base64\": false,
    \"events\": [
      \"QRCODE_UPDATED\",
      \"MESSAGES_UPSERT\",
      \"MESSAGES_UPDATE\",
      \"MESSAGES_DELETE\",
      \"SEND_MESSAGE\",
      \"CONNECTION_UPDATE\"
    ]
  }"

echo ""
echo ""
echo "✅ Webhook configurado!"
echo ""
echo "Agora envie uma mensagem para o WhatsApp conectado e veja se aparece POST no ngrok!"

