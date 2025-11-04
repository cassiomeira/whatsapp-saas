import { getIXCService, IXCFatura } from "./ixcService";
import * as db from "./db";

/**
 * Detectar CPF ou CNPJ na mensagem
 */
export function detectarDocumento(mensagem: string): string | null {
  // Remover tudo que não é número
  const numeros = mensagem.replace(/\D/g, "");
  
  // CPF tem 11 dígitos, CNPJ tem 14
  if (numeros.length === 11 || numeros.length === 14) {
    return numeros;
  }
  
  return null;
}

/**
 * Detectar se a mensagem do usuário requer ação do IXC
 */
export function detectarIntencaoIXC(mensagem: string): {
  tipo: "consulta_fatura" | "desbloqueio" | "nenhuma";
  confianca: number;
  documento?: string;
} {
  const msg = mensagem.toLowerCase();

  // Detectar CPF/CNPJ na mensagem
  const documento = detectarDocumento(mensagem);

  // Palavras-chave para consulta de fatura
  const palavrasFatura = [
    "fatura", "boleto", "conta", "débito", "dívida", "devendo",
    "pagar", "pagamento", "vencimento", "atrasado", "pendente",
    "segunda via", "2 via", "2ª via", "cpf", "cnpj", "quanto"
  ];

  // Palavras-chave para desbloqueio
  const palavrasDesbloqueio = [
    "desbloquear", "desbloqueio", "liberar", "liberação",
    "internet", "conexão", "bloqueado", "bloqueio",
    "confiança", "confian", "acesso"
  ];

  // Se tem documento, provavelmente é consulta de fatura
  if (documento) {
    console.log(`[IXC AI Helper] Documento detectado: ${documento}`);
    return { tipo: "consulta_fatura", confianca: 0.95, documento };
  }

  // Verificar consulta de fatura
  const matchFatura = palavrasFatura.filter(p => msg.includes(p)).length;
  if (matchFatura >= 1) {
    return { tipo: "consulta_fatura", confianca: Math.min(matchFatura * 0.3, 0.9) };
  }

  // Verificar desbloqueio
  const matchDesbloqueio = palavrasDesbloqueio.filter(p => msg.includes(p)).length;
  if (matchDesbloqueio >= 2) {
    return { tipo: "desbloqueio", confianca: Math.min(matchDesbloqueio * 0.3, 0.9) };
  }

  return { tipo: "nenhuma", confianca: 0 };
}

/**
 * Processar consulta de fatura via IXC
 */
export async function processarConsultaFatura(
  workspaceId: number,
  telefone: string,
  documento?: string
): Promise<string> {
  try {
    // Buscar configuração IXC do workspace
    const workspace = await db.getWorkspaceById(workspaceId);
    const metadata = workspace?.metadata as any;

    if (!metadata?.ixcApiUrl || !metadata?.ixcApiToken) {
      return "Desculpe, a integração com o sistema de faturas não está configurada. Por favor, entre em contato com o suporte.";
    }

    const ixcService = getIXCService({
      apiUrl: metadata.ixcApiUrl,
      apiToken: metadata.ixcApiToken,
    });

    if (!ixcService) {
      return "Erro ao conectar com o sistema de faturas.";
    }

    // Buscar cliente por documento (se fornecido) ou telefone
    let cliente = null;
    
    if (documento) {
      console.log(`[IXC AI Helper] Buscando cliente por documento: ${documento}`);
      try {
        cliente = await ixcService.buscarClientePorDocumento(documento);
      } catch (error) {
        console.error(`[IXC AI Helper] Erro ao buscar por documento:`, error);
      }
    }
    
    if (!cliente) {
      console.log(`[IXC AI Helper] Buscando cliente por telefone: ${telefone}`);
      try {
        cliente = await ixcService.buscarClientePorTelefone(telefone);
      } catch (error) {
        console.error(`[IXC AI Helper] Erro ao buscar por telefone:`, error);
      }
    }

    if (!cliente) {
      return "Não encontrei seu cadastro em nosso sistema. Por favor, verifique se o número está correto ou entre em contato com o suporte.";
    }

    // Buscar faturas em aberto
    const faturas = await ixcService.buscarFaturasEmAberto(cliente.id);

    if (faturas.length === 0) {
      return `Olá ${cliente.razao}! 😊\n\nConsultei seu cadastro e não há faturas em aberto no momento. Você está em dia com seus pagamentos! ✅`;
    }

    // Formatar resposta com as faturas
    let resposta = `Olá ${cliente.razao}! 📋\n\nEncontrei ${faturas.length} ${faturas.length === 1 ? "fatura em aberto" : "faturas em aberto"}:\n\n`;

    faturas.forEach((fatura: IXCFatura, index: number) => {
      const valor = ixcService.formatarValor(fatura.valor);
      const vencimento = ixcService.formatarData(fatura.data_vencimento);
      const status = new Date(fatura.data_vencimento) < new Date() ? "⚠️ VENCIDA" : "📅 A vencer";

      resposta += `${index + 1}. ${status}\n`;
      resposta += `   💰 Valor: ${valor}\n`;
      resposta += `   📆 Vencimento: ${vencimento}\n`;
      if (fatura.documento) {
        resposta += `   📄 Documento: ${fatura.documento}\n`;
      }
      resposta += `\n`;
    });

    resposta += `\nPara efetuar o pagamento, você pode:\n`;
    resposta += `• Pedir a segunda via do boleto\n`;
    resposta += `• Solicitar o PIX para pagamento\n`;
    resposta += `• Pedir desbloqueio de confiança (se disponível)\n\n`;
    resposta += `Como posso te ajudar? 😊`;

    return resposta;
  } catch (error: any) {
    console.error("[IXC AI Helper] Erro ao consultar fatura:", error);
    return "Desculpe, ocorreu um erro ao consultar suas faturas. Por favor, tente novamente mais tarde ou entre em contato com o suporte.";
  }
}

