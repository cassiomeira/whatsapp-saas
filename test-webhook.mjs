// Script de teste de webhook
// Execute: node test-webhook.mjs

import axios from 'axios';

const EVOLUTION_API_URL = 'https://unpuckered-jacinda-sulphurously.ngrok-free.dev';
const API_KEY = 'NetcarSecret2024';
const INSTANCE_NAME = 'ws1_1761616761913'; // Substitua pelo nome da sua instância

async function testWebhook() {
  console.log('🔍 Testando configuração do webhook...\n');
  
  try {
    // 1. Verificar se a instância existe
    console.log('1️⃣ Verificando instância...');
    const statusResponse = await axios.get(
      `${EVOLUTION_API_URL}/instance/connectionState/${INSTANCE_NAME}`,
      { headers: { apikey: API_KEY } }
    );
    console.log('✅ Instância encontrada:', statusResponse.data);
    console.log('');
    
    // 2. Verificar configuração do webhook
    console.log('2️⃣ Verificando webhook configurado...');
    const webhookResponse = await axios.get(
      `${EVOLUTION_API_URL}/webhook/find/${INSTANCE_NAME}`,
      { headers: { apikey: API_KEY } }
    );
    console.log('✅ Webhook configurado:', JSON.stringify(webhookResponse.data, null, 2));
    console.log('');
    
    // 3. Testar se a URL do webhook está acessível
    console.log('3️⃣ Testando se URL do webhook está acessível...');
    const webhookUrl = webhookResponse.data.url || webhookResponse.data.webhook?.url;
    if (webhookUrl) {
      console.log(`   URL: ${webhookUrl}`);
      try {
        await axios.post(webhookUrl, { test: true }, { timeout: 5000 });
        console.log('✅ URL do webhook está acessível!');
      } catch (error) {
        console.log('❌ URL do webhook NÃO está acessível:', error.message);
        console.log('   Isso significa que a Evolution API não consegue enviar mensagens para o sistema!');
      }
    } else {
      console.log('❌ Webhook não configurado!');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
  }
}

testWebhook();

