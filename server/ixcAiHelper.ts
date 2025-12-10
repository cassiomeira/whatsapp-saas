import { getIXCService, IXCFatura } from "./ixcService";
import * as db from "./db";
import { createIxcEvent } from "./db";
import { incrementIxcMetric } from "./db";

/**
 * Detectar CPF ou CNPJ na mensagem
 */
export function detectarDocumento(mensagem: string): string | null {
  // Remover tudo que não é número
  const numeros = mensagem.replace(/\D/g, "");
  
  console.log(`[IXC AI Helper] detectarDocumento - mensagem: "${mensagem}", números extraídos: "${numeros}", length: ${numeros.length}`);
  
  // CPF tem 11 dígitos, CNPJ tem 14
  if (numeros.length === 11 || numeros.length === 14) {
    console.log(`[IXC AI Helper] ✅ Documento detectado: ${numeros}`);
    return numeros;
  }
  
  console.log(`[IXC AI Helper] ❌ Documento não detectado (length: ${numeros.length}, esperado: 11 ou 14)`);
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
    "pagar", "pagamento", "paguei", "vencimento", "atrasado", "pendente",
    "segunda via", "2 via", "2ª via", "cpf", "cnpj", "quanto",
    "pix", "transferência", "transferencia", "pagto", "debito", "valor"
  ];

  // Palavras-chave para desbloqueio
  const palavrasDesbloqueio = [
    "desbloquear", "desbloqueio", "liberar", "liberação", "liberar",
    "internet", "conexão", "bloqueado", "bloqueio",
    "confiança", "confian", "acesso", "me liberar", "me desbloquear"
  ];
  
  // Frases específicas que indicam desbloqueio
  const frasesDesbloqueio = [
    "paguei minha conta",
    "paguei a conta",
    "já paguei",
    "tem como me liberar",
    "pode me liberar",
    "quero que me desbloqueie",
    "preciso que me libere"
  ];

  // PRIORIDADE: Verificar desbloqueio PRIMEIRO (é mais específico)
  // Verificar desbloqueio - primeiro verificar frases específicas
  const temFraseDesbloqueio = frasesDesbloqueio.some(frase => msg.includes(frase));
  if (temFraseDesbloqueio) {
    console.log(`[IXC AI Helper] Frase de desbloqueio detectada`);
    return { tipo: "desbloqueio", confianca: 0.95, documento };
  }
  
  // Verificar desbloqueio por palavras-chave
  const matchDesbloqueio = palavrasDesbloqueio.filter(p => msg.includes(p)).length;
  if (matchDesbloqueio >= 1) {
    console.log(`[IXC AI Helper] Palavras de desbloqueio detectadas: ${matchDesbloqueio}`);
    return { tipo: "desbloqueio", confianca: Math.min(matchDesbloqueio * 0.4, 0.9), documento };
  }

  // Se tem documento, provavelmente é consulta de fatura
  if (documento) {
    console.log(`[IXC AI Helper] Documento detectado: ${documento}`);
    return { tipo: "consulta_fatura", confianca: 0.95, documento };
  }

  // Verificar consulta de fatura
  const matchFatura = palavrasFatura.filter(p => msg.includes(p)).length;
  if (matchFatura >= 1) {
    console.log(`[IXC AI Helper] Palavras de fatura detectadas: ${matchFatura}`);
    return { tipo: "consulta_fatura", confianca: Math.min(matchFatura * 0.3, 0.9) };
  }

  return { tipo: "nenhuma", confianca: 0 };
}

/**
 * Processar consulta de fatura via IXC
 */
