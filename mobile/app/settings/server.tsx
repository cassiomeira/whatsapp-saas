import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useState, useEffect } from "react";
import { useRouter, Stack } from "expo-router";
import { getServerUrl, setServerUrl, DEFAULT_SERVER_URL } from "../../lib/storage";
import { Save, RefreshCw } from "lucide-react-native";

export default function ServerSettingsScreen() {
    const router = useRouter();
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        const storedUrl = await getServerUrl();
        setUrl(storedUrl);
        setLoading(false);
    };

    const handleSave = async () => {
        try {
            await setServerUrl(url);
            Alert.alert("Sucesso", "URL do servidor atualizada! O aplicativo precisa ser reiniciado para surtir efeito.", [
                { text: "OK", onPress: () => router.back() }
            ]);
        } catch (error) {
            Alert.alert("Erro", "Falha ao salvar a URL.");
        }
    };

    const handleReset = () => {
        setUrl(DEFAULT_SERVER_URL);
    };

    if (loading) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-50">
                <ActivityIndicator size="large" color="#075E54" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-gray-50 p-6">
            <Stack.Screen options={{ title: "Configurar Servidor" }} />

            <View className="bg-white p-6 rounded-lg shadow-sm">
                <Text className="text-gray-700 font-bold mb-2">URL do Backend (TRPC)</Text>
                <Text className="text-gray-400 text-xs mb-4">
                    Ex: https://seu-app.coolify.com/api/trpc
                </Text>

                <TextInput
                    className="border border-gray-300 rounded-lg p-4 text-black bg-gray-50 mb-4"
                    value={url}
                    onChangeText={setUrl}
                    autoCapitalize="none"
                    keyboardType="url"
                    placeholder="https://..."
                />

                <TouchableOpacity
                    className="bg-whatsapp-green flex-row items-center justify-center p-4 rounded-lg mb-3"
                    onPress={handleSave}
                >
                    <Save color="white" size={20} className="mr-2" />
                    <Text className="text-white font-bold">Salvar Configuração</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    className="bg-gray-200 flex-row items-center justify-center p-4 rounded-lg"
                    onPress={handleReset}
                >
                    <RefreshCw color="#374151" size={20} className="mr-2" />
                    <Text className="text-gray-700 font-bold">Restaurar Padrão</Text>
                </TouchableOpacity>
            </View>

            <Text className="text-gray-400 text-center mt-8 text-xs">
                Esta configuração define onde o aplicativo busca os dados.
                Use apenas se souber o que está fazendo.
            </Text>
        </View>
    );
}
