import axios, { AxiosInstance } from "axios";

export interface EvolutionConfig {
  apiUrl: string;
  apiKey: string;
}

export interface CreateInstanceResponse {
  instance: {
    instanceName: string;
    status: string;
  };
  qrcode?: {
    code: string;
    base64: string;
  };
}

export interface InstanceStatus {
  instanceName: string;
  status: string;
  phoneNumber?: string;
}

export interface SendMessagePayload {
  number: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "video" | "document";
}

export class EvolutionAPIService {
  private client: AxiosInstance;
  private apiUrl: string;
  private apiKey: string;

  constructor(config: EvolutionConfig) {
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;
    
    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        "Content-Type": "application/json",
        "apikey": this.apiKey,
      },
    });
  }

  /**
   * Criar uma nova instância do WhatsApp
   */
  async createInstance(instanceName: string, webhookUrl?: string): Promise<CreateInstanceResponse> {
    try {
      // Criar instância com configurações mínimas (evita problemas)
      const payload: any = {
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        // Configurações adicionais para evitar erro 401
        number: undefined, // Deixar vazio para gerar automaticamente
        // NÃO incluir webhook na criação - será configurado depois
      };
      
      console.log(`[Evolution API] Creating instance: ${instanceName}`);
      const response = await this.client.post("/instance/create", payload);
      console.log(`[Evolution API] Instance created successfully: ${instanceName}`);

      // Configurar webhook imediatamente se URL for fornecida
      if (webhookUrl) {
        try {
          await this.setWebhook(instanceName, webhookUrl);
        } catch (webhookError: any) {
          console.warn(`[Evolution API] Failed to set webhook during creation: ${webhookError.message}`);
          // Não falhar a criação se o webhook falhar, mas logar o erro
        }
      }
      
      // Na v2.2.3, o QR Code é gerado de forma assíncrona
      // Aguardar mais tempo e tentar buscar várias vezes
      let qrcodeData = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // Aguardar 3 segundos entre tentativas
        
        try {
          const qrResponse = await this.client.get(`/instance/connect/${instanceName}`);
          const qrData = qrResponse.data.qrcode || qrResponse.data;
          
          // Verificar se o QR Code foi gerado (não é apenas {"count": 0})
          if (qrData && (qrData.base64 || (qrData.code && qrData.count > 0))) {
            qrcodeData = qrData;
            console.log(`[Evolution API] QR Code retrieved for ${instanceName} on attempt ${attempt + 1}`);
            break;
          }
        } catch (qrError: any) {
          console.warn(`[Evolution API] Attempt ${attempt + 1} failed to get QR Code:`, qrError.message);
        }
      }
      
      // Retornar dados com QR Code se disponível
      const responseData = response.data;
      if (qrcodeData && (qrcodeData.base64 || qrcodeData.code)) {
        responseData.qrcode = qrcodeData;
      } else {
        console.warn(`[Evolution API] QR Code not available yet for ${instanceName}, will be sent via webhook`);
      }
      
      return responseData;
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
      const errorDetails = JSON.stringify(error.response?.data || {});
      console.error("[Evolution API] Error creating instance:", errorMsg, errorDetails);
      throw new Error(errorMsg);
    }
  }

  /**
   * Obter QR Code de uma instância
   */
  async getQRCode(instanceName: string): Promise<{ base64: string; code: string }> {
    try {
      // Na v2.2.3, tentar diferentes endpoints
      let response;
      try {
        // Tentar endpoint /instance/connect primeiro
        response = await this.client.get(`/instance/connect/${instanceName}`);
      } catch (e) {
        // Se falhar, tentar /instance/qrcode
        response = await this.client.get(`/instance/qrcode/${instanceName}`);
      }
      
      // Na v2.2.3, o QR Code pode vir em diferentes formatos
      const qrData = response.data.qrcode || response.data;
      
      // Se vier como objeto com base64 e code, retornar diretamente
      if (qrData && (qrData.base64 || qrData.code)) {
        return qrData;
      }
      
      // Se vier em outro formato, tentar extrair
      return qrData;
    } catch (error: any) {
      console.error("[Evolution API] Error getting QR code:", error.response?.data || error.message);
      throw new Error(`Failed to get QR code: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Verificar status de uma instância
   */
  async getInstanceStatus(instanceName: string): Promise<InstanceStatus> {
    try {
      const response = await this.client.get(`/instance/connectionState/${instanceName}`);
      return {
        instanceName,
        status: response.data.state || response.data.status,
        phoneNumber: response.data.instance?.phoneNumber,
      };
    } catch (error: any) {
      console.error("[Evolution API] Error getting status:", error.response?.data || error.message);
      return {
        instanceName,
        status: "disconnected",
      };
    }
  }

  /**
   * Desconectar uma instância
   */
  async logoutInstance(instanceName: string): Promise<void> {
    try {
      await this.client.delete(`/instance/logout/${instanceName}`);
    } catch (error: any) {
      console.error("[Evolution API] Error logging out:", error.response?.data || error.message);
      throw new Error(`Failed to logout: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Deletar uma instância
   */
  async deleteInstance(instanceName: string): Promise<void> {
    try {
      await this.client.delete(`/instance/delete/${instanceName}`);
    } catch (error: any) {
      console.error("[Evolution API] Error deleting instance:", error.response?.data || error.message);
      throw new Error(`Failed to delete instance: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Enviar mensagem de texto
   */
  async sendTextMessage(instanceName: string, number: string, text: string): Promise<void> {
    const formatted = this.formatPhoneNumber(number);
    const payloads = [
      // Formato 1 (comum nas versões recentes): { number, text }
      { number: formatted, text },
      // Formato 2 (utilizado por alguns builds): { number, textMessage: { text } }
      { number: formatted, textMessage: { text } },
    ];

    let lastError: any = null;
    for (const body of payloads) {
      try {
        await this.client.post(`/message/sendText/${instanceName}`, body);
        return;
      } catch (error: any) {
        lastError = error;
        // Se for 400, tentamos o próximo formato; outros códigos já interrompem
        const status = error?.response?.status;
        if (status && status !== 400) break;
      }
    }

    const detail = lastError?.response?.data || lastError?.message || "unknown error";
    console.error("[Evolution API] Error sending text:", detail);
    throw new Error(`Failed to send message: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }

  /**
   * Enviar mídia (imagem, áudio, vídeo)
   */
  async sendMediaMessage(
    instanceName: string,
    number: string,
    mediaUrl: string,
    mediaType: "image" | "audio" | "video" | "document",
    caption?: string
  ): Promise<void> {
    try {
      const endpoint = `/message/sendMedia/${instanceName}`;
      await this.client.post(endpoint, {
        number: this.formatPhoneNumber(number),
        mediatype: mediaType,
        media: mediaUrl,
        caption,
      });
    } catch (error: any) {
      console.error("[Evolution API] Error sending media:", error.response?.data || error.message);
      throw new Error(`Failed to send media: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Configurar webhook para receber mensagens
   */
  async setWebhook(instanceName: string, webhookUrl: string): Promise<void> {
    try {
      await this.client.post(`/webhook/set/${instanceName}`, {
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: true,
        events: [
          "QRCODE_UPDATED",
          "qrcode.updated", // v2.2.3 pode usar formato diferente
          "CONNECTION_UPDATE",
          "connection.update",
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "SEND_MESSAGE",
        ],
      });
      console.log(`[Evolution API] Webhook configured for ${instanceName}: ${webhookUrl}`);
    } catch (error: any) {
      console.error("[Evolution API] Error setting webhook:", error.response?.data || error.message);
      throw new Error(`Failed to set webhook: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Formatar número de telefone para o padrão do WhatsApp
   */
  private formatPhoneNumber(number: string): string {
    // Remove caracteres não numéricos
    const cleaned = number.replace(/\D/g, "");
    
    // Se não tem código do país, assume Brasil (+55)
    if (cleaned.length <= 11) {
      return `55${cleaned}`;
    }
    
    return cleaned;
  }
}

// Singleton instance
export function getEvolutionService(config?: EvolutionConfig): EvolutionAPIService {
  // Se config for fornecido, usar ele; senão usar variáveis de ambiente
  const finalConfig: EvolutionConfig = config || {
    apiUrl: process.env.EVOLUTION_API_URL || "http://localhost:8080",
    apiKey: process.env.EVOLUTION_API_KEY || "your-api-key-here",
  };
  
  return new EvolutionAPIService(finalConfig);
}

