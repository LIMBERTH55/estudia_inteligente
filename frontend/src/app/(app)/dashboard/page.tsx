"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Award,
  BookOpen,
  ClipboardList,
  FileText,
  Play,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import type { DashboardData } from "@/lib/types";
import { Badge, Button, Card, EmptyState, LoadingBlock, Progress } from "@/components/ui";
import { ScoreLineChart } from "@/components/charts";
import { fmtDateTime, relevanceBarClass, scoreClass, statusLabel } from "@/lib/utils";

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiGet<DashboardData>("/dashboard"),
  });

  if (isLoading) return <LoadingBlock text="Cargando tu panel…" />;
  if (!data) return null;

  const { totals } = data;

  const statCards = [
    {
      label: "Materias",
      value: totals.subjects,
      icon: BookOpen,
      tone: "from-violet-600 to-indigo-700",
      href: "/subjects",
    },
    {
      label: "Documentos analizados",
      value: `${totals.documents_ready}/${totals.documents}`,
      icon: FileText,
      tone: "from-blue-600 to-indigo-700",
      href: "/subjects",
    },
    {
      label: "Exámenes realizados",
      value: totals.attempts,
      icon: ClipboardList,
      tone: "from-indigo-600 to-violet-700",
      href: "/exams",
    },
    {
      label: "Promedio general",
      value: totals.avg_score != null ? `${totals.avg_score}` : "—",
      icon: TrendingUp,
      tone: "from-emerald-600 to-teal-700",
      href: "/stats",
    },
    {
      label: "Última calificación",
      value: totals.last_score != null ? `${totals.last_score}` : "—",
      icon: Award,
      tone: "from-amber-500 to-orange-600",
      href: "/exams",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Panel principal</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tu progreso de estudio de un vistazo.
          </p>
        </div>
        <Link href="/subjects">
          <Button>
            <Plus className="h-4 w-4" />
            Nuevo examen
          </Button>
        </Link>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href}>
              <Card className="group h-full p-5 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/10">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${stat.tone} text-white shadow-md`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
                  {stat.value}
                </p>
                <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {stat.label}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Evolución */}
        <Card className="p-6 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">
              Evolución de calificaciones
            </h2>
            <Link href="/stats" className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-400">
              Ver estadísticas completas
            </Link>
          </div>
          <ScoreLineChart
            data={data.score_series.map((s, i) => ({
              label: `#${i + 1}`,
              score: s.score,
            }))}
          />
        </Card>

        {/* Temas prioritarios */}
        <Card className="p-6 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Target className="h-5 w-5 text-violet-500" />
            <h2 className="font-semibold text-slate-900 dark:text-white">Temas prioritarios</h2>
          </div>
          {data.priority_topics.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Sube documentos a una materia para descubrir qué temas estudiar primero.
            </p>
          ) : (
            <ul className="space-y-3.5">
              {data.priority_topics.map((t) => (
                <li key={`${t.subject_id}-${t.topic}`}>
                  <Link href={`/subjects/${t.subject_id}`} className="group block">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-slate-700 group-hover:text-violet-600 dark:text-slate-200 dark:group-hover:text-violet-400">
                        {t.topic}
                      </span>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {t.importance}/100
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Progress
                        value={t.importance}
                        className="h-1.5"
                        barClassName={relevanceBarClass(t.importance)}
                      />
                      <span className="shrink-0 text-[10px] text-slate-400">{t.subject_name}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Actividad reciente */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 dark:text-white">Actividad reciente</h2>
          <Link href="/exams" className="text-xs font-medium text-violet-600 hover:underline dark:text-violet-400">
            Ver todos los exámenes
          </Link>
        </div>
        {data.recent_attempts.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-8 w-8" />}
            title="Todavía no has realizado exámenes"
            description="Crea una materia, sube tus documentos y genera tu primera simulación de examen."
            action={
              <Link href="/subjects">
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4" />
                  Crear materia
                </Button>
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.recent_attempts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {a.title}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {a.subject_name} · {fmtDateTime(a.started_at)} ·{" "}
                    {a.mode === "practice" ? "Modo práctica" : "Modo examen"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {a.status === "finished" ? (
                    <Badge tone={(a.score ?? 0) >= 60 ? "green" : "rose"}>
                      {a.score != null ? `${a.score}/100` : "—"}
                    </Badge>
                  ) : (
                    <Badge tone="amber">{statusLabel(a.status)}</Badge>
                  )}
                  <Link href={a.status === "finished" ? `/exams/${a.id}/results` : `/exams/${a.id}`}>
                    <Button variant="ghost" size="sm">
                      {a.status === "finished" ? (
                        <>
                          Ver resultados <ArrowRight className="h-3.5 w-3.5" />
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" /> Continuar
                        </>
                      )}
                    </Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
