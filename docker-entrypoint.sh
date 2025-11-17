#!/bin/sh
set -e

echo "🚀 Iniciando aplicação WhatsApp SaaS..."

# Verificar se arquivo .env existe
if [ ! -f ".env" ]; then
    echo "⚠️  Arquivo .env não encontrado!"
    echo "📝 Criando arquivo .env básico..."
    cat > .env <<EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=file:./local.db
JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "change-this-secret-in-production")
VITE_APP_ID=
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://auth.manus.im
OWNER_OPEN_ID=
OWNER_NAME=Administrador
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=
BUILT_IN_FORGE_MODEL=gpt-4o
VITE_APP_TITLE=WhatsApp SaaS Platform
VITE_APP_LOGO=https://via.placeholder.com/150
EOF
    echo "✅ Arquivo .env criado! Configure as variáveis necessárias."
fi

# Inicializar banco de dados se necessário
if [ ! -f "local.db" ]; then
    echo "📦 Inicializando banco de dados..."
    pnpm db:push || echo "⚠️  Aviso: Erro ao inicializar banco de dados (pode ser normal se já existir)"
fi

# Criar diretório de sessões WhatsApp se não existir
mkdir -p ./data/whatsapp-sessions

# Iniciar o servidor
echo "✅ Iniciando servidor..."
exec pnpm start