export async function processarConsultaFatura(
  workspaceId: number,
  telefone: string,
  documento?: string,
  contactId?: number,
  conversationId?: number
): Promise<string> {
  try {
    console.log(`[IXC AI Helper] processarConsultaFatura chamado - workspaceId: ${workspaceId}, telefone: ${telefone}, documento: ${documento}`);
    
    // Buscar configuração IXC do workspace
    const workspace = await db.getWorkspaceById(workspaceId);
    const metadata = workspace?.metadata as any;

    console.log(`[IXC AI Helper] Workspace encontrado:`, !!workspace);
    console.log(`[IXC AI Helper] Metadata:`, metadata ? { 
      temIxcApiUrl: !!metadata.ixcApiUrl, 
      temIxcApiToken: !!metadata.ixcApiToken,
      ixcApiUrl: metadata.ixcApiUrl ? `${metadata.ixcApiUrl.substring(0, 20)}...` : 'não configurado'
    } : 'metadata é null');

    if (!metadata?.ixcApiUrl || !metadata?.ixcApiToken) {
      console.log(`[IXC AI Helper] ⚠️ Configuração IXC não encontrada! ixcApiUrl: ${!!metadata?.ixcApiUrl}, ixcApiToken: ${!!metadata?.ixcApiToken}`);
      await incrementIxcMetric(workspaceId, "consulta", false);
      await createIxcEvent({
        workspaceId,
        contactId,
        conversationId,
        type: "consulta",
        status: "fail",
        message: `Configuração IXC ausente | contatoId=${contactId ?? "?"} | tel=${telefone}`,
      });
      return "No momento não consigo consultar sua fatura automaticamente. Vou transferir você para um atendente humano para que ele confirme essas informações, tudo bem?";
    }
    
    console.log(`[IXC AI Helper] ✅ Configuração IXC encontrada!`);

    const ixcService = getIXCService({
      apiUrl: metadata.ixcApiUrl,
      apiToken: metadata.ixcApiToken,
    });

    if (!ixcService) {
      await incrementIxcMetric(workspaceId, "consulta", false);
      await createIxcEvent({
        workspaceId,
        contactId,
        conversationId,
        type: "consulta",
        status: "fail",
        message: `Erro ao conectar com o IXC | contatoId=${contactId ?? "?"} | tel=${telefone}`,
      });
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
      // Se não tem documento, pedir CPF
      if (!documento) {
        await incrementIxcMetric(workspaceId, "consulta", false);
        await createIxcEvent({
          workspaceId,
          contactId,
          conversationId,
          type: "consulta",
          status: "fail",
          message: `Cliente não identificado (falta CPF/CNPJ) | contatoId=${contactId ?? "?"} | tel=${telefone}`,
        });
        return "Para consultar suas faturas, preciso do CPF ou CNPJ do titular da conta. Pode me informar, por favor?";
      }
      // Se tem documento mas não encontrou, pode ser que o documento esteja incorreto
      await incrementIxcMetric(workspaceId, "consulta", false);
      await createIxcEvent({
        workspaceId,
        contactId,
        conversationId,
        type: "consulta",
        status: "fail",
        message: `Cliente não encontrado com o documento informado | contatoId=${contactId ?? "?"} | tel=${telefone}`,
      });
      return "Não encontrei seu cadastro em nosso sistema com o documento informado. Pode verificar e me informar o CPF ou CNPJ correto, por favor?";
    }

    // Buscar faturas em aberto (status 'A')
    const faturasAbertas = await ixcService.buscarFaturasEmAberto(cliente.id);

    console.log(`[IXC AI Helper] Faturas abertas retornadas do serviço: ${faturasAbertas.length}`);

    // Filtrar apenas faturas VENCIDAS - EXATAMENTE como no script Python
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const faturasVencidas = faturasAbertas.filter((fatura: IXCFatura) => {
      try {
        // Python: data_obj = datetime.strptime(data_str, '%Y-%m-%d').date()
        const dataVencStr = fatura.data_vencimento.split('T')[0]; // Remove hora se houver
        const [ano, mes, dia] = dataVencStr.split('-').map(Number);
        const dataVenc = new Date(ano, mes - 1, dia);
        dataVenc.setHours(0, 0, 0, 0);
        
        // Python: if data_obj < hoje
        const isVencida = dataVenc < hoje;
        
        console.log(`[IXC AI Helper] Fatura ${fatura.id}: venc="${dataVencStr}" -> ${dataVenc.toLocaleDateString('pt-BR')} - Vencida: ${isVencida}`);
        
        return isVencida;
      } catch (error) {
        console.error(`[IXC AI Helper] Erro ao processar data da fatura ${fatura.id}:`, error);
        return false;
      }
    });

    console.log(`[IXC AI Helper] === RESULTADO DO FILTRO ===`);
    console.log(`[IXC AI Helper] Total abertas: ${faturasAbertas.length}`);
    console.log(`[IXC AI Helper] Total vencidas: ${faturasVencidas.length}`);

    if (faturasVencidas.length === 0) {
      await incrementIxcMetric(workspaceId, "consulta", true);
      await createIxcEvent({
        workspaceId,
        contactId,
        conversationId,
        type: "consulta",
        status: "success",
        message: `Sem faturas em atraso para ${cliente.razao} | contatoId=${contactId ?? "?"} | tel=${telefone}`,
      });
      return `Olá ${cliente.razao}! 😊\n\nConsultei seu cadastro e não há faturas em atraso no momento. Você está em dia com seus pagamentos! ✅`;
    }

    // Reutilizar workspace e metadata já obtidos no início da função
    const ixcUrl = metadata?.ixcApiUrl || 'sis.netcartelecom.com.br';

    // Formatar resposta com as faturas VENCIDAS em aberto
    let resposta = `Olá ${cliente.razao}! 📋\n\n⚠️ ATENÇÃO: ${faturasVencidas.length} ${faturasVencidas.length === 1 ? "fatura vencida" : "faturas vencidas"} em aberto:\n\n`;

    // Baixar boletos e preparar para envio
    const boletosParaEnviar: Array<{ idFatura: number; pdfBase64: string; nomeArquivo: string }> = [];

    for (let index = 0; index < faturasVencidas.length; index++) {
      const fatura = faturasVencidas[index];
      const valor = ixcService.formatarValor(fatura.valor);
      const vencimento = ixcService.formatarData(fatura.data_vencimento);

      resposta += `${index + 1}. ⚠️ VENCIDA\n`;
      resposta += `   💰 Valor: ${valor}\n`;
      resposta += `   📆 Vencimento: ${vencimento}\n`;
      if (fatura.documento) {
        resposta += `   📄 Documento: ${fatura.documento}\n`;
      }
      
      // Adicionar código de barras (linha digitável) se disponível
      const linhaDigitavel = (fatura as any).linha_digitavel;
      console.log(`[IXC AI Helper] Fatura ${fatura.id} - linha_digitavel:`, linhaDigitavel ? 'SIM' : 'NÃO', linhaDigitavel);
      
      if (linhaDigitavel) {
        resposta += `   🔢 Código de Barras (Linha Digitável):\n`;
        resposta += `   ${linhaDigitavel}\n`;
      } else {
        resposta += `   ⚠️ Esta fatura não possui código de barras gerado.\n`;
      }
      
      // Adicionar link do boleto se disponível
      const linkBoleto = (fatura as any).boleto || fatura.url_boleto;
      if (linkBoleto) {
        let linkCompleto = linkBoleto;
        if (!linkBoleto.startsWith('http')) {
          linkCompleto = `https://${ixcUrl}/${linkBoleto}`;
        }
        resposta += `   🔗 Link do Boleto: ${linkCompleto}\n`;
      }
      
      resposta += `\n`;
      
      // Baixar boleto para enviar via WhatsApp
      try {
        console.log(`[IXC AI Helper] ========================================`);
        console.log(`[IXC AI Helper] Baixando boleto ${fatura.id}...`);
        const resultadoBoleto = await ixcService.buscarBoleto(fatura.id);
        console.log(`[IXC AI Helper] Resultado do download:`, {
          success: resultadoBoleto.success,
          temPDF: !!resultadoBoleto.pdfBase64,
          tamanhoPDF: resultadoBoleto.pdfBase64 ? resultadoBoleto.pdfBase64.length : 0,
          erro: resultadoBoleto.error
        });
        
        if (resultadoBoleto.success && resultadoBoleto.pdfBase64) {
          boletosParaEnviar.push({
            idFatura: fatura.id,
            pdfBase64: resultadoBoleto.pdfBase64,
            nomeArquivo: `Boleto_${fatura.id}.pdf`
          });
          console.log(`[IXC AI Helper] ✅ Boleto ${fatura.id} baixado com sucesso (${resultadoBoleto.pdfBase64.length} bytes)`);
          await incrementIxcMetric(workspaceId, "boleto", true);
          await createIxcEvent({
            workspaceId,
            contactId,
            conversationId,
            type: "boleto",
            status: "success",
            invoiceId: fatura.id,
            message: `Boleto ${fatura.id} enviado | contatoId=${contactId ?? "?"} | tel=${telefone}`,
          });
        } else {
          console.error(`[IXC AI Helper] ❌ Erro ao baixar boleto ${fatura.id}:`, resultadoBoleto.error);
          await incrementIxcMetric(workspaceId, "boleto", false);
          await createIxcEvent({
            workspaceId,
            contactId,
            conversationId,
            type: "boleto",
            status: "fail",
            invoiceId: fatura.id,
            message: `${resultadoBoleto.error || "Falha ao baixar boleto"} | contatoId=${contactId ?? "?"} | tel=${telefone}`,
          });
        }
      } catch (error) {
        console.error(`[IXC AI Helper] Exceção ao baixar boleto ${fatura.id}:`, error);
        await incrementIxcMetric(workspaceId, "boleto", false);
        await createIxcEvent({
          workspaceId,
          contactId,
          conversationId,
          type: "boleto",
          status: "fail",
          invoiceId: fatura.id,
          message: `${(error as any)?.message || "Exceção ao baixar boleto"} | contatoId=${contactId ?? "?"} | tel=${telefone}`,
        });
      }
    }

    console.log(`[IXC AI Helper] ========================================`);
    console.log(`[IXC AI Helper] Total de boletos baixados: ${boletosParaEnviar.length}`);
    console.log(`[IXC AI Helper] ========================================`);

    if (boletosParaEnviar.length > 0) {
      resposta += `\n📄 *Boleto(s) em anexo*\n\n`;
    }
    
    resposta += `*Deseja realizar o desbloqueio de confiança?*\n\n`;
    resposta += `Digite *SIM* para desbloquear ou *NÃO* para cancelar.`;

    // Se houver boletos, retornar como JSON para processamento especial
    if (boletosParaEnviar.length > 0) {
      console.log(`[IXC AI Helper] Retornando resposta com ${boletosParaEnviar.length} boleto(s) como JSON`);
      await incrementIxcMetric(workspaceId, "consulta", true);
      await createIxcEvent({
        workspaceId,
        contactId,
        conversationId,
        type: "consulta",
        status: "success",
        message: `Consulta com ${boletosParaEnviar.length} boleto(s) | contatoId=${contactId ?? "?"} | tel=${telefone}`,
      });
      return JSON.stringify({
        tipo: 'consulta_com_boletos',
        mensagem: resposta,
        boletos: boletosParaEnviar
      });
    }
    
    // Se não houver boletos, retornar apenas a mensagem
    console.log(`[IXC AI Helper] Nenhum boleto baixado, retornando apenas mensagem de texto`);
    await incrementIxcMetric(workspaceId, "consulta", true);
    await createIxcEvent({
      workspaceId,
      contactId,
      conversationId,
      type: "consulta",
      status: "success",
      message: `Consulta sem boleto (retorno texto) | contatoId=${contactId ?? "?"} | tel=${telefone}`,
    });
    return resposta;
  } catch (error: any) {
    console.error("[IXC AI Helper] Erro ao consultar fatura:", error);
    await incrementIxcMetric(workspaceId, "consulta", false);
    await createIxcEvent({
      workspaceId,
      contactId,
      conversationId,
      type: "consulta",
      status: "fail",
      message: `${error?.message || "Erro geral na consulta"} | contatoId=${contactId ?? "?"} | tel=${telefone}`,
    });
    return "Desculpe, ocorreu um imprevisto na consulta da fatura. Vou transferir você agora para um atendente humano continuar o atendimento, certo?";
  }
}

