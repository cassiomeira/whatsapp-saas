import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SERVER_URL_KEY = 'whatsapp_saas_server_url';
// URL Padrão (Coolify)
export const DEFAULT_SERVER_URL = "https://wo4gsgwco8k4k8kkcwg8ksgg.217.216.86.231.sslip.io/api/trpc";

export async function getServerUrl(): Promise<string> {
    if (Platform.OS === 'web') {
        return localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER_URL;
    }
    try {
        const url = await SecureStore.getItemAsync(SERVER_URL_KEY);
        return url || DEFAULT_SERVER_URL;
    } catch (error) {
        console.error("Erro ao ler URL do storage:", error);
        return DEFAULT_SERVER_URL;
    }
}

export async function setServerUrl(url: string): Promise<void> {
    if (Platform.OS === 'web') {
        localStorage.setItem(SERVER_URL_KEY, url);
        return;
    }
    try {
        await SecureStore.setItemAsync(SERVER_URL_KEY, url);
    } catch (error) {
        console.error("Erro ao salvar URL no storage:", error);
        throw error;
    }
}
