import { createTRPCReact } from "@trpc/react-query";
// Importamos o AppRouter do backend para ter tipagem completa
import type { AppRouter } from "../../server/routers";

export const trpc = createTRPCReact<AppRouter>();