/**
 * Processar desbloqueio de confiança via IXC
 */
export async function processarDesbloqueio(
  workspaceId: number,
  telefone: string,
  documento?: string,
  contactId?: number,
  conversationId?: number
): Promise<string> {
  try {
    // Buscar configuração IXC do workspace
    const workspace = await db.getWorkspaceById(workspaceId);
    const metadata = workspace?.metadata as any;

    if (!metadata?.ixcApiUrl || !metadata?.ixcApiToken) {
      await incrementIxcMetric(workspaceId, "desbloqueio", false);
      return "Ainda não consigo fazer esse desbloqueio automaticamente. Vou transferir você para um atendente humano resolver isso rapidinho, tudo bem?";
    }

    const ixcService = getIXCService({
      apiUrl: metadata.ixcApiUrl,
      apiToken: metadata.ixcApiToken,
    });

    if (!ixcService) {
      await incrementIxcMetric(workspaceId, "desbloqueio", false);
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
      // Se não tem documento, pedir CPF
      if (!documento) {
        await incrementIxcMetric(workspaceId, "desbloqueio", false);
        return "Para realizar o desbloqueio, preciso do CPF ou CNPJ do titular da conta. Pode me informar, por favor?";
      }
      // Se tem documento mas não encontrou, pode ser que o documento esteja incorreto
      await incrementIxcMetric(workspaceId, "desbloqueio", false);
      return "Não encontrei seu cadastro em nosso sistema com o documento informado. Pode verificar e me informar o CPF ou CNPJ correto, por favor?";
    }

    // EXECUTAR DESBLOQUEIO VIA TYPESCRIPT (NATIVO)
    console.log(`[IXC AI Helper] ========================================`);
    console.log(`[IXC AI Helper] Executando desbloqueio via TypeScript`);
    console.log(`[IXC AI Helper] Cliente: ${cliente.razao} (ID: ${cliente.id})`);
    
    try {
      const resultado = await ixcService.executarDesbloqueioConfianca(cliente.id);
      
      console.log(`[IXC AI Helper] Resultado do desbloqueio:`, resultado);
      
      if (resultado.success) {
        console.log(`[IXC AI Helper] ✅ Desbloqueio executado com sucesso`);
        await incrementIxcMetric(workspaceId, "desbloqueio", true);
        await createIxcEvent({
          workspaceId,
          contactId,
          conversationId,
          type: "desbloqueio",
          status: "success",
          message: `${resultado.message || "Desbloqueio realizado com sucesso"} | contatoId=${contactId ?? "?"} | tel=${telefone}`,
        });
        return `✅ Desbloqueio de confiança realizado com sucesso!\n\n${cliente.razao}, seu acesso foi liberado! 🎉\n\nSeu contrato foi desbloqueado por 3 dias. Caso não regularize a situação financeira até lá, voltará a ser automaticamente bloqueado.\n\nPrecisa de mais alguma ajuda? 😊`;
      } else {
        console.log(`[IXC AI Helper] ❌ Desbloqueio falhou: ${resultado.message}`);
        await incrementIxcMetric(workspaceId, "desbloqueio", false);
        await createIxcEvent({
          workspaceId,
          contactId,
          conversationId,
          type: "desbloqueio",
          status: "fail",
          message: `${resultado.message || "Desbloqueio falhou"} | contatoId=${contactId ?? "?"} | tel=${telefone}`,
        });
        return `❌ Não foi possível realizar o desbloqueio no momento.\n\nMotivo: ${resultado.message}\n\nPor favor, entre em contato com o suporte para mais informações.`;
      }
    } catch (error: any) {
      console.error(`[IXC AI Helper] Erro ao executar desbloqueio nativo:`, error);
      await incrementIxcMetric(workspaceId, "desbloqueio", false);
      await createIxcEvent({
        workspaceId,
        contactId,
        conversationId,
        type: "desbloqueio",
        status: "fail",
        message: `${error?.message || "Exceção ao executar desbloqueio"} | contatoId=${contactId ?? "?"} | tel=${telefone}`,
      });
      return `❌ Erro ao processar desbloqueio.\n\nPor favor, entre em contato com o suporte.`;
    }
  } catch (error: any) {
    console.error("[IXC AI Helper] Erro ao processar desbloqueio:", error);
    await incrementIxcMetric(workspaceId, "desbloqueio", false);
    await createIxcEvent({
      workspaceId,
      contactId,
      conversationId,
      type: "desbloqueio",
      status: "fail",
      message: `${error?.message || "Exceção geral ao processar desbloqueio"} | contatoId=${contactId ?? "?"} | tel=${telefone}`,
    });
    return "Desculpe, ocorreu um imprevisto ao tentar desbloquear agora. Vou transferir você para um atendente humano ajudar imediatamente, combinado?";
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

