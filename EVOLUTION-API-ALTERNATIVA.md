# 🔧 Evolution API - Configuração Alternativa

O container está dando erro de banco de dados. Vamos usar uma configuração mais simples e direta.

## 🚀 Opção 1: Usar comando Docker direto (Recomendado)

Execute este comando no terminal:

```powershell
docker run -d `
  --name evolution-api `
  -p 8080:8080 `
  -e AUTHENTICATION_API_KEY=NetcarSecret2024 `
  -e SERVER_URL=http://localhost:8080 `
  -v evolution-instances:/evolution/instances `
  -v evolution-database:/evolution/database `
  --restart unless-stopped `
  atendai/evolution-api:latest
```

## 🔍 Verificar se está funcionando

Aguarde alguns segundos e verifique:

```powershell
docker logs evolution-api
```

Se aparecer "Server is running" ou similar, está funcionando!

Teste no navegador: **http://localhost:8080/health**

## ⚙️ Opção 2: Usar imagem diferente

Se a imagem `atendai/evolution-api` não funcionar, tente:

```powershell
docker run -d `
  --name evolution-api `
  -p 8080:8080 `
  -e AUTHENTICATION_API_KEY=NetcarSecret2024 `
  -v evolution-instances:/evolution/instances `
  --restart unless-stopped `
  atendai/evolution-api:v2.0.0
```

Ou use a versão oficial:

```powershell
docker run -d `
  --name evolution-api `
  -p 8080:8080 `
  -e AUTHENTICATION_API_KEY=NetcarSecret2024 `
  -v evolution-instances:/evolution/instances `
  --restart unless-stopped `
  atendai/evolution-api:stable
```

## 🛠️ Comandos Úteis

```powershell
# Ver logs
docker logs -f evolution-api

# Parar
docker stop evolution-api

# Iniciar
docker start evolution-api

# Remover
docker rm -f evolution-api
```

## ✅ Depois que funcionar

Configure na aplicação (http://localhost:3000):
- **URL:** `http://localhost:8080`
- **API Key:** `NetcarSecret2024`

