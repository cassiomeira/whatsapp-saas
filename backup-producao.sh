#!/bin/bash

BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

echo "📦 Criando backup de produção..."

# Criar diretório de backups se não existir
mkdir -p $BACKUP_DIR

# Backup do banco de dados
if [ -f "production.db" ]; then
    cp production.db $BACKUP_DIR/production_$DATE.db
    echo "✅ Backup do banco de dados criado"
else
    echo "⚠️  Arquivo production.db não encontrado"
fi

if [ -f "production-backup.db" ]; then
    cp production-backup.db $BACKUP_DIR/production-backup_$DATE.db
    echo "✅ Backup do banco de backup criado"
fi

# Backup dos dados
if [ -d "data-prod" ]; then
    tar -czf $BACKUP_DIR/data-prod_$DATE.tar.gz data-prod/
    echo "✅ Backup dos dados criado"
else
    echo "⚠️  Diretório data-prod não encontrado"
fi

# Backup do .env.production
if [ -f ".env.production" ]; then
    cp .env.production $BACKUP_DIR/env_production_$DATE.env
    echo "✅ Backup do .env.production criado"
fi

echo ""
echo "✅ Backup completo criado em: $BACKUP_DIR/"
echo "📁 Arquivos:"
ls -lh $BACKUP_DIR/*$DATE*

# Manter apenas os últimos 10 backups
echo ""
echo "🧹 Limpando backups antigos (mantendo últimos 10)..."
cd $BACKUP_DIR
ls -t production_*.db 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null
ls -t data-prod_*.tar.gz 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null
cd ..

echo "✅ Backup finalizado!"

