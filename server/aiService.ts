import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";
import * as db from "./db";
import { detectarIntencaoIXC, processarConsultaFatura, processarDesbloqueio, enriquecerPromptComIXC, detectarDocumento, solicitouFaturaAVencer } from "./ixcAiHelper";
import { processarFluxoRobotizado } from "./automatedFlowHelper";
import { detectarPedidoAtendente, detectarIndecisaoOuSemFechamento, gerarMensagemTransferencia, enriquecerPromptComAtendimento } from "./humanAttendantHelper";
import type { Product } from "../drizzle/schema";

const SEARCH_RESULTS_PER_VARIANT = 20;
const MAX_UNIQUE_PRODUCTS = 40;
const PRODUCTS_TO_PRESENT = 20;
const SAO_PAULO_TIMEZONE = "America/Sao_Paulo";
const WEEKDAY_OPERATING_MINUTES = {
  start: 7 * 60 + 30,
  end: 20 * 60,
};
const SUNDAY_OPERATING_MINUTES = {
  start: 8 * 60,
  end: 20 * 60,
};
const OUT_OF_HOURS_MESSAGE =
  "No momento estamos fora do nosso horário de atendimento. Funcionamos de segunda a sábado das 07h30 às 20h00 e aos domingos e feriados das 08h00 às 20h00. Assim que retomarmos o expediente, um atendente dará continuidade ao seu atendimento. 😊";

const STOP_WORDS = new Set([
  "a",
  "o",
  "os",
  "as",
  "um",
  "uma",
  "uns",
  "umas",
  "de",
  "do",
  "da",
  "dos",
  "das",
  "pra",
  "pro",
  "para",
  "por",
  "com",
  "sem",
  "no",
  "na",
  "nos",
  "nas",
  "num",
  "numa",
  "que",
  "qual",
  "quais",
  "quanto",
  "quantos",
  "quantas",
  "quero",
  "queria",
  "gostaria",
  "saber",
  "opcoes",
  "opcao",
  "opções",
  "opção",
  "vc",
  "vcs",
  "voce",
  "você",
  "tem",
  "têm",
  "me",
  "sobre",
  "algum",
  "alguma",
  "alguns",
  "algumas",
  "pode",
  "poderia",
  "preciso",
  "favor",
  "cliente",
  "clientes",
  "ds",
  "ai",
  "aí",
  "quaisquer",
  "quer",
  "precisa",
  "precisava",
]);

const KEYWORD_SYNONYMS: Record<string, string[]> = {
  garganta: [
    "garganta",
    "gargant",
    "pastilha",
    "pastilhas",
    "spray",
    "sprays",
    "antisseptico",
    "antissepticos",
    "strepsils",
    "benalet",
    "benalete",
    "ciflogex",
    "hexomedine",
    "clorhexidina",
    "própolis",
    "propoli",
  ],
  tosse: [
    "tosse",
    "xarope",
    "xaropes",
    "xarop",
    "antitussigeno",
    "antitussigenos",
  ],
  resfriado: [
    "resfriado",
    "resfriados",
    "gripe",
    "gripe",
    "antigripal",
    "antigripais",
  ],
  dor: [
    "dor",
    "analgesico",
    "analgesicos",
    "analg",
    "paracetamol",
    "dipirona",
    "ibuprofeno",
    "antiinflamatorio",
    "antiinflamatorios",
  ],
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function normalizeForSearch(value: string | null | undefined): string {
  return normalizeToken((value ?? "").toLowerCase()).replace(/[^a-z0-9]+/g, " ").trim();
}

function hasWholeWord(text: string, word: string): boolean {
  if (!word) return false;
  const pattern = new RegExp(`(^|\s)${escapeRegExp(word)}(\s|$)`);
  return pattern.test(text);
}

function extractProductKeywords(message: string): string[] {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9à-ÿ\s]/gi, " ")
    .split(/\s+/)
    .map(part => part.trim())
    .filter(part => {
      if (part.length < 3) return false;
      const normalized = normalizeToken(part);
      if (normalized.length < 3) return false;
      if (STOP_WORDS.has(normalized)) return false;
      if (/^\d+$/.test(normalized)) return false;
      return true;
    })
    .slice(0, 8);
}

