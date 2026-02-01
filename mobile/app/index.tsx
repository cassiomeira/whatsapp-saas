import { View, Text, FlatList, TouchableOpacity, Image, Pressable, ActivityIndicator } from "react-native";
import { trpc } from "../lib/trpc";
import { Link, useRouter, Stack } from "expo-router";
import { Phone, MessageSquare, Search, Settings } from "lucide-react-native";

export default function InboxScreen() {
    const router = useRouter();
    const { data: conversations, isLoading, error, refetch } = trpc.conversations.list.useQuery();

    if (isLoading) {
        return (
            <View className="flex-1 items-center justify-center bg-white">
                <ActivityIndicator size="large" color="#075E54" />
                <Text className="text-gray-500 mt-2">Carregando conversas...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View className="flex-1 items-center justify-center bg-white px-6">
                <Text className="text-red-500 text-center font-bold text-lg mb-2">Erro de Conexão</Text>
                <Text className="text-gray-600 text-center mb-6">
                    Não foi possível conectar ao servidor. Verifique se o backend está rodando em seu computador.
                </Text>
                <TouchableOpacity
                    className="bg-whatsapp-green px-6 py-3 rounded-full"
                    onPress={() => refetch()}
                >
                    <Text className="text-white font-bold">Tentar Novamente</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    className="mt-4 p-2"
                    onPress={() => router.push("/settings/server")}
                >
                    <Text className="text-gray-500 font-semibold">Configurar Servidor</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-white">
            <Stack.Screen
                options={{
                    title: "WhatsApp SaaS",
                    headerRight: () => (
                        <Link href="/profile" asChild>
                            <TouchableOpacity className="mr-2">
                                <Settings color="white" size={24} />
                            </TouchableOpacity>
                        </Link>
                    ),
                }}
            />

            {/* Botão de Pesquisa Flutuante */}
            <View className="absolute bottom-6 right-6 z-50">
                <Pressable
                    className="bg-whatsapp-green w-14 h-14 rounded-full items-center justify-center shadow-lg"
                    onPress={() => router.push("/new-chat")}
                >
                    <MessageSquare color="white" size={24} />
                </Pressable>
            </View>

            <FlatList
                data={conversations}
                keyExtractor={(item) => item.id.toString()}
                refreshing={isLoading}
                onRefresh={refetch}
                renderItem={({ item }) => (
                    <Link href={`/chat/${item.id}`} asChild>
                        <TouchableOpacity className="flex-row p-4 border-b border-gray-100 items-center">
                            {/* Foto de Perfil */}
                            <View className="w-14 h-14 rounded-full bg-gray-200 mr-4 items-center justify-center overflow-hidden">
                                {item.contact?.profilePicUrl ? (
                                    <Image
                                        source={{ uri: item.contact.profilePicUrl }}
                                        className="w-full h-full"
                                    />
                                ) : (
                                    <Text className="text-gray-400 font-bold text-lg">
                                        {item.contact?.name?.charAt(0).toUpperCase() || "?"}
                                    </Text>
                                )}
                            </View>

                            {/* Info da Conversa */}
                            <View className="flex-1">
                                <View className="flex-row justify-between items-center">
                                    <Text className="text-black font-bold text-lg" numberOfLines={1}>
                                        {item.contact?.name || item.contact?.whatsappNumber || "Sem nome"}
                                    </Text>
                                    <Text className="text-gray-400 text-xs">
                                        {/* Aqui entraria a formatação de data da última mensagem */}
                                        AGORA
                                    </Text>
                                </View>
                                <View className="flex-row items-center mt-1">
                                    <Text className="text-gray-500 text-sm flex-1" numberOfLines={1}>
                                        Clique para abrir a conversa
                                    </Text>

                                    {/* Badge de Não Lida (se houver no metadata) */}
                                    {(item.contact?.metadata as any)?.unread && (
                                        <View className="bg-whatsapp-green rounded-full px-2 ml-2">
                                            <Text className="text-white text-xs font-bold">1</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        </TouchableOpacity>
                    </Link>
                )}
                ListEmptyComponent={
                    <View className="flex-1 items-center justify-center pt-20">
                        <Text className="text-gray-400">Nenhuma conversa encontrada</Text>
                    </View>
                }
            />
        </View>
    );
}
