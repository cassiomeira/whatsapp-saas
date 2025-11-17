# 📥 Instalação no Windows - Passo a Passo

## 🔧 Passo 1: Instalar Node.js

1. **Baixe o Node.js:**
   - Acesse: https://nodejs.org/
   - Baixe a versão **LTS** (Long Term Support)
   - Versão recomendada: **Node.js 20.x ou superior**

2. **Instale o Node.js:**
   - Execute o instalador baixado
   - Siga o assistente de instalação
   - ✅ **IMPORTANTE:** Marque a opção "Add to PATH" durante a instalação

3. **Verifique a instalação:**
   - Abra um **NOVO** PowerShell (feche e abra novamente)
   - Execute:
     ```powershell
     node --version
     ```
   - Deve mostrar algo como: `v20.x.x`

---

## 📦 Passo 2: Instalar pnpm

No PowerShell, execute:

```powershell
npm install -g pnpm
```

**Verifique a instalação:**
```powershell
pnpm --version
```
Deve mostrar algo como: `10.x.x`

---

## 🚀 Passo 3: Instalar Dependências do Projeto

1. **Navegue até a pasta do projeto:**
   ```powershell
   cd "c:\WHATSAPP\whatsapp-saastestenovofinalcorreto\whatsapp-saastestenovo"
   ```

2. **Instale as dependências:**
   ```powershell
   pnpm install
   ```
   
   Isso pode levar alguns minutos na primeira vez.

---

## 📝 Passo 4: Configurar Variáveis de Ambiente

1. **Verifique se o arquivo `.env` existe**
2. Se não existir, crie um baseado no `.env.example` ou use o script:
   ```powershell
   .\iniciar.ps1
   ```
   (O script criará o `.env` automaticamente se não existir)

---

## 🗄️ Passo 5: Inicializar Banco de Dados

```powershell
pnpm db:push
```

---

## ▶️ Passo 6: Iniciar a Aplicação

### Opção 1: Usar o script automático
```powershell
.\iniciar.ps1
```

### Opção 2: Comando manual
```powershell
pnpm dev
```

A aplicação estará disponível em: **http://localhost:3000**

---

## 🌐 Passo 7: Configurar Ngrok (Opcional)

### 7.1 Baixar Ngrok

1. Acesse: https://ngrok.com/download
2. Baixe a versão para Windows
3. Extraia o arquivo `ngrok.exe`
4. Coloque em uma pasta (ex: `C:\ngrok\`)

### 7.2 Adicionar ao PATH (Opcional)

Para usar `ngrok` de qualquer lugar:

1. Copie o caminho da pasta (ex: `C:\ngrok`)
2. Abra "Variáveis de Ambiente" do Windows
3. Adicione o caminho na variável `Path`

Ou use o caminho completo ao executar.

### 7.3 Autenticar Ngrok

```powershell
ngrok config add-authtoken SEU_AUTHTOKEN_AQUI
```

(O authtoken você pega em: https://dashboard.ngrok.com/get-started/your-authtoken)

### 7.4 Iniciar Ngrok

Em um **novo terminal**, execute:

```powershell
ngrok http 3000
```

Você verá uma URL pública tipo: `https://abc123.ngrok-free.app`

---

## ✅ Pronto!

Agora você pode:

- **Aplicação local:** http://localhost:3000
- **URL pública (Ngrok):** Veja no terminal do Ngrok

---

## 🛠️ Comandos Úteis

```powershell
# Desenvolvimento (com hot reload)
pnpm dev

# Build para produção
pnpm build

# Rodar em produção
pnpm start

# Atualizar banco de dados
pnpm db:push

# Verificar tipos
pnpm check
```

---

## ⚠️ Problemas Comuns

### "node não é reconhecido"
- **Solução:** Reinstale o Node.js e marque "Add to PATH"
- Ou reinicie o PowerShell/Terminal

### "pnpm não é reconhecido"
- **Solução:** Execute `npm install -g pnpm` novamente
- Ou reinicie o PowerShell

### "Port 3000 is already in use"
- **Solução:** Altere `PORT=3001` no arquivo `.env`

### Erro ao instalar dependências
- **Solução:** 
  ```powershell
  pnpm install --force
  ```