function normalizeToken(token: string): string {
  return token.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getCurrentTimeInfo(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: SAO_PAULO_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  const weekday = (map.weekday || "").toLowerCase();
  const hour = Number(map.hour ?? 0);
  const minute = Number(map.minute ?? 0);
  return { weekday, hour, minute, totalMinutes: hour * 60 + minute };
}

function isWithinBusinessHours(date = new Date()) {
  const info = getCurrentTimeInfo(date);
  const window =
    info.weekday === "sun"
      ? SUNDAY_OPERATING_MINUTES
      : WEEKDAY_OPERATING_MINUTES;
  const isOpen =
    info.totalMinutes >= window.start && info.totalMinutes <= window.end;
  return {
    isOpen,
    info,
  };
}

function generateKeywordVariants(token: string): string[] {
  const variants = new Set<string>();
  const base = normalizeToken(token.toLowerCase());
  variants.add(base);

  if (base.endsWith("s") && base.length > 3) {
    variants.add(base.slice(0, -1));
  }

  if (base.length > 5) {
    variants.add(base.slice(0, 5));
  }

  if (base.length > 4) {
    variants.add(base.slice(0, 4));
  }

  return Array.from(variants);
}

function extractJsonObject(text: string): any | null {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (error) {
    console.warn("[AI Service] Failed to parse JSON from vision response:", error);
    return null;
  }
}

async function analyzeImageForProductHints(imageUrl: string): Promise<{
  description: string;
  keywords: string[];
}> {
  try {
    const response = await invokeLLM({
      maxTokens: 200,
      messages: [
        {
          role: "system",
          content:
            "Você é especialista em identificar produtos farmacêuticos em imagens. Responda apenas em JSON no formato {\"description\":\"descrição sucinta em português\",\"keywords\":[\"keyword1\",\"keyword2\"]}. A descrição deve mencionar marca, linha, tonalidade/cor, numeração e tipo do produto. Nas keywords, retorne nomes exatos, variações observadas, códigos visíveis (ex.: 50, L'Oreal, Koleston), e termos úteis para busca no catálogo.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Analise a imagem do produto e entregue descrição e palavras-chave que ajudem a encontrá-lo no catálogo.",
            },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
    });

    const rawContent =
      typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content
        : "";

    const parsed = extractJsonObject(rawContent);
    if (!parsed) {
      return {
        description: rawContent.trim(),
        keywords: [],
      };
    }

    const description =
      typeof parsed.description === "string"
        ? parsed.description.trim()
        : rawContent.trim();
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords
          .map((item: unknown) =>
            typeof item === "string" ? item.trim() : ""
          )
          .filter(item => item.length > 0)
      : [];

    return {
      description,
      keywords,
    };
  } catch (error) {
    console.error("[AI Service] Failed to analyze image for hints:", error);
    return {
      description: "",
      keywords: [],
    };
  }
}

export async function generateBotResponse(
  workspaceId: number,
  conversationId: number,
  userMessage: string,
  imageUrl?: string,
  imageKeywordHints: string[] = [],
  isInNegotiating?: boolean
): Promise<string> {
  try {
    console.log("[AI Service] generateBotResponse chamado para workspace:", workspaceId);
    console.log("[AI Service] isInNegotiating:", isInNegotiating);
    
    // Buscar configuração do bot
    const botConfig = await db.getBotConfigByWorkspace(workspaceId);
    console.log("[AI Service] botConfig:", botConfig ? "encontrado" : "não encontrado", "isActive:", botConfig?.isActive);
    
    if (!botConfig || !botConfig.isActive) {
      console.log("[AI Service] Bot não está ativo ou não tem config");
      const unavilableMessage = "Olá! No momento estou indisponível. Por favor, aguarde que um atendente irá te responder em breve.";
      
      // Se está em negotiating, adicionar aviso
      if (isInNegotiating) {
        return "💬 Você já foi transferido para um atendente humano que logo irá te atender!\n\nEnquanto isso, posso responder suas dúvidas:\n\n" + unavilableMessage;
      }
      
      return unavilableMessage;
    }

    // Aviso para quando está em negotiating (já foi transferido)
    const negotiatingAviso = isInNegotiating 
      ? "💬 Você já foi transferido para um atendente humano que logo irá te atender!\n\nEnquanto isso, posso responder suas dúvidas:\n\n"
      : "";
    
    console.log("[AI Service] negotiatingAviso:", negotiatingAviso ? "criado" : "vazio");

    // Buscar histórico de mensagens da conversa
    const messages = await db.getMessagesByConversation(conversationId);
    
    // Buscar nome do contato
    const conversations = await db.getConversationsByWorkspace(workspaceId);
    const currentConv = conversations.find(c => c.id === conversationId);
    let nomeCliente = "";
    if (currentConv && currentConv.contactId) {
      const contacts = await db.getContactsByWorkspace(workspaceId);
      const contact = contacts.find(c => c.id === currentConv.contactId);
      if (contact && contact.name) {
        // Extrair primeiro nome
        const primeiroNome = contact.name.split(/\s+/)[0];
        nomeCliente = primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase();
        console.log(`[AI Service] Nome do cliente encontrado: ${nomeCliente}`);
      }
    }

    const normalizedMessage = userMessage.toLowerCase();
    const normalizedMessageNoAccents = normalizeToken(normalizedMessage);
    const transferToAttendantMessage =
      "Entendi! Vou transferir você agora para um atendente humano que pode confirmar a disponibilidade certinha e sugerir outras opções. Aguarde só um instante, por favor.";
    const wantsAlternativeTransfer = /\boutra(s)? opc[aã]o|\boutro produto|\boutra alternativa|\boutras alternativas|\boutra marca|\boutras marcas|\boutra cor|\boutras cores/.test(
      normalizedMessageNoAccents
    );

    if (wantsAlternativeTransfer) {
      return transferToAttendantMessage;
    }
    const baseKeywords = extractProductKeywords(userMessage);
    const additionalKeywords = Array.from(
      new Set(
        imageKeywordHints
          .map(keyword => normalizeToken(keyword.toLowerCase()))
          .filter(
            keyword =>
              keyword.length >= 2 &&
              !STOP_WORDS.has(keyword)
          )
      )
    );
    const keywords = Array.from(new Set([...baseKeywords, ...additionalKeywords]));
    console.log("[AI Service] Keywords extraídos da mensagem/imagem:", keywords);
    const normalizedKeywords = keywords.map(keyword => normalizeToken(keyword));
    const primaryKeywords = normalizedKeywords.filter(keyword => keyword.length >= 4);
    const keywordsForScoring = primaryKeywords.length > 0 ? primaryKeywords : normalizedKeywords;
    const productMatches: Product[] = [];
    const seenProductIds = new Set<number>();

    if (keywords.length > 0) {
      outer: for (const keyword of keywords) {
        const keywordVariants = generateKeywordVariants(keyword);

        for (const variant of keywordVariants) {
          const results = await db.searchProducts(
            workspaceId,
            variant,
            SEARCH_RESULTS_PER_VARIANT
          );

          for (const product of results) {
            if (product.id === undefined) {
              continue;
            }
            if (!seenProductIds.has(product.id)) {
              seenProductIds.add(product.id);
              productMatches.push(product);
            }

            if (productMatches.length >= MAX_UNIQUE_PRODUCTS) {
              break outer;
            }
          }
        }
      }
    }

    const productInquiryKeywords = /(produto|rem[eé]dio|medicamento|pre[cç]o|valor|tem\s|vende|estoque|sku|caps?ula|comprimido|ml|mg)/i;
    const scoredProducts = productMatches
      .map(product => {
        const normalizedName = normalizeForSearch(product.name);
        const normalizedDescription = normalizeForSearch(product.description);
        let score = 0;
        let matchedKeywords = 0;

        for (const keyword of keywordsForScoring) {
          if (!keyword) continue;

          const variants = new Set<string>();
          variants.add(keyword);
          const synonymList = KEYWORD_SYNONYMS[keyword] ?? [];
          for (const synonym of synonymList) {
            const normalizedSynonym = normalizeToken(synonym.toLowerCase());
            if (normalizedSynonym) {
              variants.add(normalizedSynonym);
            }
          }

          let keywordMatched = false;

          for (const variant of variants) {
            if (!variant || variant.length < 3) continue;
            if (hasWholeWord(normalizedName, variant)) {
              score += variant === keyword ? 6 : 4;
              keywordMatched = true;
              break;
            }
          }

          if (!keywordMatched) {
            for (const variant of variants) {
              if (!variant || variant.length < 3) continue;
              if (hasWholeWord(normalizedDescription, variant)) {
                score += variant === keyword ? 4 : 2;
                keywordMatched = true;
                break;
              }
            }
          }

          if (keywordMatched) {
            matchedKeywords += 1;
          }
        }

        if (matchedKeywords === 0) {
          return null;
        }

        return {
          product,
          score,
          matchedKeywords,
        };
      })
      .filter((entry): entry is { product: Product; score: number; matchedKeywords: number } => entry !== null);

    const sortedProductsRaw = scoredProducts.length > 0
      ? scoredProducts
          .sort((a, b) => {
            if (b.score !== a.score) {
              return b.score - a.score;
            }
            const priceA = a.product.price ?? Number.MAX_SAFE_INTEGER;
            const priceB = b.product.price ?? Number.MAX_SAFE_INTEGER;
            if (priceA !== priceB) {
              return priceA - priceB;
            }
            return (a.product.name ?? "").localeCompare(b.product.name ?? "");
          })
          .map(entry => entry.product)
      : [...productMatches].sort((a, b) => {
          const priceA = a.price ?? Number.MAX_SAFE_INTEGER;
          const priceB = b.price ?? Number.MAX_SAFE_INTEGER;
          if (priceA !== priceB) {
            return priceA - priceB;
          }
          return (a.name ?? "").localeCompare(b.name ?? "");
        });

    const sortedProducts = sortedProductsRaw;

    if (keywords.length > 0 && sortedProducts.length === 0 && productInquiryKeywords.test(userMessage)) {
      return transferToAttendantMessage;
    }

    // Verificar se o cliente pediu para ver mais opções
    const wantsMoreProducts = /\bmais\b|outr[ao]s?|outros|mostrar mais|ver mais/.test(normalizedMessage);
    let startIndex = 0;

    if (wantsMoreProducts && sortedProducts.length > 0) {
      // Encontrar o último bloco enviado pelo bot
      const lastBotListMessage = [...messages]
        .reverse()
        .find(msg => msg.senderType === "bot" && msg.content?.includes("Preço:"));

      if (lastBotListMessage?.content) {
        const regex = /^(\d+)\./gim;
        let match: RegExpExecArray | null;
        let lastNumber = 0;
        while ((match = regex.exec(lastBotListMessage.content)) !== null) {
          const number = Number(match[1]);
          if (!Number.isNaN(number)) {
            lastNumber = Math.max(lastNumber, number);
          }
        }

        if (lastNumber > 0) {
          startIndex = lastNumber;
        }
      }

      if (startIndex >= sortedProducts.length) {
        return transferToAttendantMessage;
      }
    }

    const productsToShare = sortedProducts.slice(startIndex, startIndex + PRODUCTS_TO_PRESENT);
    const hasMoreProducts = startIndex + productsToShare.length < sortedProducts.length;

    // Construir contexto da conversa
    const conversationHistory = messages.slice(-10).map(msg => ({
      role: msg.senderType === "contact" ? "user" as const : "assistant" as const,
      content: msg.content,
    }));

    // Chamar a IA (com vision se houver imagem)
    const lastMessage: any = imageUrl ? {
      role: "user",
      content: [
        { type: "text", text: userMessage },
        { type: "image_url", image_url: { url: imageUrl } }
      ]
    } : {
      role: "user",
      content: userMessage,
    };
    
    // Enriquecer prompt com contexto IXC e atendimento humano
    let systemPrompt = botConfig.masterPrompt || "Você é um assistente de atendimento profissional e prestativo.";
    systemPrompt = enriquecerPromptComIXC(systemPrompt);
    systemPrompt = enriquecerPromptComAtendimento(systemPrompt);
    
    // Adicionar nome do cliente ao prompt
    if (nomeCliente) {
      systemPrompt += `\n\n🎯 IMPORTANTE - PERSONALIZAÇÃO:\nO nome do cliente é *${nomeCliente}*. SEMPRE use o nome dele nas suas respostas para criar uma experiência mais humanizada e pessoal. Por exemplo: "Olá ${nomeCliente}!", "Entendi ${nomeCliente}!", "${nomeCliente}, posso te ajudar com...", etc.\n\nUsar o nome do cliente demonstra atenção e cuidado, tornando o atendimento mais caloroso e profissional.`;
    }
    
    systemPrompt += `
Regras de catálogo:
- Sempre que apresentar um produto, informe o preço exatamente como fornecido na lista e destaque que o item está disponível para pronta entrega.
- Quando o cliente pedir um produto específico e ele existir na lista, priorize esse item e confirme o valor.
- Caso não encontre o produto solicitado ou não tenha certeza do estoque, não diga que “não temos”; diga que vai transferir para um atendente humano confirmar a disponibilidade e finalize a resposta com esse aviso (sem perguntar ao cliente se ele deseja ser transferido).`;

    const additionalSystemMessages: Array<{ role: "system"; content: string }> = [];

    if (imageUrl) {
      let content =
        "O cliente enviou uma imagem e você CONSEGUE visualizá-la claramente. Faça o melhor esforço para identificar produtos, marcas, cores, textos visíveis e qualquer detalhe relevante. Descreva com precisão o que está vendo antes de sugerir soluções. Só diga que a imagem não pôde ser interpretada se ela estiver realmente ilegível (por exemplo, totalmente em branco, extremamente borrada ou corrompida); caso isso aconteça, explique o motivo de forma educada e peça outra foto se necessário.";
      if (imageKeywordHints.length > 0) {
        content += ` Palavras-chave extraídas da imagem: ${imageKeywordHints.join(
          ", "
        )}. Utilize essas palavras para buscar opções no catálogo. Se não houver correspondência exata, sugira alternativas próximas com marca ou tonalidades semelhantes e informe a disponibilidade baseada no catálogo.`;
      } else {
        content +=
          " Utilize os detalhes identificados na imagem para buscar o produto ou alternativas similares no catálogo, listando os itens disponíveis.";
      }
      additionalSystemMessages.push({
        role: "system",
        content,
      });
    }

    const productContextMessage = productsToShare.length > 0
      ? `Produtos encontrados no catálogo (priorizados pelos mais relevantes para o pedido e, em caso de empate, do menor para o maior preço). Liste TODAS as opções abaixo exatamente na ordem apresentada, sem omitir nenhuma e sem dizer que são apenas algumas. Se houver menos de ${PRODUCTS_TO_PRESENT} itens nesta lista, informe que são as opções disponíveis para esta etapa. Ao final, pergunte explicitamente se o cliente deseja ver mais opções adicionais${
          hasMoreProducts
            ? ". Caso ele queira, diga que você pode mostrar mais itens ou acionar um atendente humano."
            : ". Caso não haja mais itens, informe que essas são todas as opções encontradas."
        }\n${productsToShare
          .map((prod, index) => {
            const preco = prod.price != null
              ? (prod.price / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
              : "preço indisponível";
            const descricao = prod.description ? `\n   • Descrição: ${prod.description}` : "";
            const nome = prod.name ?? "Produto sem nome";
            return `${startIndex + index + 1}. ${nome}\n   • Preço: ${preco}${descricao}`;
          })
          .join("\n\n")}`
      : "Nenhum produto relacionado foi recuperado do catálogo.";

    console.log("[AI Service] Chamando invokeLLM com", conversationHistory.length + 3, "mensagens");
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "system",
          content: productContextMessage,
        },
        ...additionalSystemMessages,
        ...conversationHistory,
        lastMessage,
      ],
    });
    console.log("[AI Service] LLM respondeu com sucesso");

    let botResponse = typeof response.choices[0]?.message?.content === "string" 
      ? response.choices[0].message.content 
      : "Desculpe, não consegui processar sua mensagem.";

    const botResponseNormalized = normalizeToken(botResponse.toLowerCase());
    // Detectar se a IA perguntou sobre transferência - REMOVER perguntas e transferir automaticamente
    const transferPromptPatterns = [
      /posso.*atendente/,
      /deseja.*atendente/,
      /quer.*atendente/,
      /prefere.*atendente/,
      /gostaria.*atendente/,
      /quer.*falar.*atendente/,
      /deseja.*falar.*atendente/,
      /tudo bem.*transferir/,
      /ok.*transferir/,
      /combinado.*transferir/
    ];
    // Se a IA perguntou sobre transferência, REMOVER a pergunta e transferir automaticamente
    // Mas se já está em negotiating, não substituir - apenas continuar respondendo
    if (!isInNegotiating && transferPromptPatterns.some(pattern => pattern.test(botResponseNormalized))) {
      console.log("[AI Service] IA perguntou sobre transferência - removendo pergunta e transferindo automaticamente");
      botResponse = transferToAttendantMessage;
    }
    
    // Adicionar aviso de negotiating no início da resposta se estiver em negotiating
    // IMPORTANTE: Fazer isso DEPOIS de processar transferências para garantir que o aviso seja sempre adicionado
    if (isInNegotiating && negotiatingAviso) {
      botResponse = negotiatingAviso + botResponse;
    }

    // Verificar regras de transbordo
    if (botConfig.transferRules && Array.isArray(botConfig.transferRules)) {
      for (const rule of botConfig.transferRules) {
        if (shouldTransferToHuman(userMessage, botResponse, rule)) {
          return "Entendi! Vou transferir você para um atendente humano. Por favor, aguarde um momento.";
        }
      }
    }

    return botResponse;
  } catch (error: any) {
    console.error("[AI Service] Error generating response:", error);
    console.error("[AI Service] Error message:", error?.message);
    console.error("[AI Service] Error stack:", error?.stack);
    console.error("[AI Service] isInNegotiating no catch:", isInNegotiating);
    
    // Se está em negotiating, ainda retornar mensagem com aviso
    if (isInNegotiating) {
      const fallbackMessage = "Desculpe, ocorreu um problema ao processar sua mensagem. Por favor, tente novamente ou aguarde o atendente.";
      return "💬 Você já foi transferido para um atendente humano que logo irá te atender!\n\nEnquanto isso, posso responder suas dúvidas:\n\n" + fallbackMessage;
    }
    
    return "Desculpe, ocorreu um erro ao processar sua mensagem. Um atendente irá te ajudar em breve.";
  }
}

