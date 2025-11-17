#!/bin/sh
set -e

echo "🚀 Iniciando aplicação WhatsApp SaaS..."

generate_secret() {
    openssl rand -base64 32 2>/dev/null || echo "change-this-secret-in-production"
}

# Valores com fallback para o ambiente atual
NODE_ENV_VALUE=${NODE_ENV:-production}
PORT_VALUE=${PORT:-3000}
DATABASE_URL_VALUE=${DATABASE_URL:-file:./local.db}
JWT_SECRET_VALUE=${JWT_SECRET:-$(generate_secret)}
OAUTH_SERVER_URL_VALUE=${OAUTH_SERVER_URL:-https://api.manus.im}
VITE_OAUTH_PORTAL_URL_VALUE=${VITE_OAUTH_PORTAL_URL:-https://auth.manus.im}
OWNER_OPEN_ID_VALUE=${OWNER_OPEN_ID:-}
OWNER_NAME_VALUE=${OWNER_NAME:-Administrador}
BUILT_IN_FORGE_API_URL_VALUE=${BUILT_IN_FORGE_API_URL:-https://api.manus.im}
BUILT_IN_FORGE_API_KEY_VALUE=${BUILT_IN_FORGE_API_KEY:-}
BUILT_IN_FORGE_MODEL_VALUE=${BUILT_IN_FORGE_MODEL:-gpt-4o}
VITE_APP_ID_VALUE=${VITE_APP_ID:-}
VITE_APP_TITLE_VALUE=${VITE_APP_TITLE:-WhatsApp SaaS Platform}
VITE_APP_LOGO_VALUE=${VITE_APP_LOGO:-https://via.placeholder.com/150}

# Exportar para o processo atual
export NODE_ENV="$NODE_ENV_VALUE"
export PORT="$PORT_VALUE"
export DATABASE_URL="$DATABASE_URL_VALUE"
export JWT_SECRET="$JWT_SECRET_VALUE"
export OAUTH_SERVER_URL="$OAUTH_SERVER_URL_VALUE"
export VITE_OAUTH_PORTAL_URL="$VITE_OAUTH_PORTAL_URL_VALUE"
export OWNER_OPEN_ID="$OWNER_OPEN_ID_VALUE"
export OWNER_NAME="$OWNER_NAME_VALUE"
export BUILT_IN_FORGE_API_URL="$BUILT_IN_FORGE_API_URL_VALUE"
export BUILT_IN_FORGE_API_KEY="$BUILT_IN_FORGE_API_KEY_VALUE"
export BUILT_IN_FORGE_MODEL="$BUILT_IN_FORGE_MODEL_VALUE"
export VITE_APP_ID="$VITE_APP_ID_VALUE"
export VITE_APP_TITLE="$VITE_APP_TITLE_VALUE"
export VITE_APP_LOGO="$VITE_APP_LOGO_VALUE"

echo "🔧 Variáveis efetivas:"
echo "  NODE_ENV=$NODE_ENV"
echo "  PORT=$PORT"
echo "  DATABASE_URL=$DATABASE_URL"
echo "  WHATSAPP_SESSIONS_DIR=${WHATSAPP_SESSIONS_DIR:-$(pwd)/data/whatsapp-sessions}"

# Verificar se arquivo .env existe
if [ ! -f ".env" ]; then
    echo "⚠️  Arquivo .env não encontrado!"
    echo "📝 Criando arquivo .env básico..."
    cat > .env <<EOF
NODE_ENV=${NODE_ENV_VALUE}
PORT=${PORT_VALUE}
DATABASE_URL=${DATABASE_URL_VALUE}
JWT_SECRET=${JWT_SECRET_VALUE}
VITE_APP_ID=${VITE_APP_ID_VALUE}
OAUTH_SERVER_URL=${OAUTH_SERVER_URL_VALUE}
VITE_OAUTH_PORTAL_URL=${VITE_OAUTH_PORTAL_URL_VALUE}
OWNER_OPEN_ID=${OWNER_OPEN_ID_VALUE}
OWNER_NAME=${OWNER_NAME_VALUE}
BUILT_IN_FORGE_API_URL=${BUILT_IN_FORGE_API_URL_VALUE}
BUILT_IN_FORGE_API_KEY=${BUILT_IN_FORGE_API_KEY_VALUE}
BUILT_IN_FORGE_MODEL=${BUILT_IN_FORGE_MODEL_VALUE}
VITE_APP_TITLE=${VITE_APP_TITLE_VALUE}
VITE_APP_LOGO=${VITE_APP_LOGO_VALUE}
EOF
    echo "✅ Arquivo .env criado! Configure as variáveis necessárias."
fi

# Inicializar banco de dados se necessário
if [ ! -f "local.db" ]; then
    echo "📦 Inicializando banco de dados..."
    pnpm db:push || echo "⚠️  Aviso: Erro ao inicializar banco de dados (pode ser normal se já existir)"
fi

# Configurar diretório de sessões (padrão ./data/whatsapp-sessions)
SESSIONS_DIR=${WHATSAPP_SESSIONS_DIR:-$(pwd)/data/whatsapp-sessions}
export WHATSAPP_SESSIONS_DIR="$SESSIONS_DIR"
mkdir -p "$WHATSAPP_SESSIONS_DIR"

# Iniciar o servidor
echo "✅ Iniciando servidor..."
exec pnpm start

