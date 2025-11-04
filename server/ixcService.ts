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

    this.client = axios.create({
      baseURL: apiUrl,
      headers: {
        "Content-Type": "application/json",
        "ixcsoft": "listar",
      },
      params: {
        token: config.apiToken,
      },
      timeout: 30000,
    });

    console.log(`[IXC Service] Initialized with URL: ${apiUrl}`);
  }

  /**
   * Buscar cliente por CPF/CNPJ
   */
  async buscarClientePorDocumento(documento: string): Promise<IXCCliente | null> {
    try {
      const documentoLimpo = documento.replace(/\D/g, "");
      
      const response = await this.client.get("/cliente", {
        params: {
          qtype: "cliente.cnpj_cpf",
          query: documentoLimpo,
          oper: "=",
          page: 1,
          rp: 1,
          sortname: "cliente.id",
          sortorder: "asc",
        },
      });

      if (response.data?.registros && response.data.registros.length > 0) {
        return response.data.registros[0];
      }

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
      
      const response = await this.client.get("/cliente", {
        params: {
          qtype: "cliente.telefone_celular",
          query: telefoneLimpo,
          oper: "like",
          page: 1,
          rp: 1,
          sortname: "cliente.id",
          sortorder: "asc",
        },
      });

      if (response.data?.registros && response.data.registros.length > 0) {
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
      const response = await this.client.get("/fn_areceber", {
        params: {
          qtype: "fn_areceber.id_cliente",
          query: idCliente,
          oper: "=",
          page: 1,
          rp: 100,
          sortname: "fn_areceber.data_vencimento",
          sortorder: "asc",
        },
      });

      if (response.data?.registros) {
        // Filtrar apenas faturas em aberto ou vencidas
        return response.data.registros.filter((fatura: IXCFatura) => {
          return fatura.status_cobranca !== "P" && fatura.status_cobranca !== "Pago";
        });
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
      // A API IXC usa o endpoint de contratos para desbloqueio
      // Primeiro, buscar o contrato ativo do cliente
      const contratoResponse = await this.client.get("/contrato", {
        params: {
          qtype: "contrato.id_cliente",
          query: idCliente,
          oper: "=",
          page: 1,
          rp: 1,
          sortname: "contrato.id",
          sortorder: "desc",
        },
      });

      if (!contratoResponse.data?.registros || contratoResponse.data.registros.length === 0) {
        return {
          success: false,
          message: "Nenhum contrato encontrado para este cliente",
        };
      }

      const contrato = contratoResponse.data.registros[0];

      // Executar desbloqueio via API
      const desbloqueioResponse = await this.client.post("/su_acao_confianca", {
        id_contrato: contrato.id,
        id_cliente: idCliente,
        tipo: "desbloqueio",
      });

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

