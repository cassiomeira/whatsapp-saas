# Use Node.js 20 como base
FROM node:20-slim

# Variáveis de build para Supabase (passadas via docker-compose/Render)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Disponibilizar durante todo o processo de build (especialmente pnpm build)
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Instalar dependências do sistema necessárias (incluindo Chrome para Puppeteer)
RUN apt-get update && apt-get install -y \
    git \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# Criar link para chromium-browser (Puppeteer espera esse nome)
RUN ln -sf /usr/bin/chromium /usr/bin/chromium-browser || true

# Instalar pnpm globalmente
RUN npm install -g pnpm@10.4.1

# Definir diretório de trabalho
WORKDIR /app

# Copiar tudo de uma vez
COPY . .

# Configurar pnpm
RUN pnpm config set store-dir /root/.pnpm-store

# Instalar dependências
# Forçar download do Chromium do Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
RUN pnpm install

# Baixar Chromium manualmente se necessário
RUN npx puppeteer browsers install chrome || echo "Chromium download skipped"

# Build da aplicação
RUN pnpm build

# Copiar e tornar executável o script de entrada
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Expor a porta 3000
EXPOSE 3000

# Usar o script de entrada
ENTRYPOINT ["/app/docker-entrypoint.sh"]