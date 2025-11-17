# 🚀 Como Subir o Projeto - Docker + Ngrok + Baileys

Este guia rápido mostra como subir seu SaaS de atendimento WhatsApp usando Docker e Ngrok.

## ✅ O que já está configurado

- ✅ Dockerfile com todas as dependências do Puppeteer/Chrome
- ✅ docker-compose.yml com aplicação e ngrok ativados
- ✅ Baileys (via whatsapp-web.js) já configurado e funcionando
- ✅ Script de inicialização automática

## 🚀 Iniciar tudo (Modo Rápido)

### Windows (PowerShell):

```powershell
.\iniciar-docker.ps1
```

### Linux/Mac:

```bash
docker-compose up -d --build
```

## 📋 Passos Manuais (Se necessário)

### 1. Verificar Ngrok Token

Edite o arquivo `ngrok.yml` e verifique se o authtoken está correto:

```yaml
version: "3"
agent:
  authtoken: SEU_TOKEN_AQUI
tunnels:
  whatsapp:
    addr: app:3000
    proto: http
    schemes:
      - https
```

**Para obter o token:**
1. Acesse: https://dashboard.ngrok.com
2. Faça login ou crie uma conta gratuita
3. Copie seu authtoken
4. Cole no arquivo `ngrok.yml`

### 2. Configurar Variáveis de Ambiente (Opcional)

Se necessário, crie um arquivo `.env` na raiz do projeto:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=file:./local.db
JWT_SECRET=sua-chave-secreta-aqui
VITE_APP_ID=
OWNER_OPEN_ID=
```

> **Nota:** O docker-entrypoint.sh cria um `.env` básico automaticamente se não existir.

### 3. Subir os Containers

```bash
docker-compose up -d --build
```

**O que isso faz:**
- Constrói a imagem Docker da aplicação
- Instala todas as dependências (incluindo Puppeteer/Chrome)
- Inicia a aplicação na porta 3000
- Inicia o Ngrok para expor publicamente
- Inicia Redis e PostgreSQL (para Evolution API - opcional)

## 🌐 Acessar a Aplicação

- **Local:** http://localhost:3000
- **Público (Ngrok):** http://localhost:4040 (veja a URL no dashboard do Ngrok)

## 📊 Ver Logs

```bash
# Todos os serviços
docker-compose logs -f

# Apenas a aplicação
docker-compose logs -f app

# Apenas ngrok
docker-compose logs -f ngrok
```

## 🛑 Parar tudo

```bash
docker-compose down
```

## 🔄 Reiniciar

```bash
docker-compose restart
```

## ❓ Problemas Comuns

### Container não inicia
```bash
# Ver logs detalhados
docker-compose logs app

# Reconstruir tudo
docker-compose down
docker-compose up -d --build
```

### Porta 3000 já em uso
Edite `docker-compose.yml` e altere:
```yaml
ports:
  - "3001:3000"  # Use outra porta
```

### Ngrok não conecta
1. Verifique se o token no `ngrok.yml` está correto
2. Verifique os logs: `docker-compose logs ngrok`
3. Certifique-se que a aplicação está rodando: `docker-compose ps`

### Chrome/Puppeteer não funciona
O Dockerfile já inclui todas as dependências necessárias. Se ainda houver problemas:
- Verifique os logs: `docker-compose logs app`
- Certifique-se que o build foi completo: `docker-compose build --no-cache`

## ✅ Checklist Final

Antes de usar, verifique:

- [ ] Docker Desktop está rodando
- [ ] Ngrok token configurado no `ngrok.yml`
- [ ] Arquivo `.env` existe (ou será criado automaticamente)
- [ ] Portas 3000 e 4040 estão livres
- [ ] Containers iniciaram corretamente: `docker-compose ps`

## 🎉 Pronto!

Seu SaaS de atendimento WhatsApp está rodando com:
- ✅ Docker (conteinerização)
- ✅ Ngrok (exposição pública)
- ✅ Baileys/whatsapp-web.js (WhatsApp)

**Próximo passo:** Acesse http://localhost:3000 e crie sua primeira instância WhatsApp!

