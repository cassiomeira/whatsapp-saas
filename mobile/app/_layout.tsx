import "../global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { useState } from "react";
import { trpc } from "../lib/trpc";
import { Stack } from "expo-router";
import superjson from "superjson";
import { StatusBar } from "expo-status-bar";

import Constants from "expo-constants";
import { getServerUrl } from "../lib/storage";

export default function RootLayout() {
    const [queryClient] = useState(() => new QueryClient());
    const [trpcClient, setTrpcClient] = useState<any>(null);
    const [queryClient] = useState(() => new QueryClient());

    useEffect(() => {
        const initClient = async () => {
            const url = await getServerUrl();
            console.log(`[TRPC] Inicializando com URL: ${url}`);

            const client = trpc.createClient({
                links: [
                    httpBatchLink({
                        url: url,
                        transformer: superjson,
                    }),
                ],
            });
            setTrpcClient(client);
        };
        initClient();
    }, []);

    if (!trpcClient) {
        return null; // Ou um Loading Screen
    }

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
