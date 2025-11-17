# 🚀 Setup Dev + Produção no Mesmo Diretório

## 📋 Configuração Atual

- **Dev Local**: Porta **3000** (roda direto na máquina com `pnpm dev`)
- **Produção Docker**: Porta **3001** (roda em container Docker)
- **Mesmo diretório**: Ambos usam o mesmo código, mas com bancos/volumes separados

---

## ✅ Como Funciona

### Ambiente de Desenvolvimento (Porta 3000)
```bash
# Rodar dev local
pnpm dev

# Usa:
# - local.db (banco de dados)
# - ./data (volumes/sessões)
# - .env (variáveis de ambiente)
# - Porta 3000
```

### Ambiente de Produção (Porta 3001)
```bash
# Rodar produção em Docker
.\iniciar-producao.ps1  # Windows
# ou
./iniciar-producao.sh   # Linux/Mac

# Usa:
# - production.db (banco de dados SEPARADO)
# - ./data-prod (volumes/sessões SEPARADOS)
# - .env.production (variáveis de ambiente)
# - Porta 3001 no host -> 3000 no container
```

---

## 🎯 Iniciar os Ambientes

### Dev Local (Porta 3000)
```bash
# No diretório do projeto
pnpm dev

# Acesse: http://localhost:3000
```

### Produção Docker (Porta 3001)
```bash
# Windows
.\iniciar-producao.ps1

# Linux/Mac
chmod +x iniciar-producao.sh
./iniciar-producao.sh

# Acesse: http://localhost:3001
# OU com IP válido: http://SEU-IP:3001
```

---

## 🔀 Separação de Dados

### ✅ SEPARADO (Não compartilham dados):
- ✅ Banco de dados: `local.db` (dev) vs `production.db` (produção)
- ✅ Volumes: `./data` (dev) vs `./data-prod` (produção)
- ✅ Variáveis: `.env` (dev) vs `.env.production` (produção)
- ✅ Portas: 3000 (dev) vs 3001 (produção)
- ✅ Containers: Dev roda direto, Produção roda em Docker

### ⚠️ COMPARTILHADO (Atenção):
- ⚠️ Código fonte: Ambos usam o mesmo código
- ⚠️ Alterações no código afetarão ambos após rebuild

---

## 🔧 Configurar Produção

### 1. Criar `.env.production`

```bash
# Copiar exemplo (se existir)
cp .env.production.example .env.production

# OU criar manualmente
```

### 2. Editar `.env.production`

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=file:./production.db
JWT_SECRET=seu-secret-aqui

# IMPORTANTE: URL com porta 3001
VITE_APP_URL=http://SEU-IP-VALIDO:3001
# OU se usar domínio
# VITE_APP_URL=https://seu-dominio.com

# ... outras variáveis
```

### 3. Iniciar Produção

```bash
.\iniciar-producao.ps1
```

---

## 📊 Comandos Úteis

### Ver Status
```bash
# Ver containers Docker
docker ps

# Ver logs produção
docker-compose -f docker-compose.prod.yml logs -f app-prod

# Parar produção
docker-compose -f docker-compose.prod.yml down

# Iniciar produção
docker-compose -f docker-compose.prod.yml up -d
```

### Desenvolvimento
```bash
# Iniciar dev
pnpm dev

# Parar dev
Ctrl+C

# Build
pnpm build
```

---

## 🔄 Atualizar Produção

### Quando fazer alterações no código:

```bash
# 1. Parar produção
docker-compose -f docker-compose.prod.yml down

# 2. Fazer backup (recomendado)
.\backup-producao.sh  # ou backup-producao.sh no Linux

# 3. Atualizar código (se necessário)
git pull  # se usar git

# 4. Reconstruir e reiniciar produção
docker-compose -f docker-compose.prod.yml up -d --build

# 5. Verificar logs
docker-compose -f docker-compose.prod.yml logs -f app-prod
```

**⚠️ IMPORTANTE**: Alterações no código afetarão produção após rebuild!

---

## 🌐 Acessar via IP Válido

### Configurar Firewall

**Windows**:
```powershell
# Permitir porta 3001
netsh advfirewall firewall add rule name="WhatsApp SaaS Prod" dir=in action=allow protocol=TCP localport=3001
```

**Linux**:
```bash
sudo ufw allow 3001/tcp
```

### Configurar `.env.production`

```env
VITE_APP_URL=http://SEU-IP-VALIDO:3001
```

### Acessar

- Local: `http://localhost:3001`
- IP válido: `http://SEU-IP-VALIDO:3001`

---

## ⚠️ Atenção

1. **Código compartilhado**: Alterações no código afetarão ambos após rebuild da produção
2. **Banco separado**: Dev e produção têm bancos diferentes, mas código é o mesmo
3. **Portas diferentes**: Dev (3000) e Produção (3001) não conflitam
4. **Backup**: Sempre faça backup antes de atualizar produção

---

## 🆘 Troubleshooting

### Produção não inicia
```bash
# Ver logs
docker-compose -f docker-compose.prod.yml logs app-prod

# Verificar se porta 3001 está livre
netstat -an | grep 3001
```

### Conflito de porta
```bash
# Ver o que está usando a porta
# Windows
netstat -ano | findstr :3001

# Linux
sudo lsof -i :3001
```

### Container não responde
```bash
# Verificar status
docker ps

# Reiniciar container
docker-compose -f docker-compose.prod.yml restart app-prod
```

---

## ✅ Resumo

| Item | Dev Local | Produção Docker |
|------|-----------|-----------------|
| **Porta** | 3000 | 3001 |
| **Banco** | local.db | production.db |
| **Volumes** | ./data | ./data-prod |
| **Env** | .env | .env.production |
| **Comando** | `pnpm dev` | `.\iniciar-producao.ps1` |
| **URL Local** | http://localhost:3000 | http://localhost:3001 |
| **URL IP** | - | http://SEU-IP:3001 |

