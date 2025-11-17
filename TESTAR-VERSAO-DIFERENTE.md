# 🔄 Testar Versão Diferente da Evolution API

O erro 401 persistente pode ser um bug da versão v1.7.4. Vamos testar outras versões.

## 🧪 Teste 1: Versão Stable

```powershell
# Parar e remover container atual
docker stop evolution-api
docker rm evolution-api

# Testar versão stable
docker run -d --name evolution-api -p 8080:8080 -e AUTHENTICATION_API_KEY=NetcarSecret2024 -e SERVER_URL=http://localhost:8080 atendai/evolution-api:stable
```

## 🧪 Teste 2: Versão v2.0.0

```powershell
docker stop evolution-api
docker rm evolution-api

docker run -d --name evolution-api -p 8080:8080 -e AUTHENTICATION_API_KEY=NetcarSecret2024 -e SERVER_URL=http://localhost:8080 atendai/evolution-api:v2.0.0
```

## 🧪 Teste 3: Versão v1.8.0

```powershell
docker stop evolution-api
docker rm evolution-api

docker run -d --name evolution-api -p 8080:8080 -e AUTHENTICATION_API_KEY=NetcarSecret2024 -e SERVER_URL=http://localhost:8080 atendai/evolution-api:v1.8.0
```

## ✅ Após Mudar Versão

1. Aguarde 30 segundos para inicializar
2. Verifique logs: `docker logs evolution-api --tail=20`
3. Remova TODAS as instâncias antigas na aplicação
4. Crie uma nova instância
5. Teste o QR Code

## 📝 Verificar Versões Disponíveis

Você pode verificar versões disponíveis em:
- Docker Hub: https://hub.docker.com/r/atendai/evolution-api/tags
- Ou tentar: `docker pull atendai/evolution-api:stable`

---

**Recomendação:** Comece testando a versão `stable` primeiro.

