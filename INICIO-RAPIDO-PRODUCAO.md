# 🚀 Início Rápido - Produção

## ✅ Configuração Concluída!

Tudo está pronto para iniciar produção com IP válido: **177.184.190.62**

---

## 🎯 Iniciar Produção

### Windows (PowerShell):
```powershell
.\iniciar-producao.ps1
```

### Linux/Mac:
```bash
chmod +x iniciar-producao.sh
./iniciar-producao.sh
```

---

## 🌐 URLs de Acesso

- **Local**: http://localhost:3001
- **IP válido**: http://177.184.190.62:3001

---

## ⚙️ Configuração Automática

O script `iniciar-producao.ps1` (ou `.sh`) cria automaticamente o `.env.production` com:
- ✅ IP válido configurado: `177.184.190.62:3001`
- ✅ Banco de dados: `production.db` (separado do dev)
- ✅ Volumes: `./data-prod` (separado do dev)
- ✅ Porta: 3001 (Docker) - não conflita com dev (3000)

---

## 🔧 Configurar Variáveis (Opcional)

Se precisar ajustar alguma variável, edite `.env.production`:

```env
# IP já configurado
VITE_APP_URL=http://177.184.190.62:3001

# Configure estas se necessário:
JWT_SECRET=seu-jwt-secret-aqui
BUILT_IN_FORGE_API_KEY=sua-api-key-aqui
VITE_APP_ID=seu-app-id-aqui
# ... outras variáveis
```

---

## 🛡️ Configurar Firewall

### Windows:
```powershell
# Permitir porta 3001
netsh advfirewall firewall add rule name="WhatsApp SaaS Prod" dir=in action=allow protocol=TCP localport=3001
```

### Linux:
```bash
sudo ufw allow 3001/tcp
```

---

## 📊 Comandos Úteis

### Ver Logs:
```bash
docker-compose -f docker-compose.prod.yml logs -f app-prod
```

### Parar Produção:
```bash
docker-compose -f docker-compose.prod.yml down
```

### Ver Status:
```bash
docker ps
docker-compose -f docker-compose.prod.yml ps
```

### Reiniciar:
```bash
docker-compose -f docker-compose.prod.yml restart app-prod
```

### Atualizar (após mudanças no código):
```bash
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## 🔀 Separação Dev vs Produção

| Item | Dev Local | Produção Docker |
|------|-----------|-----------------|
| **Porta** | 3000 | 3001 |
| **Banco** | local.db | production.db |
| **Volumes** | ./data | ./data-prod |
| **Env** | .env | .env.production |
| **Comando** | `pnpm dev` | `.\iniciar-producao.ps1` |

✅ **Totalmente separados** - não há conflito!

---

## ✅ Checklist Antes de Iniciar

- [ ] Docker está rodando
- [ ] Porta 3001 disponível
- [ ] Firewall configurado (se necessário)
- [ ] Variáveis configuradas no `.env.production` (se necessário)

---

## 🆘 Problemas Comuns

### Container não inicia:
```bash
# Ver logs
docker-compose -f docker-compose.prod.yml logs app-prod

# Verificar se porta está livre
netstat -an | grep 3001
```

### Não consegue acessar via IP:
1. Verificar firewall
2. Verificar se porta está aberta no roteador
3. Testar localmente primeiro: http://localhost:3001

### Precisa reconfigurar IP:
1. Edite `.env.production`
2. Altere `VITE_APP_URL=http://NOVO-IP:3001`
3. Reinicie: `docker-compose -f docker-compose.prod.yml restart app-prod`

---

## 🎉 Pronto!

Execute `.\iniciar-producao.ps1` e acesse: **http://177.184.190.62:3001**

