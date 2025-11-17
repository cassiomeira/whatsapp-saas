Write-Host "Iniciando WhatsApp SaaS em MODO DESENVOLVIMENTO (DEV)..." -ForegroundColor Cyan
Write-Host ""

# 1) Garantir que as dependências estejam instaladas
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias (pnpm install)..." -ForegroundColor Yellow
    pnpm install
    Write-Host ""
}

# 2) Recriar .env de DEV com configuração correta (NÃO usa production.db)
Write-Host "Configurando .env para DEV (porta 3000, local.db)..." -ForegroundColor Yellow

$envContent = "NODE_ENV=development`n"
$envContent += "PORT=3000`n"
$envContent += "DATABASE_URL=file:./local.db`n"
$envContent += "JWT_SECRET=local-development-secret-key-change-in-production`n"
$envContent += "VITE_APP_ID=`n"
$envContent += "OAUTH_SERVER_URL=https://api.manus.im`n"
$envContent += "VITE_OAUTH_PORTAL_URL=https://auth.manus.im`n"
$envContent += "OWNER_OPEN_ID=local-user`n"
$envContent += "OWNER_NAME=Administrador`n"
$envContent += "BUILT_IN_FORGE_API_URL=https://api.openai.com`n"
$envContent += "BUILT_IN_FORGE_API_KEY=`n"
$envContent += "BUILT_IN_FORGE_MODEL=gpt-4o`n"
$envContent += "VITE_APP_TITLE=WhatsApp SaaS Platform`n"
$envContent += "VITE_APP_LOGO=https://via.placeholder.com/150`n"

[System.IO.File]::WriteAllText("$PWD\.env", $envContent, [System.Text.Encoding]::UTF8)
Write-Host "Arquivo .env para DEV recriado com sucesso." -ForegroundColor Green
Write-Host ""

# 3) Garantir banco de dados local (local.db)
if (-not (Test-Path "local.db")) {
    Write-Host "Inicializando banco de dados local.db (pnpm db:push)..." -ForegroundColor Yellow
    pnpm db:push
    Write-Host ""
}

Write-Host "Tudo pronto! Subindo servidor de desenvolvimento na porta 3000..." -ForegroundColor Cyan
Write-Host "Acesse: http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "Para parar, pressione Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

pnpm dev


