/**
 * Helper para detectar quando cliente pede atendente humano
 */

export function detectarPedidoAtendente(mensagem: string): {
  precisaAtendente: boolean;
  confianca: number;
} {
  const msg = mensagem.toLowerCase().trim();

  // Lista de saudações simples que devem ser ignoradas completamente
  const saudacoesSimples = [
    "boa noite",
    "boa tarde",
    "bom dia",
    "oi",
    "olá",
    "ola",
    "eae",
    "e aí",
    "e ai",
    "opa",
    "salve",
    "oi tudo bem",
    "olá tudo bem",
    "ola tudo bem"
  ];

  // Se for apenas uma saudação simples, não transferir
  if (saudacoesSimples.some(saudacao => msg === saudacao || msg.startsWith(saudacao + " ") || msg.startsWith(saudacao + "!"))) {
    console.log(`[Human Attendant Helper] Mensagem detectada como saudação simples, ignorando: "${msg}"`);
    return { precisaAtendente: false, confianca: 0 };
  }

  // Palavras-chave que indicam pedido de atendente humano
  // REMOVIDO "atendimento" da lista para evitar falsos positivos como "boa noite, preciso de atendimento"
  const palavrasAtendente = [
    "atendente",
    "humano",
    "pessoa",
    "alguém",
    "alguem",
    "operador",
    "operadora",
    "gerente",
    "supervisor",
    "falar com",
    "preciso falar",
    "quero falar",
    "transferir",
    "transfere",
    "não é bot",
    "nao e bot",
    "você é bot",
    "voce e bot",
    "é robô",
    "e robo"
  ];

  // Verificar frases completas primeiro (mais específicas)
  const frasesExplicitas = [
    "quero falar com atendente",
    "preciso falar com atendente",
    "pode me passar para um atendente",
    "me transfere para atendente",
    "quero atendimento humano",
    "quero falar com uma pessoa",
    "você é bot",
    "voce e bot",
    "é robô",
    "e robo",
    "não é bot",
    "nao e bot",
    "quero falar com alguém",
    "preciso de um atendente",
    "me conecte com atendente"
  ];

  // Verificar se alguma frase explícita está presente (confiança muito alta)
  const temFraseExplicita = frasesExplicitas.some(frase => msg.includes(frase));

  if (temFraseExplicita) {
    return { precisaAtendente: true, confianca: 0.9 }; // Confiança muito alta para frases explícitas
  }

  // Contar quantas palavras-chave aparecem (mas exigir pelo menos 2 para evitar falso positivo)
  const matches = palavrasAtendente.filter(palavra => msg.includes(palavra)).length;

  if (matches >= 2) {
    // Quanto mais matches, maior a confiança (mas começar com confiança menor)
    const confianca = Math.min(0.7 + (matches - 2) * 0.1, 0.9); // Mínimo 0.7 para 2 matches, máximo 0.9
    return { precisaAtendente: true, confianca };
  }

  // Se tem apenas 1 match, confiança baixa demais - não transferir
  // (pode ser falso positivo, como "tem atendimento delivery?")

  return { precisaAtendente: false, confianca: 0 };
}

/**
 * Gerar mensagem de transferência para atendente
 */
export function gerarMensagemTransferencia(nomeCliente?: string): string {
  const saudacao = nomeCliente ? `${nomeCliente}` : "Olá";

  return `${saudacao}, entendo que você gostaria de falar com um atendente humano! 😊

Estou transferindo você para nossa equipe de atendimento agora mesmo. Um de nossos atendentes entrará em contato com você em breve.

Aguarde só um momento, por favor! ⏳`;
}

/**
 * Detectar se cliente está indeciso ou não vai fechar compra
 * ATENÇÃO: Foca em sinais de indecisão sobre COMPRAR, não em perguntas sobre produtos
 */
