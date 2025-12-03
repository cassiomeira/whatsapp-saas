import axios, { AxiosInstance } from "axios";

export interface IXCConfig {
  apiUrl: string;
  apiToken: string;
}

export interface IXCCliente {
  id: number;
  razao: string;
  cnpj_cpf: string;
  telefone_celular?: string;
  email?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
}

export interface IXCFatura {
  id: number;
  id_cliente: number;
  valor: string;
  data_vencimento: string;
  data_emissao: string;
  status: string;
  status_cobranca: string;
  documento: string;
  obs?: string;
  url_boleto?: string;
  linha_digitavel?: string; // Código de barras (linha digitável)
  boleto?: string; // Link do boleto
}

export interface IXCDesbloqueioResponse {
  success: boolean;
  message: string;
  data?: any;
}

export class IXCSoftService {
  private client: AxiosInstance;
  private config: IXCConfig;

  constructor(config: IXCConfig) {
    this.config = config;
    
    // Garantir que a URL tenha protocolo
    let apiUrl = config.apiUrl;
    if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
      apiUrl = `https://${apiUrl}`;
    }
    
    // Garantir que a URL termine com /webservice/v1
    if (!apiUrl.includes('/webservice/')) {
      apiUrl = `${apiUrl}/webservice/v1`;
    }

    // O token deve estar no formato "usuario:senha" (ex: "1:72e20a330f2b146983dfb2f66a8f05186649b74db9f43aebf86068c13c6156c3")
    // Se o token não tiver ":", assumir que é apenas a senha e adicionar "1:" no início
    let tokenStr = config.apiToken;
    if (!tokenStr.includes(':')) {
      tokenStr = `1:${tokenStr}`;
      console.log(`[IXC Service] Token não tinha formato usuario:senha. Adicionando "1:" no início.`);
    }
    
    // Codificar o token completo em Base64 para Basic Auth
    const tokenEncoded = Buffer.from(tokenStr).toString('base64');

    this.client = axios.create({
      baseURL: apiUrl,
      headers: {
        "Content-Type": "application/json",
        "ixcsoft": "listar",
        "Authorization": `Basic ${tokenEncoded}`,
      },
      timeout: 30000,
    });

