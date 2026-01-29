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
    const [queryClient] = useState(() => new QueryClient());
    // URL de Produção (Render) - Acessível de qualquer lugar
    const baseUrl = "https://whatsapp-saas-7duy.onrender.com/api/trpc";

    // URL Local (Desenvolvimento)
    // const baseUrl = "http://192.168.100.2:3000/api/trpc";

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
