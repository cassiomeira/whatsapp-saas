import "../global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Stack } from "expo-router";
import superjson from "superjson";
import { StatusBar } from "expo-status-bar";

import Constants from "expo-constants";

export default function RootLayout() {
    const [trpcClient] = useState(() => {
        // Detectar IP da máquina automaticamente para funcionar no celular físico (Expo Go)
        const localhost = Constants.expoConfig?.hostUri?.split(`:`)[0];
        const baseUrl = localhost ? `http://${localhost}:3000/api/trpc` : "http://localhost:3000/api/trpc";

        // URL de Produção (comentada para debug)
        // const baseUrl = "https://whatsapp-saas-7duy.onrender.com/api/trpc";

        console.log(`[TRPC] Backend URL: ${baseUrl}`);

        return trpc.createClient({
            links: [
                httpBatchLink({
                    url: baseUrl,
                    transformer: superjson,
                }),
            ],
        });
    });

    return (
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
                <StatusBar style="light" />
                <Stack
                    screenOptions={{
                        headerStyle: {
                            backgroundColor: "#075E54", // Cor do WhatsApp
                        },
                        headerTintColor: "#fff",
                        headerTitleStyle: {
                            fontWeight: "bold",
                        },
                    }}
                />
            </QueryClientProvider>
        </trpc.Provider>
    );
}
