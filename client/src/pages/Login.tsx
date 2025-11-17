import { useAuth } from "@/_core/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_LOGO, APP_TITLE } from "@/const";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";

export default function Login() {
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();

  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) {
      setLocation("/dashboard");
    }
  }, [loading, user, setLocation]);

  const resetMessages = () => {
    setError(null);
    setMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();
    setSubmitting(true);

    try {
      // Verificar se Supabase está configurado
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error(
          "Autenticação não está configurada. Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env para habilitar o login."
        );
      }

      if (mode === "signIn") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          throw signInError;
        }
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              workspace_name: workspaceName,
            },
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        setMessage("Conta criada com sucesso! Você já pode acessar o painel.");
      }

      await utils.auth.me.invalidate();
      setLocation("/dashboard");
    } catch (submissionError) {
      if (submissionError instanceof Error) {
        // Tratar erros de rede/Failed to fetch de forma mais amigável
        if (submissionError.message.includes("Failed to fetch") || 
            submissionError.message.includes("NetworkError") ||
            submissionError.message.includes("fetch")) {
          setError("Erro de conexão. Verifique se o Supabase está configurado corretamente no arquivo .env (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).");
        } else {
          setError(submissionError.message);
        }
      } else {
        setError("Não foi possível concluir a operação. Tente novamente.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isSignUp = mode === "signUp";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/40">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          {APP_LOGO && (
            <img src={APP_LOGO} alt={APP_TITLE} className="w-16 h-16 rounded-xl mx-auto" />
          )}
          <h1 className="text-3xl font-semibold">{APP_TITLE}</h1>
          <p className="text-muted-foreground">
            {isSignUp
              ? "Crie sua conta para utilizar a plataforma"
              : "Entre com seu e-mail e senha"}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{isSignUp ? "Criar conta" : "Acessar conta"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome completo</Label>
                  <Input
                    id="fullName"
                    placeholder="Seu nome"
                    autoComplete="name"
                    value={fullName}
                    onChange={event => setFullName(event.target.value)}
                    required
                  />
                </div>
              )}

              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="workspaceName">Nome da empresa/workspace</Label>
                  <Input
                    id="workspaceName"
                    placeholder="Minha Farmácia"
                    value={workspaceName}
                    onChange={event => setWorkspaceName(event.target.value)}
                    required
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="voce@empresa.com"
                  autoComplete="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  required
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {message && <p className="text-sm text-emerald-600">{message}</p>}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processando...
                  </span>
                ) : isSignUp ? (
                  "Criar conta"
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>

            <div className="mt-4 text-sm text-center text-muted-foreground">
              {isSignUp ? (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => {
                    resetMessages();
                    setMode("signIn");
                  }}
                >
                  Já tem conta? Faça login
                </button>
              ) : (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => {
                    resetMessages();
                    setMode("signUp");
                  }}
                >
                  Não tem conta? Cadastre-se
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
