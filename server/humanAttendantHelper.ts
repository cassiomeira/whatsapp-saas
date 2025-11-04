/**
 * Helper para detectar quando cliente pede atendente humano
 */

export function detectarPedidoAtendente(mensagem: string): {
  precisaAtendente: boolean;
  confianca: number;
} {
  const msg = mensagem.toLowerCase().trim();

  // Palavras-chave que indicam pedido de atendente humano
  const palavrasAtendente = [
    "atendente",
    "atendimento",
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

  // Contar quantas palavras-chave aparecem
  const matches = palavrasAtendente.filter(palavra => msg.includes(palavra)).length;

  if (matches >= 1) {
    // Quanto mais matches, maior a confiança
    const confianca = Math.min(matches * 0.4, 0.95);
    return { precisaAtendente: true, confianca };
  }

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
 * Enriquecer prompt da IA para detectar pedidos de atendente
 */
export function enriquecerPromptComAtendimento(promptOriginal: string): string {
  return `${promptOriginal}

IMPORTANTE - TRANSFERÊNCIA PARA ATENDENTE HUMANO:
Se o cliente pedir para falar com um atendente humano, operador, gerente ou pessoa real, você deve:
1. Ser educado e compreensivo
2. Avisar que está transferindo para um atendente
3. Pedir para aguardar um momento

O sistema irá detectar automaticamente e fazer a transferência.

Seja sempre empático e profissional.`;
}