function shouldTransferToHuman(
  userMessage: string,
  botResponse: string | (any)[],
  rule: { type: string; value: string; action: string }
): boolean {
  const lowerMessage = userMessage.toLowerCase();
  const lowerValue = rule.value.toLowerCase();

  switch (rule.type) {
    case "keyword":
      return lowerMessage.includes(lowerValue);
    case "phrase":
      return lowerMessage === lowerValue;
    case "sentiment":
      // Detectar palavras negativas/frustração
      const negativeWords = ["ruim", "péssimo", "horrível", "problema", "reclamar", "insatisfeito"];
      return negativeWords.some(word => lowerMessage.includes(word));
    default:
      return false;
  }
}

export async function processIncomingMessage(
  workspaceId: number,
  contactId: number,
  instanceId: number,
  messageContent: string,
  whatsappNumber: string,
  mediaUrl?: string,
  mediaType?: "image" | "audio" | "video" | "document",
  mediaBase64?: string,
  mediaMimeType?: string
): Promise<void> {
  try {
    console.log(`[AI Service] ===== processIncomingMessage INICIADO =====`);
    console.log(`[AI Service] workspaceId: ${workspaceId}, contactId: ${contactId}, messageContent: "${messageContent.substring(0, 100)}"`);
    
    // Buscar ou criar conversa
    let conversation = await db.getConversationsByWorkspace(workspaceId);
    let activeConv = conversation.find(
      c => c.contactId === contactId && c.status !== "closed"
    );

    if (!activeConv) {
      // Criar nova conversa
      const convId = await db.createConversation({
        workspaceId,
        contactId,
        instanceId,
        status: "bot_handling",
      });
      activeConv = await db.getConversationsByWorkspace(workspaceId).then(
        convs => convs.find(c => c.id === convId)
      );
    }

    if (!activeConv) {
      throw new Error("Failed to create or find conversation");
    }

    // Processar mídia se houver
    let processedContent = messageContent;
    let resolvedMediaUrl = mediaUrl;
    let imageKeywordHints: string[] = [];
    
    if (mediaType === "audio") {
      const transcriptionOptions: Parameters<typeof transcribeAudio>[0] = {
        language: "pt",
      };

      if (mediaBase64) {
        try {
          transcriptionOptions.audioBuffer = Buffer.from(mediaBase64, "base64");
          console.log(`[AI Service] Transcribing audio from base64 payload (tamanho: ${transcriptionOptions.audioBuffer.length} bytes)`);
        } catch (error) {
          console.error("[AI Service] Failed to decode audio base64:", error);
        }
      }

      if (!transcriptionOptions.audioBuffer && mediaUrl) {
        transcriptionOptions.audioUrl = mediaUrl;
        console.log(`[AI Service] Transcribing audio from ${mediaUrl}`);
      }

      if (mediaMimeType) {
        transcriptionOptions.mimeType = mediaMimeType;
      }

      if (transcriptionOptions.audioBuffer || transcriptionOptions.audioUrl) {
        try {
          const transcription = await transcribeAudio(transcriptionOptions);
          if ("text" in transcription && transcription.text && transcription.text.trim().length > 0) {
            processedContent = transcription.text.trim();
            console.log(`[AI Service] Audio transcribed successfully: "${processedContent}"`);
          } else {
            console.error("[AI Service] Transcription error:", transcription.error, transcription.details);
            // Se a transcrição falhar, usar o texto original se houver, senão usar uma mensagem genérica
            processedContent = messageContent && messageContent.trim() && messageContent !== "[Áudio]"
              ? messageContent
              : "Olá, como posso ajudar?";
            console.log(`[AI Service] Using fallback content: "${processedContent}"`);
          }
        } catch (error) {
          console.error("[AI Service] Error transcribing audio:", error);
          // Se a transcrição falhar, usar o texto original se houver, senão usar uma mensagem genérica
          processedContent = messageContent && messageContent.trim() && messageContent !== "[Áudio]"
            ? messageContent
            : "Olá, como posso ajudar?";
          console.log(`[AI Service] Using fallback content after error: "${processedContent}"`);
        }
      } else {
        console.warn(`[AI Service] Audio message received but no accessible content was provided for contact ${contactId}.`);
        // Usar texto original se houver, senão mensagem genérica
        processedContent = messageContent && messageContent.trim() && messageContent !== "[Áudio]"
          ? messageContent
          : "Olá, como posso ajudar?";
      }
    } else if (mediaType === "image") {
      if (mediaBase64) {
        const mimeType =
          mediaMimeType && mediaMimeType.trim().length > 0
            ? mediaMimeType
            : "image/jpeg";
        resolvedMediaUrl = `data:${mimeType};base64,${mediaBase64}`;
        console.log(
          `[AI Service] Image received via base64 (mime: ${mimeType}, length: ${mediaBase64.length}).`
        );
      } else if (!resolvedMediaUrl) {
        console.warn(
          `[AI Service] Image received sem base64 ou URL acessível para o contato ${contactId}.`
        );
      }

      // Desabilitar visão de produto para imagens: tratar como mensagem genérica
      const originalText = messageContent?.trim();
      // Não acrescentar texto se não houver legenda; usar apenas a legenda se existir
      processedContent =
        originalText && originalText !== "[Imagem]"
          ? originalText
          : "";
      imageKeywordHints = [];
    } else if (mediaType === "video") {
      if (mediaBase64) {
        const mimeType =
          mediaMimeType && mediaMimeType.trim().length > 0
            ? mediaMimeType
            : "video/mp4";
        resolvedMediaUrl = `data:${mimeType};base64,${mediaBase64}`;
        console.log(
          `[AI Service] Video received via base64 (mime: ${mimeType}, length: ${mediaBase64.length}).`
        );
      } else if (!resolvedMediaUrl) {
        console.warn(
          `[AI Service] Video received sem base64 ou URL acessível para o contato ${contactId}.`
        );
      }
    }
    
    // IMPORTANTE: Salvar mensagem do contato DEPOIS de processar para garantir que todas as mensagens chegam na IA
    // Mas primeiro buscar contato para verificar status
    const contacts = await db.getContactsByWorkspace(workspaceId);
    const contact = contacts.find(c => c.id === contactId);
    // Número/JID de destino: priorizar JID salvo no metadata (pode ser @lid)
    const destinationNumber =
      ((contact?.metadata as any)?.whatsappJid && String((contact?.metadata as any)?.whatsappJid).trim().length > 0)
        ? (contact?.metadata as any)?.whatsappJid
        : (contact?.whatsappNumber && contact.whatsappNumber.trim().length > 0)
          ? contact.whatsappNumber
          : whatsappNumber;

    // Verificar status do Kanban
    const contactStatus = contact?.kanbanStatus || "new_contact";
    const isSellerStatus = contactStatus.startsWith("seller_");
    const contactWaiting = contactStatus === "waiting_attendant" || isSellerStatus;
    let contactInNegotiating = contactStatus === "negotiating";

    // Salvar mensagem do contato ANTES de processar (garante histórico completo)
    try {
      await db.createMessage({
        conversationId: activeConv.id,
        senderType: "contact",
        content: processedContent,
        messageType: mediaType || "text",
        mediaUrl: resolvedMediaUrl,
      });
      console.log(`[AI Service] Mensagem do contato salva com sucesso`);
    } catch (error: any) {
      console.error(`[AI Service] Erro ao salvar mensagem do contato:`, error);
      // Se o erro for relacionado à coluna whatsappMessageId, tentar garantir que ela existe
      if (error?.message?.includes("whatsappMessageId")) {
        console.log(`[AI Service] Erro relacionado a whatsappMessageId, tentando garantir coluna...`);
        try {
          const { initAuxTables } = await import("./db");
          await initAuxTables();
          // Tentar salvar novamente
          await db.createMessage({
            conversationId: activeConv.id,
            senderType: "contact",
            content: processedContent,
            messageType: mediaType || "text",
            mediaUrl: resolvedMediaUrl,
          });
          console.log(`[AI Service] Mensagem do contato salva após garantir coluna`);
        } catch (retryError) {
          console.error(`[AI Service] Erro ao salvar mensagem mesmo após garantir coluna:`, retryError);
          throw retryError;
        }
      } else {
        throw error;
      }
    }

    // Comandos de colaborador em campo (#desativar / #ativar)
    const collaboratorStatus = "collaborators_fixed";
    const trimmedContent = processedContent?.trim().toLowerCase() || "";

    // Se já está marcado como colaborador e não pediu para ativar, não responder IA
    const isCollaborator = contact?.metadata && (contact.metadata as any).collaboratorMode === true;
    if (trimmedContent === "#desativar") {
      console.log(`[AI Service] Comando #desativar recebido. Marcando contato como colaborador e desativando IA.`);
      await db.updateContactKanbanStatus(contactId, collaboratorStatus);
      await db.updateContactMetadata(contactId, (metadata: any = {}) => ({
        ...metadata,
        collaboratorMode: true,
      }));
      try {
        const { sendTextMessage } = await import("./whatsappService");
        const instances = await db.getWhatsappInstancesByWorkspace(workspaceId);
        const instance = instances.find(i => i.id === instanceId);
        if (instance?.instanceKey) {
          await sendTextMessage(instance.instanceKey, destinationNumber, "Modo colaborador ativado. A IA não vai responder até você enviar #ativar.");
        }
      } catch (err) {
        console.error("[AI Service] Erro ao enviar confirmação de desativação:", err);
      }
      return;
    }

    if (trimmedContent === "#ativar") {
      console.log(`[AI Service] Comando #ativar recebido. Reativando IA para o contato.`);
      await db.updateContactKanbanStatus(contactId, "new_contact");
      await db.updateContactMetadata(contactId, (metadata: any = {}) => {
        const clone = { ...metadata };
        delete clone.collaboratorMode;
        return clone;
      });
      try {
        const { sendTextMessage } = await import("./whatsappService");
        const instances = await db.getWhatsappInstancesByWorkspace(workspaceId);
        const instance = instances.find(i => i.id === instanceId);
        if (instance?.instanceKey) {
          await sendTextMessage(instance.instanceKey, destinationNumber, "IA reativada. Pode seguir falando comigo normalmente. 🙂");
        }
      } catch (err) {
        console.error("[AI Service] Erro ao enviar confirmação de ativação:", err);
      }
      // Continua fluxo normal após reativar
    } else if (isCollaborator) {
      console.log(`[AI Service] Contato em modo colaborador. IA não irá responder até receber #ativar.`);
      return;
    }

    // Se o contato está aguardando atendente, IA não responde
    // Mas se estiver em "negotiating", a IA CONTINUA respondendo com aviso
    if (contactWaiting) {
      console.log(`[AI Service] Contato ${contactId} está marcado como "Aguardando Atendente". IA não irá responder.`);
      return;
    }

    // Se está em negotiating, continua respondendo (será adicionado aviso na resposta)
    if (contactInNegotiating) {
      console.log(`[AI Service] Contato ${contactId} está em "Negociando". IA continuará respondendo com aviso de transferência.`);
    }

    console.log(`[AI Service] Conversa status: ${activeConv.status}, contactWaiting: ${contactWaiting}, contactInNegotiating: ${contactInNegotiating}`);

    // Se está em negotiating, manter bot_handling para continuar respondendo
    // Se não está em negotiating e está pending_human, reativar bot
    if (activeConv.status !== "bot_handling") {
      if (activeConv.status === "pending_human" && !contactInNegotiating) {
        console.log(`[AI Service] Conversa ${activeConv.id} estava em pending_human, mas o contato não está aguardando atendente. Reativando bot.`);
        await db.updateConversationStatus(activeConv.id, "bot_handling");
        activeConv.status = "bot_handling" as any;
      } else if (contactInNegotiating && activeConv.status === "pending_human") {
        // Se está em negotiating mas status é pending_human, mudar para bot_handling para continuar respondendo
        console.log(`[AI Service] Contato ${contactId} está em negotiating. Mantendo bot ativo para responder perguntas.`);
        await db.updateConversationStatus(activeConv.id, "bot_handling");
        activeConv.status = "bot_handling" as any;
      } else {
        console.log(`[AI Service] Conversa ${activeConv.id} com status '${activeConv.status}'. Reativando bot.`);
        await db.updateConversationStatus(activeConv.id, "bot_handling");
        activeConv.status = "bot_handling" as any;
      }
    }

    if (activeConv.status === "bot_handling") {
      console.log(`[AI Service] Status é bot_handling - VAI PROCESSAR COM IA`);
      
      // Verificação de horário de atendimento desabilitada para testes
      // const { isOpen } = isWithinBusinessHours();
      // if (!isOpen) {
      //   console.log("[AI Service] Fora do horário de atendimento. Enviando mensagem automática.");
      //   await db.createMessage({
      //     conversationId: activeConv.id,
      //     senderType: "bot",
      //     content: OUT_OF_HOURS_MESSAGE,
      //   });
      //
      //   try {
      //     const { sendTextMessage } = await import("./whatsappService");
      //     const instances = await db.getWhatsappInstancesByWorkspace(workspaceId);
      //     const instance = instances.find(i => i.id === instanceId);
      //     if (instance && instance.instanceKey) {
      //       await sendTextMessage(instance.instanceKey, destinationNumber, OUT_OF_HOURS_MESSAGE);
      //       console.log(`[AI Service] Mensagem de horário de atendimento enviada para ${destinationNumber}`);
      //     }
      //   } catch (error) {
      //     console.error("[AI Service] Erro ao enviar mensagem de horário de atendimento:", error);
      //   }
      //
      //   return;
      // }

      // FLUXO ROBOTIZADO: Processar PRIMEIRO (antes de tudo)
      // Isso garante que a saudação inicial apareça antes da IA processar
      console.log(`[AI Service] ===== INICIANDO FLUXO ROBOTIZADO =====`);
      console.log(`[AI Service] Mensagem processada: "${processedContent}"`);
      const respostaAutomatica = await processarFluxoRobotizado(
        workspaceId,
        activeConv.id,
        processedContent,
        whatsappNumber
      );
      
      console.log(`[AI Service] Resposta do fluxo robotizado:`, respostaAutomatica ? `"${respostaAutomatica.substring(0, 100)}"` : "null");
      
      if (respostaAutomatica) {
        // Encontrou resposta automática - usar ela e retornar
        console.log(`[AI Service] ✅ Resposta automática encontrada no fluxo robotizado - USANDO ELA`);
        console.log(`[AI Service] Tipo da resposta:`, typeof respostaAutomatica);
        console.log(`[AI Service] Preview da resposta:`, typeof respostaAutomatica === 'string' ? respostaAutomatica.substring(0, 150) : 'não é string');
        
        // Verificar se a resposta contém boletos para enviar
        let botResponse = respostaAutomatica;
        let boletosParaEnviar: Array<{ idFatura: number; pdfBase64: string; nomeArquivo: string }> = [];
        
        try {
          const respostaObj = JSON.parse(respostaAutomatica);
          console.log(`[AI Service] Resposta é JSON válido. Tipo:`, respostaObj.tipo);
          if (respostaObj.tipo === 'consulta_com_boletos') {
            botResponse = respostaObj.mensagem;
            boletosParaEnviar = respostaObj.boletos || [];
            console.log(`[AI Service] ✅ Resposta contém ${boletosParaEnviar.length} boleto(s) para enviar`);
          }
        } catch (e) {
          // Não é JSON, é texto normal
          console.log(`[AI Service] Resposta não é JSON, é texto normal`);
        }
        
        // Se a resposta automática pediu transferência, processar
        if (botResponse.includes("transferir") && botResponse.includes("atendente")) {
          await db.updateContactKanbanStatus(contactId, "negotiating");
        }
        
        // Salvar e enviar resposta automática
        await db.createMessage({
          conversationId: activeConv.id,
          senderType: "bot",
          content: botResponse,
        });
        
        try {
          const { sendTextMessage, sendPDFDocument } = await import("./whatsappService");
          const instances = await db.getWhatsappInstancesByWorkspace(workspaceId);
          const instance = instances.find(i => i.id === instanceId);
          
          if (instance && instance.instanceKey) {
            // Enviar mensagem de texto
            await sendTextMessage(instance.instanceKey, destinationNumber, botResponse);
            console.log(`[AI Service] Resposta automática enviada para ${destinationNumber}`);
            
            // Enviar boletos se houver
            if (boletosParaEnviar.length > 0) {
              console.log(`[AI Service] Enviando ${boletosParaEnviar.length} boleto(s)...`);
              for (const boleto of boletosParaEnviar) {
                try {
                  await sendPDFDocument(
                    instance.instanceKey,
                    destinationNumber,
                    boleto.pdfBase64,
                    boleto.nomeArquivo,
                    `Fatura ${boleto.idFatura}`
                  );
                  console.log(`[AI Service] ✅ Boleto ${boleto.idFatura} enviado`);
                  // Registrar no histórico para o atendente ver que foi enviado
                  await db.createMessage({
                    conversationId: activeConv.id,
                    senderType: "bot",
                    content: `Boleto enviado: ${boleto.nomeArquivo}`,
                    messageType: "document",
                  });
                } catch (error) {
                  console.error(`[AI Service] ❌ Erro ao enviar boleto ${boleto.idFatura}:`, error);
                  await db.createMessage({
                    conversationId: activeConv.id,
                    senderType: "bot",
                    content: `Erro ao enviar boleto ${boleto.nomeArquivo}: ${(error as any)?.message || "Falha desconhecida"}`,
                    messageType: "text",
                  });
                }
              }
            }
          }
        } catch (error) {
          console.error(`[AI Service] Erro ao enviar resposta automática:`, error);
        }
        
        return; // Retornar aqui - não processar mais nada
      }
      
      // Se não encontrou resposta automática, continuar com processamento normal
      // Verificar se bot pediu CPF recentemente e cliente está fornecendo agora
      const messages = await db.getMessagesByConversation(activeConv.id);
      const recentBotMessages = messages
        .filter(m => m.senderType === "bot" && m.createdAt)
        .slice(-3)
        .map(m => m.content?.toLowerCase() || "");
      
      const botPediuCPF = recentBotMessages.some(msg => 
        msg.includes("preciso do cpf") || msg.includes("cpf ou cnpj") || msg.includes("informe seu cpf")
      );
      const recentUserMessages = messages
        .filter(m => m.senderType === "contact" && m.createdAt)
        .slice(-5)
        .map(m => m.content?.toLowerCase() || "");
      const historicoPedeAVencer = recentUserMessages.some(msg => solicitouFaturaAVencer(msg));
      
      // Capturar documento já fornecido no histórico para evitar pedir novamente
      const documentoHistorico = (() => {
        const contatoMsgs = messages
          .filter(m => m.senderType === "contact" && m.content)
          .slice(-20); // últimos 20 registros do contato
        for (let i = contatoMsgs.length - 1; i >= 0; i--) {
          const doc = detectarDocumento(contatoMsgs[i].content || "");
          if (doc) return doc;
        }
        return null;
      })();
      
      // Detectar intenção IXC
      const intencaoIXC = detectarIntencaoIXC(processedContent);
      console.log(`[AI Service] Intenção IXC detectada:`, intencaoIXC);
      let botResponse: string = ""; // Inicializar com valor padrão
      
      // Se bot pediu CPF e cliente forneceu documento nesta mensagem, processar
      const documentoNaMensagem = detectarDocumento(processedContent);
      if (botPediuCPF && documentoNaMensagem && intencaoIXC.tipo === "nenhuma") {
        // Verificar contexto: se foi pedido para desbloqueio ou consulta
        const pediuDesbloqueio = recentUserMessages.some(msg => 
          msg.includes("liberar") || msg.includes("desbloquear") || msg.includes("desbloqueio") ||
          msg.includes("paguei") || msg.includes("paguei minha conta")
        );
        
        if (pediuDesbloqueio) {
          console.log(`[AI Service] Bot pediu CPF e cliente forneceu: ${documentoNaMensagem}. Processando desbloqueio...`);
          intencaoIXC.tipo = "desbloqueio";
          intencaoIXC.confianca = 0.95;
          intencaoIXC.documento = documentoNaMensagem;
        } else {
          console.log(`[AI Service] Bot pediu CPF e cliente forneceu: ${documentoNaMensagem}. Processando consulta...`);
          intencaoIXC.tipo = "consulta_fatura";
          intencaoIXC.confianca = 0.95;
          intencaoIXC.documento = documentoNaMensagem;
        }
      }
      
      // Se já temos documento no histórico e não foi capturado pela intenção, reutilizar para não ficar pedindo novamente
      if (!intencaoIXC.documento && documentoHistorico) {
        intencaoIXC.documento = documentoHistorico;
        console.log(`[AI Service] Reutilizando documento do histórico: ${documentoHistorico}`);
      }

      const normalizedContent = processedContent.toLowerCase();
      const querFaturaAVencer = solicitouFaturaAVencer(normalizedContent) || historicoPedeAVencer;
      // Palavras-chave financeiras mais específicas (removidas palavras genéricas como "valor", "pagar")
      const financeKeywords = [
        "fatura",
        "boleto",
        "minha conta",
        "minha fatura",
        "segunda via",
        "quanto devo",
        "quanto eu devo",
        "débito em conta",
        "debito em conta",
        "pix para pagar",
        "pix da conta"
      ];

      // Verificar configuração IXC
      const workspace = await db.getWorkspaceById(workspaceId);
      const metadata = workspace?.metadata as any;
      const temConfiguracaoIXC = metadata?.ixcApiUrl && metadata?.ixcApiToken;

      // Processar IXC APENAS se:
      // 1. Cliente forneceu CPF após ser solicitado (botPediuCPF && documentoNaMensagem)
      // 2. OU intenção muito clara (confiança > 0.8) E já tem documento
      // Caso contrário, deixar a IA responder primeiro
      
      let deveProcessarIXCDireto = false;
      
      if (botPediuCPF && documentoNaMensagem) {
        // Cliente forneceu CPF após ser solicitado - processar diretamente
        deveProcessarIXCDireto = true;
        console.log(`[AI Service] Cliente forneceu CPF após solicitação. Processando IXC diretamente.`);
      } else if (intencaoIXC.confianca > 0.8 && intencaoIXC.documento) {
        // Intenção muito clara E já tem documento - processar diretamente
        deveProcessarIXCDireto = true;
        console.log(`[AI Service] Intenção muito clara (${intencaoIXC.confianca}) com documento. Processando IXC diretamente.`);
        }

      if (deveProcessarIXCDireto && temConfiguracaoIXC && (intencaoIXC.tipo === "consulta_fatura" || intencaoIXC.tipo === "desbloqueio")) {
        // Processar diretamente com IXC
        if (intencaoIXC.tipo === "consulta_fatura") {
          console.log(`[AI Service] Processando consulta de fatura com IXC (documento: ${intencaoIXC.documento})`);
        botResponse = await processarConsultaFatura(workspaceId, whatsappNumber, intencaoIXC.documento, contactId, activeConv.id, querFaturaAVencer);
        } else if (intencaoIXC.tipo === "desbloqueio") {
          console.log(`[AI Service] Processando desbloqueio com IXC (documento: ${intencaoIXC.documento})`);
        botResponse = await processarDesbloqueio(workspaceId, whatsappNumber, intencaoIXC.documento, contactId, activeConv.id);
        }
      } else if (temConfiguracaoIXC && intencaoIXC.tipo === "desbloqueio" && !intencaoIXC.documento && !documentoNaMensagem && !documentoHistorico) {
        // Cliente perguntou sobre bloqueio mas ainda não forneceu documento: pedir CPF/CNPJ
        botResponse = "Para verificar se seu acesso está bloqueado ou liberar o sinal, preciso do CPF ou CNPJ do titular da conta. Pode me informar, por favor?";
      } else {
        // REATIVAR IA: Se não processou com IXC, deixar IA responder
        console.log(`[AI Service] Não processou com IXC. Ativando IA para responder...`);
        
        let finalMessage = processedContent;
        
        if (mediaType === "audio") {
          console.log(`[AI Service] Processing audio message. Transcribed text: "${processedContent}"`);
        }
        
        if (resolvedMediaUrl && mediaType === "image") {
          finalMessage = `[O usuário enviou uma imagem. Analise a imagem e responda adequadamente.]\n${processedContent || ""}`;
        }
        
        try {
          console.log(`[AI Service] Chamando generateBotResponse com workspaceId: ${workspaceId}, conversationId: ${activeConv.id}, message: "${finalMessage.substring(0, 50)}"`);
          botResponse = await generateBotResponse(
            workspaceId,
            activeConv.id,
            finalMessage,
            resolvedMediaUrl && mediaType === "image" ? resolvedMediaUrl : undefined,
            mediaType === "image" ? imageKeywordHints : [],
            contactInNegotiating
          );
          
          console.log(`[AI Service] IA respondeu: "${botResponse.substring(0, 100)}"`);
          
          // Se a IA detectou assunto financeiro, redirecionar para fluxo robotizado
          const botResponseLower = botResponse.toLowerCase();
          const mencionouFinanceiro = botResponseLower.includes("fatura") || 
                                      botResponseLower.includes("boleto") ||
                                      botResponseLower.includes("pagamento") ||
                                      botResponseLower.includes("débito") ||
                                      botResponseLower.includes("pagar");
          
          if (mencionouFinanceiro && temConfiguracaoIXC) {
            console.log(`[AI Service] IA mencionou assunto financeiro. Redirecionando para fluxo IXC...`);
            botResponse = "Entendi que você precisa de ajuda com questões financeiras! 💰\n\nPara consultar suas faturas e boletos, preciso do CPF ou CNPJ do titular da conta.\n\nPor favor, informe o CPF ou CNPJ:";
          }
        } catch (generateError: any) {
          console.error(`[AI Service] ❌ ERRO em generateBotResponse:`, generateError);
          console.error(`[AI Service] ❌ Stack trace:`, generateError?.stack);
          console.error(`[AI Service] ❌ Message:`, generateError?.message);
          botResponse = "Desculpe, ocorreu um erro. Como posso te ajudar?";
        }
      }
      
      
      // Garantir que botResponse sempre tenha um valor antes de usar
      if (!botResponse || botResponse === "") {
        console.log(`[AI Service] ⚠️ botResponse vazio após processamento. Usando mensagem padrão.`);
        botResponse = "Desculpe, não entendi sua solicitação. Por favor, digite:\n\n1️⃣ - Para consultar faturas em aberto\n2️⃣ - Para falar com atendente";
      }

      // Se o bot pediu CPF e o cliente já respondeu várias vezes sem enviar, transferir para suporte
      const atrasouEnvioCpf = (() => {
        if (!botPediuCPF || documentoNaMensagem || documentoHistorico) return false;
        const msgs = messages;
        let lastAskIndex = -1;
        for (let i = msgs.length - 1; i >= 0; i--) {
          const msg = msgs[i];
          if (msg.senderType === "bot") {
            const texto = (msg.content || "").toLowerCase();
            if (
              texto.includes("cpf ou cnpj") ||
              texto.includes("preciso do cpf") ||
              texto.includes("informe seu cpf") ||
              texto.includes("por favor, informe o cpf")
            ) {
              lastAskIndex = i;
              break;
            }
          }
        }
        if (lastAskIndex === -1) return false;
        let respostasSemDocumento = 0;
        for (let j = lastAskIndex + 1; j < msgs.length; j++) {
          const m = msgs[j];
          if (m.senderType === "contact") {
            const doc = detectarDocumento(m.content || "");
            if (doc) return false; // já enviou
            respostasSemDocumento++;
          }
        }
        return respostasSemDocumento >= 2; // duas interações sem documento
      })();

      if (atrasouEnvioCpf) {
        botResponse =
          "Notei que ainda não recebemos o CPF/CNPJ para avançar. Vou acionar nosso suporte técnico para agilizar essa verificação e entender por que sua conexão não está funcionando. Um atendente vai assumir agora.";
        try {
          await db.updateContactKanbanStatus(contactId, "waiting_attendant");
          await db.updateConversationStatus(activeConv.id, "pending_human");
        } catch (err) {
          console.error("[AI Service] Erro ao mover contato por atraso de CPF:", err);
        }
      }

      // Se cliente pede internet em zona rural, transferir para suporte para checar viabilidade
      const querInternet = ["internet", "plano", "wifi", "fibra"].some(k => normalizedContent.includes(k));
      const zonaRural = ["zona rural", "rural", "sítio", "sitio", "chácara", "chacara", "fazenda", "interior", "roça", "roca"].some(k =>
        normalizedContent.includes(k)
      );
      if (querInternet && zonaRural) {
        botResponse =
          "Entendi que você deseja internet em uma área rural. Vou acionar nosso suporte técnico para verificar cobertura e viabilidade no seu endereço. Um atendente vai assumir a partir de agora.";
        try {
          await db.updateContactKanbanStatus(contactId, "waiting_attendant");
          await db.updateConversationStatus(activeConv.id, "pending_human");
        } catch (err) {
          console.error("[AI Service] Erro ao mover contato para suporte por zona rural:", err);
        }
      }

      // Se o cliente relatou falta de internet e o financeiro está ok, acionar suporte técnico
      const semInternetKeywords = ["sem internet", "sem conex", "sem sinal", "internet caiu", "caiu a internet", "internet não funciona", "internet nao funciona"];
      const reportaSemInternet = semInternetKeywords.some(k => normalizedContent.includes(k));
      const financeiroOk =
        botResponse.toLowerCase().includes("não há faturas em atraso") ||
        botResponse.toLowerCase().includes("não ha faturas em atraso") ||
        botResponse.toLowerCase().includes("está em dia") ||
        botResponse.toLowerCase().includes("esta em dia");
      if (reportaSemInternet && financeiroOk) {
        botResponse =
          `${botResponse}\n\nEntendi que você está sem internet e sua parte financeira está ok. Vou acionar nosso suporte técnico agora para verificar. Enquanto isso, confirme por favor:\n- O roteador está ligado e com luzes acesas?\n- Algum cabo está solto ou desconectado?\n\nUm atendente técnico vai assumir a partir daqui.`;
        // mover contato para aguardando atendente para suporte técnico
        try {
          await db.updateContactKanbanStatus(contactId, "waiting_attendant");
          await db.updateConversationStatus(activeConv.id, "pending_human");
        } catch (err) {
          console.error("[AI Service] Erro ao mover contato para suporte técnico:", err);
        }
      }

      const botResponseLowerCase = botResponse.toLowerCase();
      const standardTransferIndicators = [
        "entendi! vou transferir você",
        "vou transferir você agora para um atendente humano",
        "vou transferir você para um atendente humano",
        "estou transferindo você para nossa equipe de atendimento agora mesmo"
      ];
      const isStandardTransferMessage = standardTransferIndicators.some(indicator =>
        botResponseLowerCase.includes(indicator)
      );

      if (!contactInNegotiating && isStandardTransferMessage) {
        try {
          await db.updateContactKanbanStatus(contactId, "negotiating");
          contactInNegotiating = true;
          console.log(`[AI Service] Mensagem padrão de transferência detectada. Contato ${contactId} movido para "Negociando".`);
        } catch (error) {
          console.error(`[AI Service] Erro ao atualizar status para "Negociando" após mensagem padrão de transferência:`, error);
        }
      }

      // Se já está em negotiating, NÃO transferir novamente - apenas continuar respondendo
      // Verificar se a resposta da IA indica que deve transferir (apenas se NÃO estiver em negotiating)
      let responseIndicatesTransfer = false;
      let responseIndicatesUnknown = false;
      let deveTransferirPorIndecisao = false;
      
      if (!contactInNegotiating) {
        // Buscar histórico ANTES de verificar transferência na resposta
        const messagesForHistoryCheck = await db.getMessagesByConversation(activeConv.id);
        const botMessagesForCheck = messagesForHistoryCheck.filter(m => m.senderType === "bot");
        
        // Só verificar transferência na resposta se já tiver pelo menos 3 mensagens do bot
        // Isso evita que a primeira resposta já dispare transferência
        if (botMessagesForCheck.length >= 3) {
          // Só verificar transferência se não está em negotiating
          const transferKeywords = ["transferir", "atendente"];
          const containsHumano = botResponseLowerCase.includes("humano");
          
          // Só detectar transferência se NÃO for a mensagem padrão e contiver todas as palavras-chave
          responseIndicatesTransfer = !isStandardTransferMessage && 
                                     transferKeywords.every(keyword => botResponseLowerCase.includes(keyword)) && 
                                     containsHumano;
          
          console.log(`[AI Service] Verificando resposta da IA para transferência:`, {
            botResponseLength: botResponseLowerCase.length,
            containsTransfer: botResponseLowerCase.includes("transferir"),
            containsAtendente: botResponseLowerCase.includes("atendente"),
            containsHumano: containsHumano,
            isStandardTransferMessage,
            responseIndicatesTransfer,
            botMessagesCount: botMessagesForCheck.length
          });
        }

        // Detectar se cliente ainda está indeciso na resposta atual
        const indecisaoNaResposta = detectarIndecisaoOuSemFechamento(processedContent);
        
        // Buscar mensagens para verificar histórico (se ainda não foi feito)
        const messagesForIndecisao = await db.getMessagesByConversation(activeConv.id);
        const botMessagesForIndecisao = messagesForIndecisao.filter(m => m.senderType === "bot");

        // NÃO transferir em perguntas simples sobre produtos
        // Exigir confiança MUITO alta E múltiplas interações antes de transferir
        deveTransferirPorIndecisao = indecisaoNaResposta.precisaAtendente && 
                                        indecisaoNaResposta.confianca > 0.8 && 
                                        botMessagesForIndecisao.length >= 5; // Pelo menos 5 respostas do bot (já tentou ajudar várias vezes)
      }

      const fallbackPhrases = [
        "não tenho informação",
        "não possuo informação",
        "não sei informar",
        "não possuo os dados",
        "não encontrei",
        "não consigo responder",
        "não posso fornecer",
        "não tenho acesso",
        "não está configurada",
        "não está disponível",
        "integração",
        "contato com o suporte",
        "procure um atendente",
        "não consigo acessar",
        "não consegui analisar a imagem",
        "não consigo analisar a imagem",
        "não consigo ver a imagem",
        "não consegui ver a imagem",
        "não reconheço a imagem",
        "não consegui identificar na imagem",
        "não consigo interpretar a imagem",
        "imagem não está clara",
        "imagem não ficou clara",
        "não é possível identificar pela imagem",
      ];

      if (!contactInNegotiating) {
        // Buscar histórico para verificar se deve checar fallback phrases
        const messagesForFallbackCheck = await db.getMessagesByConversation(activeConv.id);
        const botMessagesForFallbackCheck = messagesForFallbackCheck.filter(m => m.senderType === "bot");
        
        // Só verificar frases de fallback se já tiver pelo menos 3 mensagens do bot
        if (botMessagesForFallbackCheck.length >= 3) {
          const botResponseString = botResponse.toLowerCase();
          responseIndicatesUnknown = fallbackPhrases.some(phrase => botResponseString.includes(phrase));
        }
      }

      // Transferir automaticamente APENAS se:
      // 1. IA indicou transferência explicitamente E já tentou ajudar MUITO (5+ mensagens recentes)
      // 2. Cliente demonstra indecisão após várias interações recentes (confiança muito alta + 5+ mensagens recentes)
      // 3. IA não consegue ajudar E já tentou várias vezes (5+ mensagens recentes)
      // IMPORTANTE: NÃO fazer isso se já está em negotiating (já foi transferido)
      // IMPORTANTE: NÃO perguntar, apenas transferir automaticamente
      // NÃO transferir em perguntas simples sobre produtos
      // NÃO transferir nas primeiras interações - dar chance para a IA ajudar primeiro
      // IMPORTANTE: Considerar apenas mensagens RECENTES (últimas 2 horas) para evitar transferir por conversas antigas
      const duasHorasAtrasForTransfer = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const messagesForHistoryCheck = await db.getMessagesByConversation(activeConv.id);
      const botMessagesForTransfer = messagesForHistoryCheck
        .filter(m => m.senderType === "bot" && m.createdAt && new Date(m.createdAt) >= duasHorasAtrasForTransfer);
      const jaTentouAjudar = botMessagesForTransfer.length >= 5; // Pelo menos 5 tentativas recentes de ajudar
      
      console.log(`[AI Service] Verificando transferência final:`, {
        contactInNegotiating,
        jaTentouAjudar,
        botMessagesCount: botMessagesForTransfer.length,
        responseIndicatesTransfer,
        responseIndicatesUnknown,
        deveTransferirPorIndecisao
      });
      
      if (!contactInNegotiating && jaTentouAjudar && (responseIndicatesTransfer || responseIndicatesUnknown || deveTransferirPorIndecisao)) {
        const motivoTransfer = responseIndicatesTransfer 
          ? "IA indicou transferência"
          : responseIndicatesUnknown
          ? "IA não conseguiu ajudar"
          : "Cliente demonstra indecisão após ver produtos";
        
        console.log(`[AI Service] Transferindo automaticamente para atendente humano - Motivo: ${motivoTransfer}`);
        
        // Remover qualquer pergunta e substituir por transferência direta
        botResponse = gerarMensagemTransferencia(contact?.name || undefined);

        console.log(`[AI Service] Bot response indica transferência automática para humano. Atualizando status do contato ${contactId}.`);
        
        // Atualizar status do contato e conversa
        await db.updateContactKanbanStatus(contactId, "negotiating");
        // Manter bot_handling para continuar respondendo (não mudar para pending_human)
        // await db.updateConversationStatus(activeConv.id, "pending_human");
        console.log(`[AI Service] Contato ${contactId} movido para "Negociando". Bot continuará respondendo.`);
      }

      // Salvar resposta do bot
      await db.createMessage({
        conversationId: activeConv.id,
        senderType: "bot",
        content: botResponse,
      });

      // Enviar resposta via WhatsApp API
      console.log(`[AI Service] Bot response generated for ${destinationNumber}:`, botResponse.substring(0, 100));
      
      try {
        const { sendTextMessage } = await import("./whatsappService");
        
        // Buscar instância para enviar resposta
        const instances = await db.getWhatsappInstancesByWorkspace(workspaceId);
        console.log(`[AI Service] Found ${instances.length} instances for workspace ${workspaceId}`);
        
        const instance = instances.find(i => i.id === instanceId);
        console.log(`[AI Service] Looking for instance ${instanceId}:`, {
          found: !!instance,
          instanceKey: instance?.instanceKey || "missing",
        });
        
        if (instance && instance.instanceKey) {
          console.log(`[AI Service] Attempting to send message via WhatsApp:`, {
            instanceKey: instance.instanceKey,
            destinationNumber,
            messageLength: botResponse.length,
          });
          
          await sendTextMessage(instance.instanceKey, destinationNumber, botResponse);
          console.log(`[AI Service] Response sent successfully to ${destinationNumber}`);
        } else {
          console.error(`[AI Service] Instance not found or invalid:`, {
            instanceId,
            instanceFound: !!instance,
            instanceKey: instance?.instanceKey || "missing",
          });
        }
      } catch (error: any) {
        console.error(`[AI Service] Error sending response to WhatsApp:`, error);
        console.error(`[AI Service] Error stack:`, error?.stack);
      }
    }
  } catch (error) {
    console.error("[AI Service] Error processing incoming message:", error);
    throw error;
  }
}

