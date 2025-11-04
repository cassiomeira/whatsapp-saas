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
      const payload: any = {
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      };
      
      // Configurar webhook se fornecido
      if (webhookUrl) {
        payload.webhook = webhookUrl;
        payload.webhook_by_events = false;
        payload.webhook_base64 = false;
        payload.events = [
          "QRCODE_UPDATED",
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "MESSAGES_DELETE",
          "SEND_MESSAGE",
          "CONNECTION_UPDATE",
        ];
      }
      
      const response = await this.client.post("/instance/create", payload);
      return response.data;
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
      const response = await this.client.get(`/instance/connect/${instanceName}`);
      return response.data.qrcode || response.data;
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
        webhook_base64: false,
        events: [
          "QRCODE_UPDATED",
          "CONNECTION_UPDATE",
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "SEND_MESSAGE",
        ],
      });
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

