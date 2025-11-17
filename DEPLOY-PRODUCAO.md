# 🚀 Guia de Deploy para Produção

Este guia explica como colocar o sistema em produção localmente usando um IP válido, mantendo o ambiente de desenvolvimento separado.

## 📋 Índice

1. [Separação Dev vs Produção](#separação-dev-vs-produção)
2. [Pré-requisitos](#pré-requisitos)
3. [Configuração do Ambiente de Produção](#configuração-do-ambiente-de-produção)
4. [Deploy em Produção](#deploy-em-produção)
5. [Uso do IP Válido](#uso-do-ip-válido)
6. [Atualizações e Manutenção](#atualizações-e-manutenção)

---

## 🔀 Separação Dev vs Produção

### ✅ As alterações em DEV NÃO afetam PRODUÇÃO se:

1. **Diretórios separados**: Produção em pasta diferente (ex: `/produção/whatsapp-saas`)
2. **Docker separado**: Usa `docker-compose.prod.yml` com nomes de containers diferentes
3. **Banco de dados separado**: Produção usa `production.db` e dev usa `local.db`
4. **Volumes separados**: Dados de produção em `./data-prod` e dev em `./data`

### ⚠️ Atenção

- Se usar a **mesma pasta** para dev e produção: alterações afetarão ambos
- Se usar o **mesmo banco de dados**: dados serão compartilhados
- Se usar os **mesmos volumes**: sessões WhatsApp serão compartilhadas

**RECOMENDAÇÃO**: Use diretórios completamente separados para dev e produção.

---

## 📦 Pré-requisitos

1. Docker e Docker Compose instalados
2. Ngrok instalado localmente (ou usar servidor com IP válido)
3. IP válido configurado no seu roteador/servidor
4. Porta 3000 (ou outra) disponível para produção

---

## ⚙️ Configuração do Ambiente de Produção

### 1. Criar Diretório de Produção

```bash
# Criar diretório separado para produção
mkdir -p ~/whatsapp-saas-prod
cd ~/whatsapp-saas-prod

# Copiar arquivos do projeto (ou clonar do git)
cp -r /caminho/do/projeto/dev/* .
# OU
git clone <seu-repositorio> .
```

### 2. Criar Arquivo de Ambiente de Produção

Crie `.env.production`:

```env
# Ambiente
NODE_ENV=production
PORT=3000

# Banco de Dados (SEPARADO do dev)
DATABASE_URL=file:./production.db

# JWT Secret (GERAR NOVO para produção)
JWT_SECRET=seu-jwt-secret-super-seguro-para-producao

# OAuth
VITE_APP_ID=seu-app-id-producao
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://auth.manus.im
OWNER_OPEN_ID=seu-owner-open-id-producao
OWNER_NAME=Administrador Produção

# Forge API
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=sua-api-key-producao
BUILT_IN_FORGE_MODEL=gpt-4o

# App
VITE_APP_TITLE=WhatsApp SaaS - Produção
VITE_APP_LOGO=https://via.placeholder.com/150

# URL Base (IMPORTANTE para produção com IP válido)
VITE_APP_URL=http://SEU-IP-VALIDO:3000
# OU se usar domínio
# VITE_APP_URL=https://seu-dominio.com
```

### 3. Gerar JWT Secret Seguro

```bash
# Gerar secret seguro
openssl rand -base64 32
```

---

## 🚀 Deploy em Produção

### Opção 1: Usando Docker Compose (Recomendado)

#### 1.1. Criar `docker-compose.prod.yml`

```yaml
version: '3.8'

services:
  # Aplicação WhatsApp SaaS - PRODUÇÃO
  app-prod:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: whatsapp-saas-prod
    ports:
      - "3000:3000"  # Mudar porta se necessário (ex: 3001)
    environment:
      - NODE_ENV=production
      - PORT=3000
    env_file:
      - .env.production
    volumes:
      - ./production.db:/app/production.db
      - ./production-backup.db:/app/production-backup.db
      - ./data-prod:/app/data
    restart: unless-stopped
    networks:
      - whatsapp-prod-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

networks:
  whatsapp-prod-network:
    driver: bridge
```

#### 1.2. Criar Script de Inicialização

Crie `iniciar-producao.sh`:

```bash
#!/bin/bash

echo "🚀 Iniciando WhatsApp SaaS em PRODUÇÃO..."

# Verificar se .env.production existe
if [ ! -f ".env.production" ]; then
    echo "❌ Arquivo .env.production não encontrado!"
    echo "📝 Crie o arquivo .env.production antes de iniciar"
    exit 1
fi

# Copiar .env.production para .env (para o container)
cp .env.production .env

# Parar containers antigos
docker-compose -f docker-compose.prod.yml down

# Construir e iniciar
docker-compose -f docker-compose.prod.yml up -d --build

# Mostrar logs
docker-compose -f docker-compose.prod.yml logs -f app-prod
```

Tornar executável:

```bash
chmod +x iniciar-producao.sh
```

#### 1.3. Iniciar Produção

```bash
./iniciar-producao.sh
```

### Opção 2: Usando Script PowerShell (Windows)

Crie `iniciar-producao.ps1`:

```powershell
Write-Host "🚀 Iniciando WhatsApp SaaS em PRODUÇÃO..." -ForegroundColor Cyan

# Verificar se .env.production existe
if (-not (Test-Path ".env.production")) {
    Write-Host "❌ Arquivo .env.production não encontrado!" -ForegroundColor Red
    Write-Host "📝 Crie o arquivo .env.production antes de iniciar" -ForegroundColor Yellow
    exit 1
}

# Copiar .env.production para .env (para o container)
Copy-Item ".env.production" ".env" -Force

# Parar containers antigos
docker-compose -f docker-compose.prod.yml down

# Construir e iniciar
docker-compose -f docker-compose.prod.yml up -d --build

Write-Host "✅ Produção iniciada!" -ForegroundColor Green
Write-Host "📊 Ver logs: docker-compose -f docker-compose.prod.yml logs -f app-prod" -ForegroundColor Yellow
```

---

## 🌐 Uso do IP Válido

### Opção A: IP Público Direto

1. **Configurar Firewall**:

```bash
# Linux (UFW)
sudo ufw allow 3000/tcp

# Windows Firewall
netsh advfirewall firewall add rule name="WhatsApp SaaS" dir=in action=allow protocol=TCP localport=3000
```

2. **Acessar via IP**:

```
http://SEU-IP-VALIDO:3000
```

3. **Atualizar `.env.production`**:

```env
VITE_APP_URL=http://SEU-IP-VALIDO:3000
```

### Opção B: Usando Ngrok (Recomendado para teste/desenvolvimento)

1. **Instalar Ngrok** (se ainda não tiver):

```bash
# Windows: baixar de https://ngrok.com/download
# Linux/Mac:
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok
```

2. **Configurar Ngrok**:

Edite `ngrok.yml`:

```yaml
version: "3"
agent:
  authtoken: SEU-AUTHTOKEN-NGROK
tunnels:
  whatsapp-prod:
    addr: localhost:3000
    proto: http
    schemes:
      - https
    inspect: false
```

3. **Iniciar Ngrok**:

```bash
ngrok start --all --config ngrok.yml
```

4. **Acessar via URL do Ngrok**:

```
https://seu-dominio-ngrok.ngrok.io
```

5. **Atualizar `.env.production`**:

```env
VITE_APP_URL=https://seu-dominio-ngrok.ngrok.io
```

### Opção C: Usando Domínio Próprio

1. **Configurar DNS**: Apontar domínio para seu IP válido
2. **Configurar Proxy Reverso** (Nginx/Traefik) se necessário
3. **Usar HTTPS** com Let's Encrypt

---

## 🔄 Atualizações e Manutenção

### Atualizar Código em Produção (sem afetar dev)

```bash
# 1. Ir para diretório de produção
cd ~/whatsapp-saas-prod

# 2. Fazer backup do banco
cp production.db production.db.backup.$(date +%Y%m%d_%H%M%S)

# 3. Atualizar código (se usar git)
git pull origin main

# 4. Reconstruir e reiniciar
docker-compose -f docker-compose.prod.yml up -d --build

# 5. Verificar logs
docker-compose -f docker-compose.prod.yml logs -f app-prod
```

### Fazer Backup Regular

Crie `backup-producao.sh`:

```bash
#!/bin/bash

BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup do banco
cp production.db $BACKUP_DIR/production_$DATE.db
cp production-backup.db $BACKUP_DIR/production-backup_$DATE.db

# Backup dos dados
tar -czf $BACKUP_DIR/data-prod_$DATE.tar.gz data-prod/

echo "✅ Backup criado: $BACKUP_DIR/"
```

### Verificar Status

```bash
# Ver status dos containers
docker-compose -f docker-compose.prod.yml ps

# Ver logs
docker-compose -f docker-compose.prod.yml logs -f app-prod

# Ver uso de recursos
docker stats whatsapp-saas-prod
```

---

## 🛡️ Segurança em Produção

### Checklist de Segurança

- [ ] JWT_SECRET único e seguro gerado
- [ ] API keys protegidas e não compartilhadas
- [ ] Firewall configurado corretamente
- [ ] HTTPS configurado (se usar domínio)
- [ ] Backups automáticos configurados
- [ ] Logs sendo monitorados
- [ ] Senhas fortes para acesso
- [ ] Portas desnecessárias fechadas

---

## 📊 Monitoramento

### Health Check

```bash
# Verificar se aplicação está respondendo
curl http://SEU-IP-VALIDO:3000/health

# Verificar logs
docker-compose -f docker-compose.prod.yml logs -f app-prod
```

### Métricas

```bash
# CPU e memória
docker stats whatsapp-saas-prod

# Espaço em disco
df -h
```

---

## 🆘 Troubleshooting

### Container não inicia

```bash
# Ver logs detalhados
docker-compose -f docker-compose.prod.yml logs app-prod

# Verificar se porta está disponível
netstat -an | grep 3000
```

### Banco de dados corrompido

```bash
# Restaurar backup
cp backups/production_YYYYMMDD_HHMMSS.db production.db

# Reiniciar
docker-compose -f docker-compose.prod.yml restart app-prod
```

### Não consegue acessar via IP

1. Verificar firewall
2. Verificar se porta está aberta
3. Verificar se aplicação está rodando: `docker ps`
4. Testar localmente primeiro: `curl http://localhost:3000`

---

## ✅ Resumo

1. **DEV e PRODUÇÃO estão SEPARADOS** se usarem:
   - Diretórios diferentes
   - `docker-compose.yml` vs `docker-compose.prod.yml`
   - `local.db` vs `production.db`
   - `./data` vs `./data-prod`

2. **Alterações em DEV NÃO afetam PRODUÇÃO** se fizer backup antes de atualizar

3. **IP válido**: Configure firewall e acesse via `http://SEU-IP:3000`

4. **Manutenção**: Faça backups regulares e monitore logs

---

## 📞 Suporte

Para dúvidas ou problemas, verifique os logs primeiro:

```bash
docker-compose -f docker-compose.prod.yml logs -f
```

