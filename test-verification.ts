
import { EvolutionAPIService } from "./server/evolutionService";

async function verifyFix() {
    console.log("Starting verification...");

    // Mock config
    const config = {
        apiUrl: "http://mock-api",
        apiKey: "mock-key"
    };

    const service = new EvolutionAPIService(config);

    // Mock axios client
    const mockPost = async (url: string, data: any) => {
        console.log(`[Mock] POST ${url}`);
        if (url === "/instance/create") {
            return { data: { instance: { instanceName: "test", status: "created" } } };
        }
        if (url.startsWith("/webhook/set/")) {
            console.log(`[Success] Webhook set called for URL: ${data.url}`);
            return { data: { success: true } };
        }
        return { data: {} };
    };

    const mockGet = async (url: string) => {
        console.log(`[Mock] GET ${url}`);
        return { data: { qrcode: { base64: "mock-qr" } } };
    };

    // Inject mock
    (service as any).client.post = mockPost;
    (service as any).client.get = mockGet;

    // Test createInstance WITH webhook
    console.log("\nTesting createInstance WITH webhook...");
    await service.createInstance("test-instance", "http://my-webhook.com");

    // Test createInstance WITHOUT webhook
    console.log("\nTesting createInstance WITHOUT webhook...");
    await service.createInstance("test-instance-no-hook"); // Should not see [Success] log

    console.log("\nVerification complete.");
}

verifyFix().catch(console.error);
