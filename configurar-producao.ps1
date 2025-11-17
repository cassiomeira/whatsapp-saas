# Script para configurar produção com IP válido
Write-Host "🔧 Configurando produção com IP válido..." -ForegroundColor Cyan
Write-Host ""

# IP válido
$IP_VALIDO = "177.184.190.62"
$PORTA = "3001"

# Verificar se .env.production existe
if (Test-Path ".env.production") {
    Write-Host "📝 Arquivo .env.production já existe. Atualizando..." -ForegroundColor Yellow
    
    # Ler arquivo atual
    $content = Get-Content ".env.production" -Raw
    
    # Atualizar VITE_APP_URL
    $content = $content -replace "VITE_APP_URL=.*", "VITE_APP_URL=http://$IP_VALIDO`:$PORTA"
    
    # Salvar
    $content | Out-File -FilePath ".env.production" -Encoding UTF8 -NoNewline
    
    Write-Host "✅ .env.production atualizado com IP: $IP_VALIDO`:$PORTA" -ForegroundColor Green
} else {
    Write-Host "📝 Criando .env.production..." -ForegroundColor Yellow
    
    # Gerar JWT secret
    $jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
    
    # Criar arquivo
    @"
# Ambiente de PRODUÇÃO
# IP válido configurado: $IP_VALIDO:$PORTA

NODE_ENV=production
PORT=3000
DATABASE_URL=file:./production.db

# JWT Secret (gerado automaticamente)
JWT_SECRET=$jwtSecret

# OAuth
VITE_APP_ID=
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://auth.manus.im
OWNER_OPEN_ID=
OWNER_NAME=Administrador Produção

# Forge API
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=
BUILT_IN_FORGE_MODEL=gpt-4o

# App
VITE_APP_TITLE=WhatsApp SaaS - Produção
VITE_APP_LOGO=https://via.placeholder.com/150

# URL Base - IP VÁLIDO CONFIGURADO
VITE_APP_URL=http://$IP_VALIDO`:$PORTA
"@ | Out-File -FilePath ".env.production" -Encoding UTF8
    
    Write-Host "✅ .env.production criado com IP: $IP_VALIDO`:$PORTA" -ForegroundColor Green
    Write-Host "✅ JWT_SECRET gerado automaticamente" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ Configuração concluída!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Próximos passos:" -ForegroundColor Cyan
Write-Host "   1. Configure as variáveis no .env.production (se necessário)" -ForegroundColor White
Write-Host "   2. Execute: .\iniciar-producao.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Host "🌐 URL de acesso: http://$IP_VALIDO`:$PORTA" -ForegroundColor Green

