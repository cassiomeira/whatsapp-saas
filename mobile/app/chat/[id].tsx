import { View, Text, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ImageBackground, Image } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { trpc } from "../../lib/trpc";
import { useState, useRef, useEffect } from "react";
import { Send, Camera, Mic, Paperclip, Phone } from "lucide-react-native";
import { format } from "date-fns";

export default function ChatScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const [message, setMessage] = useState("");
    const flatListRef = useRef<FlatList>(null);

    const { data: messages, refetch } = trpc.messages.list.useQuery(
        { conversationId: parseInt(id) },
        {
            refetchInterval: 3000,
            enabled: !!id
        }
    );

    const sendMessageMutation = trpc.messages.send.useMutation({
        onSuccess: () => {
            setMessage("");
            refetch();
        }
    });

    const handleSend = () => {
        if (!message.trim()) return;
        sendMessageMutation.mutate({
            conversationId: parseInt(id),
            content: message,
            messageType: "text"
        });
    };

    // Scroll to bottom when new messages arrive
    useEffect(() => {
        if (messages && messages.length > 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages?.length]);

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
            className="flex-1"
        >
            <Stack.Screen
                options={{
                    title: "Conversa", // Poderia buscar o nome do contato aqui
                    headerRight: () => (
                        <View className="flex-row items-center mr-2">
                            <TouchableOpacity className="p-2"><Camera color="white" size={20} /></TouchableOpacity>
                            <TouchableOpacity className="p-2 ml-2"><Phone color="white" size={20} /></TouchableOpacity>
                        </View>
                    )
                }}
            />

            <ImageBackground
                source={{ uri: "https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png" }} // WhatsApp background doodle
                className="flex-1 bg-whatsapp-bg"
            >
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={{ padding: 10 }}
                    renderItem={({ item }) => {
                        const isMe = item.senderType === "agent" || item.senderType === "bot";
                        return (
                            <View className={`mb-2 max-w-[80%] rounded-lg p-2 ${isMe ? "self-end bg-whatsapp-lightGreen" : "self-start bg-white"} shadow-sm`}>
                                <Text className="text-black text-[16px]">{item.content}</Text>
                                <Text className="text-[10px] text-gray-500 self-end mt-1">
                                    {format(new Date(item.sentAt), "HH:mm")}
                                </Text>
                            </View>
                        );
                    }}
                />

                {/* Input Area */}
                <View className="p-2 bg-transparent flex-row items-center">
                    <View className="flex-1 bg-white rounded-full flex-row items-center px-4 py-1 mr-2 shadow-sm">
                        <TouchableOpacity className="mr-2"><Mic color="gray" size={20} /></TouchableOpacity>
                        <TextInput
                            placeholder="Mensagem"
                            className="flex-1 text-[16px] min-h-[40px]"
                            multiline
                            value={message}
                            onChangeText={setMessage}
                        />
                        <TouchableOpacity className="ml-2"><Paperclip color="gray" size={20} /></TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        className="bg-whatsapp-green w-12 h-12 rounded-full items-center justify-center shadow-md"
                        onPress={handleSend}
                        disabled={sendMessageMutation.isPending}
                    >
                        <Send color="white" size={20} />
                    </TouchableOpacity>
                </View>
            </ImageBackground>
        </KeyboardAvoidingView>
    );
}
