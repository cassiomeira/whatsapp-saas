# 🚀 Rodar Localmente (Sem Docker)

## ✅ Pré-requisitos

1. **Node.js 20+** - [Baixar aqui](https://nodejs.org/)
2. **pnpm** - Será instalado automaticamente

## 🚀 Início Rápido

### Windows (PowerShell):

```powershell
.\iniciar.ps1
```

Este script automaticamente:
- ✅ Instala dependências se necessário
- ✅ Cria arquivo `.env` se não existir
- ✅ Inicializa banco de dados se necessário
- ✅ Inicia o servidor em modo desenvolvimento

### Manual:

```powershell
# 1. Instalar dependências
pnpm install

# 2. Configurar .env (o script cria automaticamente, mas você pode editar)
# Edite o arquivo .env se necessário

# 3. Inicializar banco de dados (se não existir)
pnpm db:push

# 4. Iniciar servidor em desenvolvimento
pnpm dev
```

## 📋 Comandos Disponíveis

```powershell
# Desenvolvimento (com hot reload)
pnpm dev

# Build para produção
pnpm build

# Rodar em produção (após build)
pnpm start

# Verificar tipos TypeScript
pnpm check

# Atualizar banco de dados
pnpm db:push
```

## 🔧 Configuração (.env)

O script `iniciar.ps1` cria um `.env` básico automaticamente. Você pode editá-lo:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=file:./local.db
JWT_SECRET=local-development-secret-key-change-in-production
VITE_APP_ID=
OWNER_OPEN_ID=local-user
OWNER_NAME=Administrador
BUILT_IN_FORGE_API_URL=https://api.openai.com
BUILT_IN_FORGE_API_KEY=
BUILT_IN_FORGE_MODEL=gpt-4o
```

## 🌐 Acessar

Após iniciar, a aplicação estará disponível em:

**http://localhost:3000**

## 🐛 Solução de Problemas

### Erro: "pnpm não encontrado"
```powershell
npm install -g pnpm
```

### Erro: "Porta 3000 já em uso"
Altere no `.env`:
```env
PORT=3001
```

### Erro: Banco de dados não encontrado
```powershell
pnpm db:push
```

### Erro: Chrome/Puppeteer não encontrado
O Puppeteer baixa o Chrome automaticamente. Se tiver problemas:
```powershell
# Limpar cache do Puppeteer e reinstalar
rm -r node_modules/.cache
pnpm install --force
```

## 📝 Diferenças: Docker vs Local

| Recurso | Docker | Local |
|---------|--------|-------|
| Instalação | Mais complexa | Simples |
| Isolamento | Completo | Usa recursos do sistema |
| Performance | Pode ser mais lenta | Geralmente mais rápida |
| Hot Reload | ❌ Precisa rebuild | ✅ Automático |
| Debug | Mais difícil | Mais fácil |

## ✅ Vantagens de Rodar Localmente

- ⚡ **Hot reload** - Mudanças aparecem instantaneamente
- 🐛 **Debug mais fácil** - Usar debugger do VS Code
- 📦 **Sem overhead do Docker** - Performance melhor
- 🔧 **Acesso direto aos arquivos** - Mais fácil de editar

## 🎉 Pronto!

Agora você pode desenvolver localmente com hot reload! 🚀

