import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from "react-native";
import { trpc } from "../lib/trpc";
import { useRouter, Stack } from "expo-router";
import { useState } from "react";
import { Search, User } from "lucide-react-native";

export default function NewChatScreen() {
    const router = useRouter();
    const [search, setSearch] = useState("");
    const { data: contacts, isLoading } = trpc.contacts.list.useQuery();

    const filteredContacts = contacts?.filter(c =>
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.whatsappNumber.includes(search)
    );

    const handleSelectContact = (contactId: number, whatsappNumber: string) => {
        // In a real app we would create the conversation first or find existing one
        // For now, let's assume we can navigate to a chat (or create it)
        // Ideally we call a mutation 'startConversation' here
        startConversationMutation.mutate({ whatsappNumber });
    };

    const startConversationMutation = trpc.contacts.startConversation.useMutation({
        onSuccess: (data) => {
            router.replace(`/chat/${data.conversationId}`);
        }
    });

    if (isLoading) {
        return (
            <View className="flex-1 items-center justify-center bg-white">
                <ActivityIndicator size="large" color="#075E54" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-white">
            <Stack.Screen options={{ title: "Nova Conversa" }} />

            <View className="p-4 bg-gray-100">
                <View className="bg-white rounded-lg flex-row items-center px-4 py-2">
                    <Search color="gray" size={20} />
                    <TextInput
                        className="flex-1 ml-2 text-base"
                        placeholder="Buscar contatos..."
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>
            </View>

            <FlatList
                data={filteredContacts}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        className="flex-row items-center p-4 border-b border-gray-100"
                        onPress={() => handleSelectContact(item.id, item.whatsappNumber)}
                    >
                        <View className="w-12 h-12 bg-gray-200 rounded-full items-center justify-center mr-4">
                            {/* Ideally show profile pic */}
                            <User color="gray" size={24} />
                        </View>
                        <View>
                            <Text className="font-bold text-lg text-black">{item.name || "Sem Nome"}</Text>
                            <Text className="text-gray-500">{item.whatsappNumber}</Text>
                        </View>
                    </TouchableOpacity>
                )}
                ListEmptyComponent={
                    <View className="p-8 items-center">
                        <Text className="text-gray-500">Nenhum contato encontrado</Text>
                    </View>
                }
            />
        </View>
    );
}
