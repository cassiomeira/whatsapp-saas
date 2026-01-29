import { View, Text, TouchableOpacity, Image, Alert } from "react-native";
import { Stack, useRouter } from "expo-router";
import { trpc } from "../../lib/trpc";
import { LogOut, User as UserIcon, Building2 } from "lucide-react-native";

export default function ProfileScreen() {
    const router = useRouter();
    const { data: user, isLoading } = trpc.auth.me.useQuery();
    const logoutMutation = trpc.auth.logout.useMutation({
        onSuccess: () => {
            // In a real auth flow we would redirect to login
            // For now, since we have auto-login dev bypass, it might just re-login
            Alert.alert("Logout", "Você saiu do sistema (simulado).");
            router.replace("/");
        }
    });

    const handleLogout = () => {
        Alert.alert(
            "Sair",
            "Deseja realmente sair?",
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Sair",
                    style: "destructive",
                    onPress: () => logoutMutation.mutate()
                }
            ]
        );
    };

    return (
        <View className="flex-1 bg-gray-50">
            <Stack.Screen options={{ title: "Meu Perfil" }} />

            {/* Header / Avatar */}
            <View className="bg-white items-center py-8 border-b border-gray-200">
                <View className="w-24 h-24 bg-gray-200 rounded-full items-center justify-center mb-4 overflow-hidden">
                    {/* Placeholder or actual avatar */}
                    <UserIcon size={48} color="gray" />
                </View>
                <Text className="text-xl font-bold text-black">
                    {user?.name || "Carregando..."}
                </Text>
                <Text className="text-gray-500">
                    {user?.email || ""}
                </Text>
            </View>

            {/* Info Section */}
            <View className="mt-6 bg-white border-y border-gray-200">
                <View className="p-4 flex-row items-center border-b border-gray-100">
                    <Building2 size={24} color="#075E54" />
                    <View className="ml-4">
                        <Text className="text-sm text-gray-400">Workspace</Text>
                        <Text className="text-lg text-black">
                            {user?.workspaceMetadata?.name || user?.workspaceId ? `Workspace #${user?.workspaceId}` : "..."}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Actions */}
            <View className="mt-8 px-4">
                <TouchableOpacity
                    className="flex-row items-center justify-center bg-red-50 p-4 rounded-lg border border-red-100"
                    onPress={handleLogout}
                >
                    <LogOut size={20} color="#DC2626" />
                    <Text className="ml-2 text-red-600 font-bold text-lg">Sair</Text>
                </TouchableOpacity>
            </View>

            <View className="mt-auto mb-6 items-center">
                <Text className="text-gray-400 text-xs text-center">
                    WhatsApp SaaS Mobile v1.0.0
                </Text>
            </View>
        </View>
    );
}
