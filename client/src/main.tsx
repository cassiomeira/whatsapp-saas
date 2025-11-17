import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();

let accessToken: string | null = null;

// Chamar getSession com try/catch para não quebrar se Supabase não estiver configurado
supabase.auth.getSession().then(({ data }) => {
  accessToken = data.session?.access_token ?? null;
}).catch((error) => {
  console.warn("[Supabase] Error getting session (expected if not configured):", error.message);
});

// Registrar listener de auth state change com try/catch
try {
  supabase.auth.onAuthStateChange((_event, session) => {
    accessToken = session?.access_token ?? null;
    queryClient.invalidateQueries().catch(() => undefined);
  });
} catch (error) {
  console.warn("[Supabase] Error setting up auth state change (expected if not configured):", error);
}

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async fetch(input, init) {
        const headers = new Headers(init?.headers ?? {});
        if (accessToken) {
          headers.set("Authorization", `Bearer ${accessToken}`);
        }

        return globalThis.fetch(input, {
          ...(init ?? {}),
          headers,
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
