"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpen,
  Brain,
  ClipboardList,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Sparkles,
  Sun,
  User as UserIcon,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { apiGet } from "@/lib/api";
import type { AiStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Panel", icon: Home },
  { href: "/subjects", label: "Asignaturas", icon: BookOpen },
  { href: "/exams", label: "Exámenes", icon: ClipboardList },
  { href: "/tutor", label: "Tutor IA", icon: MessageCircle },
  { href: "/stats", label: "Estadísticas", icon: BarChart3 },
  { href: "/profile", label: "Perfil", icon: UserIcon },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { dark, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: aiStatus } = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => apiGet<AiStatus>("/ai/status"),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all",
              active
                ? "bg-violet-600 text-white shadow-sm shadow-violet-600/30"
                : "text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800/80"
            )}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-5 py-5">
      <span className="ep-gradient flex h-9 w-9 items-center justify-center rounded-xl shadow-md shadow-violet-600/30">
        <GraduationCap className="h-5 w-5 text-white" />
      </span>
      <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
        ExamPredict <span className="ep-gradient-text">AI</span>
      </span>
    </Link>
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar escritorio */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white/80 backdrop-blur lg:flex dark:border-slate-800 dark:bg-slate-950/70">
        {brand}
        {nav}
        <div className="px-5 py-4 text-xs text-slate-400 dark:text-slate-500">
          Plataforma de estudio con IA
        </div>
      </aside>

      {/* Sidebar móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-slate-950/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 flex h-full w-72 animate-fade-up flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      {/* Contenido */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/70 px-4 py-3 backdrop-blur-md lg:px-8 dark:border-slate-800 dark:bg-slate-950/60">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="hidden items-center gap-2 lg:flex">
            {aiStatus?.configured ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                IA activa · {aiStatus.model}
              </span>
            ) : (
              <Link
                href="/profile"
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-300"
                title={aiStatus?.detail ?? "Configura tu API key"}
              >
                <Brain className="h-3.5 w-3.5" />
                IA sin configurar — ver guía
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Cambiar tema"
              title={dark ? "Modo claro" : "Modo oscuro"}
            >
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <div className="hidden items-center gap-2 sm:flex">
              <span className="max-w-[140px] truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                {user.name}
              </span>
            </div>
            <button
              onClick={async () => {
                await logout();
                router.replace("/login");
              }}
              className="rounded-xl p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
              title="Cerrar sesión"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        {!aiStatus?.configured && aiStatus && (
          <div className="animate-fade-in border-b border-amber-300/60 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 lg:px-8 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <strong>IA sin configurar.</strong> Agrega tu API key de Gemini en{" "}
            <code className="rounded bg-amber-200/60 px-1 py-0.5 dark:bg-amber-500/20">backend/.env</code>{" "}
            (variable <code className="rounded bg-amber-200/60 px-1 py-0.5 dark:bg-amber-500/20">GEMINI_API_KEY</code>)
            y reinicia el backend para activar el análisis de documentos, la generación de preguntas y el tutor.
          </div>
        )}

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
