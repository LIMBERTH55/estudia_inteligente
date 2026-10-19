"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GraduationCap, LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button, Card, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="ep-gradient flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg shadow-violet-600/30">
              <GraduationCap className="h-6 w-6 text-white" />
            </span>
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              ExamPredict <span className="ep-gradient-text">AI</span>
            </span>
          </Link>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Inicia sesión para continuar con tu preparación
          </p>
        </div>

        <Card className="p-7">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Correo electrónico">
              <Input
                type="email"
                required
                autoComplete="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Contraseña">
              <Input
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {error && (
              <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} className="w-full" size="lg">
              <LogIn className="h-4.5 w-4.5" />
              Iniciar sesión
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          ¿No tienes cuenta?{" "}
          <Link href="/register" className="font-medium text-violet-600 hover:underline dark:text-violet-400">
            Regístrate gratis
          </Link>
        </p>
      </div>
    </div>
  );
}
