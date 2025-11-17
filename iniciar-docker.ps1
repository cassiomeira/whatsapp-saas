# Script para iniciar o projeto com Docker e Ngrok
# PowerShell

Write-Host "🚀 Iniciando WhatsApp SaaS com Docker e Ngrok..." -ForegroundColor Cyan
Write-Host ""

# Verificar se Docker está instalado
Write-Host "📦 Verificando Docker..." -ForegroundColor Yellow
try {
    docker --version | Out-Null
    docker-compose --version | Out-Null
    Write-Host "✅ Docker encontrado!" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker não encontrado!" -ForegroundColor Red
    Write-Host "Por favor, instale o Docker Desktop: https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Verificar se arquivo .env existe
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  Arquivo .env não encontrado!" -ForegroundColor Yellow
    Write-Host "📝 Criando arquivo .env básico..." -ForegroundColor Yellow
    
    # Gerar JWT_SECRET aleatório
    $jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
    
    @"
NODE_ENV=production
PORT=3000
DATABASE_URL=file:./local.db
JWT_SECRET=$jwtSecret
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
"@ | Out-File -FilePath ".env" -Encoding UTF8
    
    Write-Host "✅ Arquivo .env criado!" -ForegroundColor Green
    Write-Host "⚠️  IMPORTANTE: Configure as variáveis necessárias no arquivo .env antes de continuar!" -ForegroundColor Yellow
    Write-Host ""
}

# Verificar se ngrok.yml tem o token configurado
$ngrokContent = Get-Content "ngrok.yml" -Raw -ErrorAction SilentlyContinue
if ($ngrokContent -match "SEU_NGROK_AUTH_TOKEN|your_token_here|CHANGE_THIS") {
    Write-Host "⚠️  Ngrok não configurado!" -ForegroundColor Yellow
    Write-Host "📝 Configure o authtoken no arquivo ngrok.yml" -ForegroundColor Yellow
    Write-Host "   1. Acesse: https://dashboard.ngrok.com" -ForegroundColor Cyan
    Write-Host "   2. Copie seu authtoken" -ForegroundColor Cyan
    Write-Host "   3. Edite o arquivo ngrok.yml e substitua o token" -ForegroundColor Cyan
    Write-Host ""
}

Write-Host "🐳 Construindo e iniciando containers..." -ForegroundColor Cyan
Write-Host "   Isso pode levar alguns minutos na primeira vez..." -ForegroundColor Gray
Write-Host ""

# Construir e iniciar containers
docker-compose up -d --build

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Aplicação iniciada com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Informações:" -ForegroundColor Cyan
    Write-Host "   • Aplicação local: http://localhost:3000" -ForegroundColor White
    Write-Host "   • Dashboard Ngrok: http://localhost:4040" -ForegroundColor White
    Write-Host "   • Para ver os logs: docker-compose logs -f" -ForegroundColor White
    Write-Host "   • Para parar: docker-compose down" -ForegroundColor White
    Write-Host ""
    Write-Host "🌐 Acesse o dashboard do Ngrok em http://localhost:4040 para ver a URL pública!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Erro ao iniciar a aplicação!" -ForegroundColor Red
    Write-Host "   Execute 'docker-compose logs' para ver os erros" -ForegroundColor Yellow
}

