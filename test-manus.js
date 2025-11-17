// test-manus.js
import OpenAI from "openai";

const manusClient = new OpenAI({
  baseURL: "https://api.manus.im/openai/v1", // 🔄 tente também /openai se necessário
  apiKey: "**",
  defaultHeaders: {
    API_KEY: "sk-YzQB4-BCYRHJWtYnlnQKblCxOETgxo87SsaA06e9FqFnbWqxjFT_MnXPFhyUtEXEb2BHcn5L1VQRbYXX4HBMq8dGFD5K",
  },
});

async function testar() {
  console.log("🔑 Testando Manus API (responses.create)...");

  try {
    const resposta = await manusClient.responses.create({
      model: "manus-agent-quality",
      input: [
        { role: "system", content: "Você é um atendente da Drogaria Nunes Rocha." },
        { role: "user", content: "Quais lenços umedecidos vocês têm e quanto custam?" },
      ],
    });

    console.log("✅ Resposta completa:\n", JSON.stringify(resposta, null, 2));

    const finalOutput = resposta.output?.at(-1);
    const textoFinal = finalOutput?.content?.[0]?.text ?? "(sem texto)";
    console.log("\n🗨️ Resposta da IA:", textoFinal);
  } catch (erro) {
    if (erro.response) {
      console.error("❌ Erro da API:", erro.response.status, erro.response.data);
    } else {
      console.error("❌ Erro:", erro.message);
    }
  }
}

await testar();