/**
 * Processar desbloqueio de confiança via IXC
 */
export async function processarDesbloqueio(
  workspaceId: number,
  telefone: string,
  documento?: string
): Promise<string> {
  try {
    // Buscar configuração IXC do workspace
    const workspace = await db.getWorkspaceById(workspaceId);
    const metadata = workspace?.metadata as any;

    if (!metadata?.ixcApiUrl || !metadata?.ixcApiToken) {
      return "Desculpe, a funcionalidade de desbloqueio não está configurada. Por favor, entre em contato com o suporte.";
    }

    const ixcService = getIXCService({
      apiUrl: metadata.ixcApiUrl,
      apiToken: metadata.ixcApiToken,
    });

    if (!ixcService) {
      return "Erro ao conectar com o sistema.";
    }

    // Buscar cliente por documento (se fornecido) ou telefone
    let cliente = null;
    
    if (documento) {
      console.log(`[IXC AI Helper] Buscando cliente por documento: ${documento}`);
      try {
        cliente = await ixcService.buscarClientePorDocumento(documento);
      } catch (error) {
        console.error(`[IXC AI Helper] Erro ao buscar por documento:`, error);
      }
    }
    
    if (!cliente) {
      console.log(`[IXC AI Helper] Buscando cliente por telefone: ${telefone}`);
      try {
        cliente = await ixcService.buscarClientePorTelefone(telefone);
      } catch (error) {
        console.error(`[IXC AI Helper] Erro ao buscar por telefone:`, error);
      }
    }

    if (!cliente) {
      return "Não encontrei seu cadastro em nosso sistema. Por favor, verifique se o número está correto ou entre em contato com o suporte.";
    }

    // Executar desbloqueio
    const resultado = await ixcService.executarDesbloqueioConfianca(cliente.id);

    if (resultado.success) {
      return `✅ ${resultado.message}\n\n${cliente.razao}, seu acesso foi liberado! 🎉\n\nLembre-se de regularizar seus pagamentos o quanto antes para evitar novos bloqueios.\n\nPrecisa de mais alguma ajuda? 😊`;
    } else {
      return `❌ Não foi possível realizar o desbloqueio.\n\n${resultado.message}\n\nPor favor, entre em contato com o suporte para mais informações.`;
    }
  } catch (error: any) {
    console.error("[IXC AI Helper] Erro ao processar desbloqueio:", error);
    return "Desculpe, ocorreu um erro ao processar o desbloqueio. Por favor, entre em contato com o suporte.";
  }
}

/**
 * Enriquecer o prompt da IA com contexto IXC
 */
export function enriquecerPromptComIXC(promptOriginal: string): string {
  return `${promptOriginal}

IMPORTANTE - INTEGRAÇÃO IXC SOFT:
Você tem acesso a um sistema de consulta de faturas e desbloqueio de confiança.

NUNCA peça CPF ou CNPJ ao cliente. O sistema já identifica automaticamente pelo telefone do WhatsApp.

Quando o cliente perguntar sobre faturas, débitos ou pagamentos, responda de forma natural e empática.
O sistema irá consultar automaticamente e fornecer as informações reais.

Seja sempre educado, empático e profissional.`;
}

