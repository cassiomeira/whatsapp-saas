#!/bin/bash

echo "🚀 Iniciando WhatsApp SaaS em PRODUÇÃO..."

# Verificar se .env.production existe
if [ ! -f ".env.production" ]; then
    echo "❌ Arquivo .env.production não encontrado!"
    echo "📝 Criando .env.production a partir do exemplo..."
    
    # Criar .env.production básico se não existir
    if [ ! -f ".env.production" ]; then
        cat > .env.production <<EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=file:./production.db
JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "change-this-secret-in-production-$(date +%s)")
VITE_APP_ID=
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://auth.manus.im
OWNER_OPEN_ID=
OWNER_NAME=Administrador Produção
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=
BUILT_IN_FORGE_MODEL=gpt-4o
VITE_APP_TITLE=WhatsApp SaaS - Produção
VITE_APP_LOGO=https://via.placeholder.com/150
VITE_APP_URL=http://177.184.190.62:3001
EOF
        echo "✅ Arquivo .env.production criado!"
        echo "✅ IP válido configurado: 177.184.190.62:3001"
        echo "⚠️  IMPORTANTE: Configure JWT_SECRET e outras variáveis se necessário"
        echo "📝 Edite .env.production se precisar ajustar algo"
        echo ""
        echo "Continuando com a inicialização..."
        sleep 2
    fi
fi

# Copiar .env.production para .env (para o container)
cp .env.production .env
echo "✅ Arquivo .env copiado do .env.production"

# Parar containers antigos
echo "🛑 Parando containers antigos..."
docker-compose -f docker-compose.prod.yml down

# Construir e iniciar
echo "🔨 Construindo e iniciando containers..."
docker-compose -f docker-compose.prod.yml up -d --build

# Aguardar alguns segundos
echo "⏳ Aguardando inicialização..."
sleep 5

# Mostrar status
echo ""
echo "📊 Status dos containers:"
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "✅ Produção iniciada!"
echo ""
echo "🌐 URLs de acesso:"
echo "   Local:     http://localhost:3001"
echo "   IP válido: http://177.184.190.62:3001"
echo ""
echo "📝 Comandos úteis:"
echo "   Ver logs:  docker-compose -f docker-compose.prod.yml logs -f app-prod"
echo "   Parar:     docker-compose -f docker-compose.prod.yml down"
echo ""
echo "ℹ️  Produção Docker na porta 3001 | Dev local na porta 3000"