    console.log(`[IXC Service] Initialized with URL: ${apiUrl}`);
    console.log(`[IXC Service] Token format: ${tokenStr.includes(':') ? 'usuario:senha' : 'apenas senha (adicionado 1:)'}`);
  }

  /**
   * Buscar cliente por CPF/CNPJ
   */
  async buscarClientePorDocumento(documento: string): Promise<IXCCliente | null> {
    try {
      const documentoLimpo = documento.replace(/\D/g, "");
      
      // Tentar diferentes formatos de CPF/CNPJ
      const formatos = [documento, documentoLimpo];
      if (documentoLimpo.length === 11) {
        // Formatar CPF: 000.000.000-00
        formatos.push(`${documentoLimpo.slice(0, 3)}.${documentoLimpo.slice(3, 6)}.${documentoLimpo.slice(6, 9)}-${documentoLimpo.slice(9)}`);
      } else if (documentoLimpo.length === 14) {
        // Formatar CNPJ: 00.000.000/0000-00
        formatos.push(`${documentoLimpo.slice(0, 2)}.${documentoLimpo.slice(2, 5)}.${documentoLimpo.slice(5, 8)}/${documentoLimpo.slice(8, 12)}-${documentoLimpo.slice(12)}`);
      }
      
      // Tentar cada formato (como no script Python)
      for (const docFormatado of formatos) {
        if (!docFormatado) continue;
        
        // Usar POST com JSON no body (como no script Python)
        const response = await this.client.post("/cliente", {
          qtype: "cliente.cnpj_cpf",
          query: docFormatado,
          oper: "=",
          page: 1,
          rp: 1,
        });

        if (response.data?.total && parseInt(response.data.total) > 0) {
          return response.data.registros[0];
        }
      }
      
      // Se nenhum formato funcionou, retornar null
      return null;
    } catch (error: any) {
      console.error("[IXC Service] Erro ao buscar cliente por documento:", error.response?.data || error.message);
      throw new Error(`Falha ao buscar cliente: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Buscar cliente por telefone
   */
  async buscarClientePorTelefone(telefone: string): Promise<IXCCliente | null> {
    try {
      const telefoneLimpo = telefone.replace(/\D/g, "");
      
      // Usar POST com JSON no body (como no script Python)
      const response = await this.client.post("/cliente", {
        qtype: "cliente.telefone_celular",
        query: telefoneLimpo,
        oper: "=",
        page: 1,
        rp: 1,
      });

      if (response.data?.total && parseInt(response.data.total) > 0) {
        return response.data.registros[0];
      }
      
      return null;
    } catch (error: any) {
      console.error("[IXC Service] Erro ao buscar cliente por telefone:", error.response?.data || error.message);
      throw new Error(`Falha ao buscar cliente: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Buscar faturas em aberto de um cliente
   */
  async buscarFaturasEmAberto(idCliente: number): Promise<IXCFatura[]> {
    try {
      // Usar POST com JSON no body (como no script Python)
      // Buscar até 1000 registros para garantir que acha faturas antigas
      const response = await this.client.post("/fn_areceber", {
        qtype: "fn_areceber.id_cliente",
        query: idCliente,
        oper: "=",
        page: 1,
        rp: 1000, // Aumentado para 1000 como no script Python
        sortname: "fn_areceber.data_vencimento",
        sortorder: "asc",
      });

      console.log(`[IXC Service] Resposta de faturas:`, {
        total: response.data?.total,
        registrosCount: response.data?.registros?.length || 0,
        primeiroRegistro: response.data?.registros?.[0] ? {
          id: response.data.registros[0].id,
          status: response.data.registros[0].status,
          status_cobranca: response.data.registros[0].status_cobranca,
          valor: response.data.registros[0].valor,
          data_vencimento: response.data.registros[0].data_vencimento
        } : null
      });

      if (response.data?.registros) {
        // Log resumido das faturas retornadas
        console.log(`[IXC Service] Total de faturas retornadas pela API: ${response.data.registros.length}`);
        
        // EXATAMENTE como no script Python: retornar TODAS as faturas com status 'A'
        // O filtro de data será feito no ixcAiHelper
        const faturasAbertas = response.data.registros.filter((fatura: any) => {
          const status = fatura.status?.toString().toUpperCase();
          return status === "A";
        });
        
        console.log(`[IXC Service] Faturas com status 'A' (Aberto): ${faturasAbertas.length} de ${response.data.registros.length} total`);
        console.log(`[IXC Service] Retornando TODAS as faturas abertas (filtro de data será feito no helper)`);
        
        return faturasAbertas;
      }

      return [];
    } catch (error: any) {
      console.error("[IXC Service] Erro ao buscar faturas:", error.response?.data || error.message);
      throw new Error(`Falha ao buscar faturas: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Executar desbloqueio de confiança
   */
  async executarDesbloqueioConfianca(idCliente: number): Promise<IXCDesbloqueioResponse> {
    try {
      console.log(`[IXC Service] ========================================`);
      console.log(`[IXC Service] Iniciando desbloqueio para cliente ${idCliente}`);
      
      // Criar cliente sem header "ixcsoft: listar" para ações (como no script Python)
      const tokenStr = this.config.apiToken.includes(':') 
        ? this.config.apiToken 
        : `1:${this.config.apiToken}`;
      const tokenEncoded = Buffer.from(tokenStr).toString('base64');
      
      const actionClient = axios.create({
        baseURL: this.client.defaults.baseURL,
        headers: {
          "Authorization": `Basic ${tokenEncoded}`,
          "Content-Type": "application/json"
          // NÃO incluir "ixcsoft: listar" para ações
        },
        timeout: 30000,
        transformRequest: [(data) => {
          // Converter para JSON string como no Python: data=json.dumps(payload)
          return JSON.stringify(data);
        }],
      });
      
      // Primeiro, buscar o contrato ativo do cliente (usando POST como no script Python)
      // IMPORTANTE: Buscar apenas contratos ATIVOS (status = 'A')
      console.log(`[IXC Service] Buscando contrato ATIVO do cliente ${idCliente}...`);
      const contratoResponse = await this.client.post("/cliente_contrato", {
        qtype: "cliente_contrato.id_cliente",
        query: idCliente,
        oper: "=",
        page: 1,
        rp: 10, // Aumentar para buscar mais contratos
        sortname: "cliente_contrato.id",
        sortorder: "desc",
      });
      
      console.log(`[IXC Service] Contratos encontrados: ${contratoResponse.data?.total || 0}`);

      if (!contratoResponse.data?.total || parseInt(contratoResponse.data.total) === 0) {
        console.error(`[IXC Service] ❌ Nenhum contrato encontrado para cliente ${idCliente}`);
        return {
          success: false,
          message: "Nenhum contrato encontrado para este cliente",
        };
      }

      // Buscar contrato ATIVO (status = 'A') ou o primeiro disponível
      let contrato = null;
      const contratos = contratoResponse.data.registros || [];
      
      // Tentar encontrar contrato ativo primeiro
      contrato = contratos.find((c: any) => c.status === 'A');
      
      // Se não encontrou ativo, pegar o primeiro (como no script Python)
      if (!contrato && contratos.length > 0) {
        contrato = contratos[0];
        console.log(`[IXC Service] ⚠️ Nenhum contrato ativo encontrado. Usando primeiro contrato disponível.`);
      }
      
      if (!contrato) {
        return {
          success: false,
          message: "Nenhum contrato encontrado para este cliente",
        };
      }
      
      console.log(`[IXC Service] Contrato selecionado:`, {
        id: contrato.id,
        status: contrato.status,
        status_internet: contrato.status_internet,
        bloqueio_automatico: contrato.bloqueio_automatico,
        data_cancelamento: contrato.data_cancelamento
      });

      // Verificar se o contrato está bloqueado (como no script Python)
      const estaBloqueado = contrato.bloqueio_automatico === 'S' || contrato.status_internet === 'D';
      
      console.log(`[IXC Service] Verificação de bloqueio:`, {
        bloqueio_automatico: contrato.bloqueio_automatico,
        status_internet: contrato.status_internet,
        status: contrato.status,
        estaBloqueado
      });
      
      if (!estaBloqueado) {
        console.log(`[IXC Service] ℹ️ Contrato ${contrato.id} não está bloqueado`);
        return {
          success: true,
          message: "Cliente já está com acesso liberado! Não há necessidade de desbloqueio.",
        };
      }

      // Executar desbloqueio via API (sem header "ixcsoft: listar")
      // IMPORTANTE: Converter ID para número (a API pode exigir número)
      const contratoId = typeof contrato.id === 'string' ? parseInt(contrato.id) : contrato.id;
      console.log(`[IXC Service] Contrato está bloqueado. Executando desbloqueio para contrato ${contratoId} (tipo original: ${typeof contrato.id}, convertido: ${typeof contratoId})...`);
      
      const payload = { id: contratoId };
      console.log(`[IXC Service] Payload do desbloqueio:`, JSON.stringify(payload));
      console.log(`[IXC Service] Headers:`, {
        'Content-Type': 'application/json',
        'Authorization': 'Basic [REDACTED]'
      });
      
      const desbloqueioResponse = await actionClient.post("/desbloqueio_confianca", payload);
      
      console.log(`[IXC Service] Resposta do desbloqueio:`, desbloqueioResponse.data);

      // Verificar se a API retornou erro
      if (desbloqueioResponse.data?.type === 'error') {
        console.error(`[IXC Service] ❌ API retornou erro:`, desbloqueioResponse.data.message);
        return {
          success: false,
          message: desbloqueioResponse.data.message || "Erro ao executar desbloqueio",
          data: desbloqueioResponse.data,
        };
      }

      // Verificar se foi bem-sucedido
      if (desbloqueioResponse.data?.type === 'success') {
        console.log(`[IXC Service] ✅ Desbloqueio executado com sucesso`);
        return {
          success: true,
          message: desbloqueioResponse.data.message || "Desbloqueio de confiança realizado com sucesso!",
          data: desbloqueioResponse.data,
        };
      }

      // Se não tem type, mas status 200, considerar sucesso
      return {
        success: true,
        message: "Desbloqueio de confiança realizado com sucesso!",
        data: desbloqueioResponse.data,
      };
    } catch (error: any) {
      console.error("[IXC Service] Erro ao executar desbloqueio:", error.response?.data || error.message);
      
      // Se o erro for porque já está desbloqueado
      if (error.response?.data?.message?.includes("já está desbloqueado") || 
          error.response?.data?.message?.includes("sem bloqueio")) {
        return {
          success: true,
          message: "Cliente já está desbloqueado ou sem bloqueio ativo",
        };
      }

      return {
        success: false,
        message: `Falha ao executar desbloqueio: ${error.response?.data?.message || error.message}`,
      };
    }
  }

  /**
   * Buscar boleto em PDF (Base64 ou binário)
   */
  async buscarBoleto(idFatura: number): Promise<{ success: boolean; pdfBase64?: string; error?: string }> {
    try {
      console.log(`[IXC Service] ========================================`);
      console.log(`[IXC Service] Iniciando download do boleto ${idFatura}`);
      
      // Criar cliente sem header "ixcsoft: listar" para ações (como no script Python)
      const tokenStr = this.config.apiToken.includes(':') 
        ? this.config.apiToken 
        : `1:${this.config.apiToken}`;
      const tokenEncoded = Buffer.from(tokenStr).toString('base64');
      
      console.log(`[IXC Service] Token configurado: ${tokenStr.substring(0, 10)}...`);
      console.log(`[IXC Service] Base URL: ${this.client.defaults.baseURL}`);
      
      const actionClient = axios.create({
        baseURL: this.client.defaults.baseURL,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${tokenEncoded}`,
          "ixcsoft": "listar", // Manter o header como no script Python
        },
        timeout: 30000,
        responseType: 'arraybuffer', // Para receber binário
      });

      const payload = {
        boletos: idFatura.toString(),
        juro: "S",
        multa: "S",
        atualiza_boleto: "S",
        tipo_boleto: "arquivo",
        base64: "N",
        layout_impressao: ""
      };

      console.log(`[IXC Service] Payload:`, payload);
      console.log(`[IXC Service] Fazendo requisição POST para /get_boleto...`);
      
      const response = await actionClient.post("/get_boleto", payload);

      console.log(`[IXC Service] Status da resposta: ${response.status}`);
      console.log(`[IXC Service] Content-Type: ${response.headers['content-type']}`);
      console.log(`[IXC Service] Tamanho da resposta: ${response.data.byteLength} bytes`);

      // Verificar se é PDF binário
      const buffer = Buffer.from(response.data);
      const primeirosBytes = buffer.toString('utf-8', 0, 10);
      console.log(`[IXC Service] Primeiros bytes: "${primeirosBytes}"`);
      
      if (buffer.toString('utf-8', 0, 4) === '%PDF') {
        console.log(`[IXC Service] ✅ Boleto ${idFatura} recebido como PDF binário`);
        const pdfBase64 = buffer.toString('base64');
        console.log(`[IXC Service] PDF convertido para Base64: ${pdfBase64.length} caracteres`);
        return { success: true, pdfBase64 };
      }

      // Tentar como JSON com base64
      try {
        const jsonData = JSON.parse(buffer.toString('utf-8'));
        console.log(`[IXC Service] Resposta é JSON:`, Object.keys(jsonData));
        if (jsonData.base64) {
          console.log(`[IXC Service] ✅ Boleto ${idFatura} recebido como JSON com base64`);
          return { success: true, pdfBase64: jsonData.base64 };
        }
      } catch (e) {
        console.log(`[IXC Service] Resposta não é JSON`);
      }

      console.error(`[IXC Service] ❌ Formato de resposta desconhecido para boleto ${idFatura}`);
      console.error(`[IXC Service] Primeiros 200 caracteres da resposta:`, buffer.toString('utf-8', 0, 200));
      return { success: false, error: "Formato de resposta desconhecido" };

    } catch (error: any) {
      console.error("[IXC Service] ❌ ERRO ao buscar boleto:", error.message);
      console.error("[IXC Service] Response data:", error.response?.data);
      console.error("[IXC Service] Response status:", error.response?.status);
      return { 
        success: false, 
        error: `Falha ao buscar boleto: ${error.response?.data?.message || error.message}` 
      };
    }
  }

  /**
   * Formatar valor monetário
   */
  formatarValor(valor: string | number): string {
    const valorNum = typeof valor === "string" ? parseFloat(valor) : valor;
    return valorNum.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  /**
   * Formatar data
   */
  formatarData(data: string): string {
    const [ano, mes, dia] = data.split("-");
    return `${dia}/${mes}/${ano}`;
  }
}

// Singleton instance
let ixcServiceInstance: IXCSoftService | null = null;

export function getIXCService(config?: IXCConfig): IXCSoftService | null {
  if (config) {
    ixcServiceInstance = new IXCSoftService(config);
    return ixcServiceInstance;
  }
  
  return ixcServiceInstance;
}

