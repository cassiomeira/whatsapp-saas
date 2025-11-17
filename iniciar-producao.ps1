# Script para iniciar producao em Docker
Write-Host "Iniciando WhatsApp SaaS em PRODUCAO..." -ForegroundColor Cyan

# Verificar se .env.production existe
if (-not (Test-Path ".env.production")) {
    Write-Host "Arquivo .env.production nao encontrado!" -ForegroundColor Red
    Write-Host "Criando .env.production basico..." -ForegroundColor Yellow
    
    # Gerar JWT secret
    $jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
    
    # Criar conteudo do .env.production
    $envContent = "NODE_ENV=production`n"
    $envContent += "PORT=3000`n"
    $envContent += "DATABASE_URL=file:./production.db`n"
    $envContent += "JWT_SECRET=$jwtSecret`n"
    $envContent += "VITE_APP_ID=`n"
    $envContent += "OAUTH_SERVER_URL=https://api.manus.im`n"
    $envContent += "VITE_OAUTH_PORTAL_URL=https://auth.manus.im`n"
    $envContent += "OWNER_OPEN_ID=`n"
    $envContent += "OWNER_NAME=Administrador Producao`n"
    $envContent += "BUILT_IN_FORGE_API_URL=https://api.manus.im`n"
    $envContent += "BUILT_IN_FORGE_API_KEY=`n"
    $envContent += "BUILT_IN_FORGE_MODEL=gpt-4o`n"
    $envContent += "VITE_APP_TITLE=WhatsApp SaaS - Producao`n"
    $envContent += "VITE_APP_LOGO=https://via.placeholder.com/150`n"
    $envContent += "VITE_APP_URL=http://177.184.190.62:3001`n"
    
    # Salvar arquivo
    [System.IO.File]::WriteAllText("$PWD\.env.production", $envContent, [System.Text.Encoding]::UTF8)
    
    Write-Host "Arquivo .env.production criado!" -ForegroundColor Green
    Write-Host "IP valido configurado: 177.184.190.62:3001" -ForegroundColor Green
    Write-Host "IMPORTANTE: Configure JWT_SECRET e outras variaveis se necessario" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Continuando com a inicializacao..." -ForegroundColor Cyan
    Start-Sleep -Seconds 2
}

# Parar containers antigos
Write-Host "Parando containers antigos..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml down

# Construir e iniciar
Write-Host "Construindo e iniciando containers..." -ForegroundColor Cyan
docker-compose -f docker-compose.prod.yml up -d --build

# Aguardar alguns segundos
Write-Host "Aguardando inicializacao..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# Mostrar status
Write-Host ""
Write-Host "Status dos containers:" -ForegroundColor Cyan
docker-compose -f docker-compose.prod.yml ps

Write-Host ""
Write-Host "Producao iniciada!" -ForegroundColor Green
Write-Host ""
Write-Host "URLs de acesso:" -ForegroundColor Cyan
Write-Host "   Local:     http://localhost:3001" -ForegroundColor White
Write-Host "   IP valido: http://177.184.190.62:3001" -ForegroundColor Green
Write-Host ""
Write-Host "Comandos uteis:" -ForegroundColor Cyan
Write-Host "   Ver logs:  docker-compose -f docker-compose.prod.yml logs -f app-prod" -ForegroundColor Yellow
Write-Host "   Parar:     docker-compose -f docker-compose.prod.yml down" -ForegroundColor Yellow
Write-Host ""
Write-Host "Producao Docker na porta 3001 | Dev local na porta 3000" -ForegroundColor Gray
