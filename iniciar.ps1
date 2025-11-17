# Script para iniciar a aplicação localmente
Write-Host "🚀 Iniciando WhatsApp SaaS..." -ForegroundColor Cyan
Write-Host ""

# Verificar se node_modules existe
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Instalando dependências..." -ForegroundColor Yellow
    pnpm install
    Write-Host ""
}

# Verificar se .env existe
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  Arquivo .env não encontrado!" -ForegroundColor Yellow
    Write-Host "Criando arquivo .env básico..." -ForegroundColor Yellow
    @"
NODE_ENV=development
PORT=3000
DATABASE_URL=file:./local.db
JWT_SECRET=local-development-secret-key-change-in-production
VITE_APP_ID=
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://auth.manus.im
OWNER_OPEN_ID=local-user
OWNER_NAME=Administrador
BUILT_IN_FORGE_API_URL=https://api.openai.com
BUILT_IN_FORGE_API_KEY=
BUILT_IN_FORGE_MODEL=gpt-4o
VITE_APP_TITLE=WhatsApp SaaS Platform
VITE_APP_LOGO=https://via.placeholder.com/150
"@ | Out-File -FilePath ".env" -Encoding UTF8
    Write-Host "✅ Arquivo .env criado! Configure as variáveis necessárias." -ForegroundColor Green
    Write-Host ""
}

# Verificar se banco de dados existe
if (-not (Test-Path "local.db")) {
    Write-Host "📦 Inicializando banco de dados..." -ForegroundColor Yellow
    pnpm db:push
    Write-Host ""
}

Write-Host "✅ Tudo pronto!" -ForegroundColor Green
Write-Host ""
Write-Host "Iniciando servidor em modo desenvolvimento..." -ForegroundColor Cyan
Write-Host "A aplicação estará disponível em: http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "Para parar, pressione Ctrl+C" -ForegroundColor Gray
Write-Host ""

# Iniciar o servidor
pnpm dev