export function detectarIndecisaoOuSemFechamento(mensagem: string): {
  precisaAtendente: boolean;
  confianca: number;
} {
  const msg = mensagem.toLowerCase().trim();

  // Frases completas que indicam indecisão sobre COMPRAR (não sobre saber se existe)
  // Removidas palavras genéricas que aparecem em perguntas normais como "não sei se tem"
  const sinaisIndecisao = [
    // Indecisão explícita sobre compra
    "ainda não decidi",
    "ainda nao decidi",
    "não decidi ainda",
    "nao decidi ainda",
    "estou pensando em comprar",
    "preciso pensar em comprar",
    "preciso pensar se compro",
    "vou pensar se compro",
    "preciso conversar antes",
    "preciso consultar alguém",
    "preciso conversar com alguém",

    // Recusa ou adiamento de compra
    "não quero agora",
    "nao quero agora",
    "não posso agora",
    "nao posso agora",
    "depois eu vejo",
    "depois eu penso",
    "mais tarde eu vejo",
    "outro dia eu compro",
    "deixa pra depois",
    "deixa para depois",
    "vou pensar melhor",
    "preciso pensar melhor",
    "não fecho agora",
    "nao fecho agora",
    "não fecho a compra agora",
    "nao fecho a compra agora",

    // Dificuldade financeira clara
    "muito caro para mim",
    "está muito caro",
    "esta muito caro",
    "não tenho dinheiro",
    "nao tenho dinheiro",
    "não tenho condições",
    "nao tenho condicoes",
    "preço alto demais",
    "preco alto demais",

    // Dificuldade em decidir entre opções (após ver produtos)
    "não consigo decidir",
    "nao consigo decidir",
    "não sei qual escolher",
    "nao sei qual escolher",
    "difícil escolher",
    "dificil escolher",
    "não sei qual é melhor",
    "nao sei qual e melhor",
    "ajuda para escolher",
    "ajuda para decidir",
    "me ajude a escolher",
    "me ajude a decidir",
    "qual você recomenda",
    "qual vc recomenda",
    "qual recomenda",

    // Indecisão após ver opções
    "tenho dúvidas",
    "tenho duvidas",
    "tenho dúvida",
    "tenho duvida",
    "estou em dúvida",
    "estou em duvida",
    "não tenho certeza se compro",
    "nao tenho certeza se compro",
    "não estou certo se compro",
    "nao estou certo se compro",
  ];

  // Contar matches, mas exigir contexto de compra (não apenas perguntas sobre produtos)
  let matches = 0;
  let hasCompraContext = false;

  // Verificar se há contexto de compra/decidir sobre comprar
  const contextoCompra = [
    "comprar", "compra", "fechar", "pedido", "levar", "quero comprar",
    "vou comprar", "preciso comprar", "escolher", "decidir"
  ];

  hasCompraContext = contextoCompra.some(ctx => msg.includes(ctx));

  // Contar apenas sinais que indicam indecisão
  matches = sinaisIndecisao.filter(sinal => msg.includes(sinal)).length;

  // Só considerar indecisão se:
  // 1. Tem sinais de indecisão E
  // 2. (Tem contexto de compra OU múltiplos sinais - pelo menos 2)
  // Aumentado threshold para ser mais conservador
  if (matches >= 1 && (hasCompraContext || matches >= 2)) {
    // Quanto mais sinais, maior a confiança
    // Requer pelo menos 2 sinais OU 1 sinal com contexto de compra
    // Aumentado confiança base para ser mais conservador
    const confianca = matches >= 3
      ? Math.min(0.7 + (matches - 3) * 0.1, 0.9) // 3+ sinais = confiança alta
      : matches >= 2
        ? Math.min(0.65 + (matches - 2) * 0.05, 0.85) // 2 sinais = confiança média-alta
        : hasCompraContext
          ? Math.min(0.7 + matches * 0.05, 0.8) // 1 sinal com contexto = confiança média
          : 0.5; // Confiança baixa se só tem 1 sinal sem contexto (não transfere com isso)

    // Só retornar precisaAtendente se confiança for alta o suficiente
    if (confianca >= 0.65) {
      return { precisaAtendente: true, confianca };
    }
  }

  return { precisaAtendente: false, confianca: 0 };
}

/**
 * Enriquecer prompt da IA para detectar pedidos de atendente
 */
export function enriquecerPromptComAtendimento(promptOriginal: string): string {
  return `${promptOriginal}

IMPORTANTE - TRANSFERÊNCIA AUTOMÁTICA PARA ATENDENTE HUMANO:

⚠️ REGRA: TENTE SEMPRE RESPONDER A DÚVIDA DO CLIENTE PRIMEIRO.
Só transfira para humano se realmente não conseguir ajudar ou se o cliente solicitar.

SINAIS PARA TRANSFERÊNCIA (Apenas se você não puder resolver):
1. O cliente pedir EXPLICITAMENTE para falar com atendente, operador, gerente ou pessoa real.
2. O cliente demonstrar INSATISFAÇÃO CLARA ou frustração.
3. O problema for técnico ou financeiro complexo que exija validação humana (ex: confirmar estoque físico, negociar desconto especial).

QUANDO O CLIENTE PERGUNTAR SOBRE PRODUTOS:
- Responda se a loja trabalha com o item (ex: "tem sofá?", "tem roupa?").
- Diga que você não tem o estoque ao vivo, mas que a loja trabalha sim com esse departamento.
- SÓ ENTÃO, pergunte se ele quer falar com um vendedor para ver modelos.
- NÃO transfira "de cara" sem explicar antes.

Se for transferir:
- Apenas informe educadamente: "Vou chamar um consultor para te mostrar as opções disponíveis..."
- O sistema detectará automaticamente.`;
}

