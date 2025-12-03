import * as db from "./db";
import { detectarDocumento, processarConsultaFatura, processarDesbloqueio } from "./ixcAiHelper";

/**
 * Verificar se é primeira mensagem do contato (nova conversa)
 */
export async function isFirstMessage(conversationId: number): Promise<boolean> {
  const messages = await db.getMessagesByConversation(conversationId);
  const botMessages = messages.filter(m => m.senderType === "bot");
  const isFirst = botMessages.length === 0;
  console.log(`[Automated Flow] isFirstMessage: ${isFirst} (total mensagens: ${messages.length}, mensagens do bot: ${botMessages.length})`);
  return isFirst;
}

/**
 * Processar fluxo robotizado antes da IA
 * Retorna resposta automática ou null se deve passar para IA
 */
export async function processarFluxoRobotizado(
  workspaceId: number,
  conversationId: number,
  messageContent: string,
  whatsappNumber: string
): Promise<string | null> {
  console.log(`[Automated Flow] Processando mensagem: "${messageContent}"`);
  const mensagem = messageContent.toLowerCase().trim();
  const normalizedContent = messageContent.trim();
  
  // Verificar se é primeira mensagem - enviar saudação e perguntar nome
  const isFirst = await isFirstMessage(conversationId);
  console.log(`[Automated Flow] É primeira mensagem? ${isFirst}`);
  if (isFirst) {
    console.log(`[Automated Flow] Enviando saudação inicial e perguntando nome`);
    return `Olá! 👋 Sou da *NetCar Telecom* e estou aqui para te ajudar no que precisar!\n\nPara começar, qual é o seu nome? 😊`;
  }
  
  // Verificar se bot perguntou o nome e cliente está respondendo
  const messages = await db.getMessagesByConversation(conversationId);
  const recentBotMessages = messages
    .filter(m => m.senderType === "bot")
    .slice(-5)
    .map(m => m.content?.toLowerCase() || "");
  
  const botPerguntouNome = recentBotMessages.some(msg => 
    msg.includes("qual é o seu nome") || 
    msg.includes("qual o seu nome") ||
    msg.includes("me diga seu nome") ||
    msg.includes("como você se chama")
  );
  
  // Se bot perguntou nome e mensagem parece ser um nome (não é número, não é muito longa)
  if (botPerguntouNome && normalizedContent.length > 2 && normalizedContent.length < 50 && !normalizedContent.match(/^\d+$/)) {
    // Verificar se a mensagem contém palavras-chave de intenção (NÃO é um nome)
    const palavrasChaveIntencao = [
      'fatura', 'boleto', 'pagamento', 'pagar', 'pix', 'débito', 'debito',
      'desbloqueio', 'desbloquear', 'liberar', 'bloqueado', 'sem internet',
      'internet', 'conta', 'consultar', 'verificar', 'ver', 'quero', 'preciso',
      'atendente', 'humano', 'pessoa', 'ajuda', 'problema', 'suporte'
    ];
    
    const contemIntencao = palavrasChaveIntencao.some(palavra => mensagem.includes(palavra));
    
    // Verificar se não é uma das opções numéricas ou intenções
    if (!contemIntencao && normalizedContent !== "1" && normalizedContent !== "2" && !normalizedContent.includes("cpf") && !normalizedContent.includes("cnpj")) {
      // Cliente forneceu o nome - extrair primeiro nome para saudação
      const primeiroNome = normalizedContent.split(/\s+/)[0];
      const nomeCapitalizado = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase();
      
      console.log(`[Automated Flow] Cliente forneceu o nome: ${normalizedContent}. Usando: ${nomeCapitalizado}`);
      
      // Atualizar nome do contato no banco
      const conversations = await db.getConversationsByWorkspace(workspaceId);
      const conv = conversations.find(c => c.id === conversationId);
      if (conv && conv.contactId) {
        try {
          await db.updateContactName(conv.contactId, normalizedContent);
          console.log(`[Automated Flow] Nome do contato ${conv.contactId} atualizado para: ${normalizedContent}`);
        } catch (error) {
          console.error(`[Automated Flow] Erro ao atualizar nome do contato:`, error);
        }
      }
      
      return `Muito prazer, *${nomeCapitalizado}*! 😊\n\nTenho acesso ao sistema e posso te ajudar com:\n\n• Consultar faturas em aberto\n• Enviar boletos para pagamento\n• Realizar desbloqueio de confiança\n• Tirar dúvidas sobre serviços\n\nComo posso te ajudar hoje?`;
    } else if (contemIntencao) {
      // Cliente mencionou uma intenção sem fornecer o nome
      // Deixar passar para o fluxo normal (IXC ou IA) processar a intenção
      console.log(`[Automated Flow] Cliente mencionou intenção sem fornecer nome. Deixando passar para processamento normal.`);
      // Retorna null para continuar o fluxo
    }
  }
  
  // Verificar se cliente escolheu opção 1 (consultar faturas)
  const escolheuConsultaFatura = 
    normalizedContent === "1" || 
    normalizedContent === "1️⃣" ||
    mensagem === "um" ||
    mensagem.includes("consultar faturas") ||
    mensagem.includes("faturas em aberto") ||
    mensagem.includes("consulta de faturas");
  
  console.log(`[Automated Flow] Escolheu consulta de fatura? ${escolheuConsultaFatura} (mensagem: "${normalizedContent}")`);
  
  if (escolheuConsultaFatura) {
    // Verificar se já tem CPF na mensagem
    const documento = detectarDocumento(messageContent);
    
    if (documento) {
      // Já tem CPF - processar consulta diretamente
      console.log(`[Automated Flow] CPF detectado na mensagem: ${documento}. Processando consulta...`);
      const resposta = await processarConsultaFatura(workspaceId, whatsappNumber, documento);
      return resposta;
    } else {
      // Não tem CPF - pedir CPF
      return `Para consultar suas faturas em aberto, preciso do CPF ou CNPJ do titular da conta.\n\nPor favor, informe o CPF ou CNPJ:`;
    }
  }
  
  // PRIMEIRO: Verificar se bot perguntou sobre desbloqueio
  const botPerguntouDesbloqueio = recentBotMessages.some(msg => 
    msg.includes("deseja realizar o desbloqueio") || 
    msg.includes("desbloqueio de confiança") ||
    msg.includes("digite *sim* para desbloquear")
  );
  
  if (botPerguntouDesbloqueio) {
    const mensagemLower = mensagem.trim().toLowerCase();
    const confirmouDesbloqueio = 
      mensagemLower === "sim" || 
      mensagemLower === "s" ||
      mensagemLower === "yes" ||
      mensagemLower.includes("quero") ||
      mensagemLower.includes("desejo") ||
      mensagemLower.includes("fazer") ||
      mensagemLower.includes("desbloquear");
    
    const negouDesbloqueio = 
      mensagemLower === "não" || 
      mensagemLower === "nao" ||
      mensagemLower === "n" ||
      mensagemLower === "no" ||
      mensagemLower.includes("cancelar") ||
      mensagemLower.includes("não quero") ||
      mensagemLower.includes("nao quero");
    
    if (confirmouDesbloqueio) {
      // Buscar CPF do cliente nas mensagens anteriores
      const userMessages = messages
        .filter(m => m.senderType === "user" || m.senderType === "contact")
        .slice(-10);
      
      let documentoEncontrado: string | null = null;
      for (const msg of userMessages) {
        const doc = detectarDocumento(msg.content || "");
        if (doc) {
          documentoEncontrado = doc;
          break;
        }
      }
      
      if (documentoEncontrado) {
        console.log(`[Automated Flow] Cliente confirmou desbloqueio. CPF: ${documentoEncontrado}. Processando...`);
        const resposta = await processarDesbloqueio(workspaceId, whatsappNumber, documentoEncontrado);
        return resposta;
      } else {
        return "Para realizar o desbloqueio, preciso do CPF ou CNPJ do titular da conta. Por favor, informe o CPF ou CNPJ:";
      }
    } else if (negouDesbloqueio) {
      return "Entendi! O desbloqueio foi cancelado. Se precisar de mais alguma coisa, estou à disposição! 😊";
    }
  }
  
  // SEGUNDO: Verificar se a mensagem atual contém um documento (CPF/CNPJ)
  const documentoNaMensagem = detectarDocumento(messageContent);
  console.log(`[Automated Flow] Documento detectado na mensagem atual:`, documentoNaMensagem);
  
  if (documentoNaMensagem) {
    // Verificar se bot pediu CPF recentemente
    const botPediuCPF = recentBotMessages.some(msg => 
      msg.includes("preciso do cpf") || 
      msg.includes("cpf ou cnpj") || 
      msg.includes("informe o cpf") ||
      msg.includes("informe o cnpj") ||
      msg.includes("por favor, informe") ||
      msg.includes("preciso do cpf ou cnpj")
    );
    
    console.log(`[Automated Flow] Bot pediu CPF? ${botPediuCPF}`);
    
    if (botPediuCPF) {
      // Cliente forneceu CPF após ser solicitado - processar consulta
      console.log(`[Automated Flow] ✅ CPF fornecido após solicitação: ${documentoNaMensagem}. Processando consulta...`);
      const resposta = await processarConsultaFatura(workspaceId, whatsappNumber, documentoNaMensagem);
      console.log(`[Automated Flow] Resposta da consulta (tipo):`, typeof resposta);
      console.log(`[Automated Flow] Resposta da consulta (preview):`, typeof resposta === 'string' ? resposta.substring(0, 100) : 'objeto');
      return resposta;
    } else {
      // Tem documento mas bot não pediu - pode ser que o usuário forneceu espontaneamente
      // Mas como estamos no fluxo robotizado, vamos processar mesmo assim se for apenas números
      if (messageContent.trim().replace(/\D/g, "").length === 11 || messageContent.trim().replace(/\D/g, "").length === 14) {
        console.log(`[Automated Flow] ⚠️ Documento detectado mas bot não pediu explicitamente. Processando mesmo assim...`);
        const resposta = await processarConsultaFatura(workspaceId, whatsappNumber, documentoNaMensagem);
        console.log(`[Automated Flow] Resposta da consulta:`, typeof resposta === 'string' ? resposta.substring(0, 100) : 'objeto');
        return resposta;
      }
    }
  }
  
  // Verificar se escolheu opção 2 (falar com atendente)
  const escolheuAtendente = 
    normalizedContent === "2" || 
    normalizedContent === "2️⃣" ||
    mensagem === "dois" ||
    mensagem.includes("falar com atendente") ||
    mensagem.includes("atendente humano");
  
  if (escolheuAtendente) {
    return "Entendi! Vou transferir você agora para um atendente humano que pode te ajudar melhor. Aguarde só um instante, por favor.";
  }
  
  // Se não encontrou resposta automática, retorna null para passar para IA
  console.log(`[Automated Flow] Nenhuma resposta automática encontrada. Retornando null.`);
  return null;
}

