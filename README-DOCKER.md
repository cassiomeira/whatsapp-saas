# 🚀 Início Rápido - Docker + Ngrok

## ⚡ Passos Rápidos (5 minutos)

### 1️⃣ Instalar Docker Desktop
- Baixe: https://www.docker.com/products/docker-desktop/
- Instale e inicie o Docker Desktop

### 2️⃣ Configurar Ngrok
1. Crie conta em: https://dashboard.ngrok.com/signup
2. Copie seu **authtoken**
3. Abra `ngrok.yml` e cole o token no lugar de `SEU_NGROK_AUTH_TOKEN_AQUI`

### 3️⃣ Configurar Variáveis
1. Execute o script de setup:
   ```powershell
   .\setup.ps1
   ```
2. Edite o arquivo `.env` e preencha as variáveis (especialmente `JWT_SECRET`)

### 4️⃣ Subir o Projeto
```powershell
docker-compose up -d --build
```

### 5️⃣ Acessar
- **Local:** http://localhost:3000
- **Público:** http://localhost:4040 (veja a URL do Ngrok aqui)

---

## 📚 Documentação Completa

Veja o arquivo **`GUIA-SIMPLES.md`** para instruções detalhadas e solução de problemas.

---

## 🛠️ Comandos Úteis

```powershell
# Ver logs
docker-compose logs -f

# Parar
docker-compose down

# Reiniciar
docker-compose restart

# Reconstruir tudo
docker-compose down
docker-compose up -d --build
```

---

## ❓ Problemas?

1. **Porta 3000 ocupada?** → Altere no `docker-compose.yml`
2. **Erro no Ngrok?** → Verifique o token no `ngrok.yml`
3. **Container não inicia?** → Veja os logs: `docker-compose logs app`

---

✅ **Pronto!** Seu projeto está rodando! 🎉

