# Script de Setup para Windows PowerShell
# Este script ajuda a configurar o projeto rapidamente

Write-Host "🚀 Configurando o projeto WhatsApp SaaS..." -ForegroundColor Cyan
Write-Host ""

# Verificar se Docker está instalado
Write-Host "📦 Verificando Docker..." -ForegroundColor Yellow
try {
    docker --version | Out-Null
    Write-Host "✅ Docker encontrado!" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker não encontrado!" -ForegroundColor Red
    Write-Host "Por favor, instale o Docker Desktop: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
    exit 1
}

# Verificar se arquivo .env existe
Write-Host ""
Write-Host "📝 Verificando arquivo .env..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  Arquivo .env não encontrado!" -ForegroundColor Yellow
    Write-Host "Criando arquivo .env a partir do .env.example..." -ForegroundColor Yellow
    
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "✅ Arquivo .env criado!" -ForegroundColor Green
        Write-Host ""
        Write-Host "⚠️  IMPORTANTE: Edite o arquivo .env e preencha as variáveis necessárias!" -ForegroundColor Yellow
        Write-Host "   Especialmente: JWT_SECRET, VITE_APP_ID, OWNER_OPEN_ID, etc." -ForegroundColor Yellow
    } else {
        Write-Host "❌ Arquivo .env.example não encontrado!" -ForegroundColor Red
        Write-Host "Criando arquivo .env básico..." -ForegroundColor Yellow
        
        @"
NODE_ENV=development
PORT=3000
DATABASE_URL=file:./local.db
JWT_SECRET=CHANGE_THIS_TO_A_SECURE_RANDOM_STRING
VITE_APP_ID=
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://auth.manus.im
OWNER_OPEN_ID=
OWNER_NAME=
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=
FORGE_MODEL=
VITE_APP_TITLE=WhatsApp SaaS Platform
VITE_APP_LOGO=https://via.placeholder.com/150
"@ | Out-File -FilePath ".env" -Encoding UTF8
        
        Write-Host "✅ Arquivo .env criado!" -ForegroundColor Green
        Write-Host "⚠️  IMPORTANTE: Edite o arquivo .env e preencha as variáveis!" -ForegroundColor Yellow
    }
} else {
    Write-Host "✅ Arquivo .env encontrado!" -ForegroundColor Green
}

# Verificar se ngrok.yml existe e tem o token
Write-Host ""
Write-Host "🌐 Verificando configuração do Ngrok..." -ForegroundColor Yellow
if (Test-Path "ngrok.yml") {
    $ngrokContent = Get-Content "ngrok.yml" -Raw
    if ($ngrokContent -match "SEU_NGROK_AUTH_TOKEN_AQUI") {
        Write-Host "⚠️  Ngrok não configurado!" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Para configurar o Ngrok:" -ForegroundColor Cyan
        Write-Host "1. Acesse: https://dashboard.ngrok.com" -ForegroundColor White
        Write-Host "2. Faça login e copie seu authtoken" -ForegroundColor White
        Write-Host "3. Abra o arquivo ngrok.yml e substitua 'SEU_NGROK_AUTH_TOKEN_AQUI' pelo seu token" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host "✅ Ngrok configurado!" -ForegroundColor Green
    }
} else {
    Write-Host "⚠️  Arquivo ngrok.yml não encontrado!" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "📋 PRÓXIMOS PASSOS:" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Edite o arquivo .env e preencha todas as variáveis necessárias" -ForegroundColor White
Write-Host "2. Configure o Ngrok no arquivo ngrok.yml (se ainda não fez)" -ForegroundColor White
Write-Host "3. Execute: docker-compose up -d --build" -ForegroundColor White
Write-Host ""
Write-Host "Para ver os logs: docker-compose logs -f" -ForegroundColor Gray
Write-Host "Para parar: docker-compose down" -ForegroundColor Gray
Write-Host ""
Write-Host "✅ Setup concluído!" -ForegroundColor Green

