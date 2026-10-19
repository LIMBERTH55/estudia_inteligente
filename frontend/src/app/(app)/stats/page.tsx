"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Award, BarChart3, BookOpen, ClipboardList, Sparkles, Target, TrendingUp } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { StudyPlan, Subject, SubjectStats } from "@/lib/types";
import { Badge, Button, Card, EmptyState, LoadingBlock, Modal, Progress, Select } from "@/components/ui";
import { ScoreLineChart, TopicAccuracyChart } from "@/components/charts";
import { cn, fmtDateTime, scoreClass } from "@/lib/utils";

export default function StatsPage() {
  const [subjectId, setSubjectId] = useState<string>("");
  const [planOpen, setPlanOpen] = useState<StudyPlan | null>(null);

  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: () => apiGet<Subject[]>("/subjects"),
  });

  const activeId = subjectId || subjects?.[0]?.id || "";

  const { data: stats, isLoading } = useQuery({
    queryKey: ["stats", activeId],
    queryFn: () => apiGet<SubjectStats>(`/subjects/${activeId}/stats`),
    enabled: !!activeId,
  });

  const { data: plans } = useQuery({
    queryKey: ["study-plans", activeId],
    queryFn: () => apiGet<StudyPlan[]>(`/study-plans?subject_id=${activeId}`),
    enabled: !!activeId,
  });

  if (!subjects) return <LoadingBlock text="Cargando…" />;

  if (subjects.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<BarChart3 className="h-9 w-9" />}
          title="Sin datos todavía"
          description="Crea una materia, sube documentos y realiza exámenes para ver tus estadísticas de progreso."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-up space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Estadísticas</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Tu progreso real: dominio por tema, evolución y planes de estudio.
          </p>
        </div>
        <div className="w-64">
          <Select value={activeId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading || !stats ? (
        <LoadingBlock text="Calculando estadísticas…" />
      ) : (
        <>
          {/* Tarjetas */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Exámenes finalizados", value: stats.attempts_count, icon: ClipboardList, tone: "from-violet-600 to-indigo-700" },
              {
                label: "Promedio",
                value: stats.avg_score != null ? `${stats.avg_score}/100` : "—",
                icon: TrendingUp,
                tone: "from-emerald-600 to-teal-700",
              },
              {
                label: "Mejor nota",
                value: stats.best_score != null ? `${stats.best_score}/100` : "—",
                icon: Award,
                tone: "from-amber-500 to-orange-600",
              },
              {
                label: "Última nota",
                value: stats.last_score != null ? `${stats.last_score}/100` : "—",
                icon: Sparkles,
                tone: "from-blue-600 to-indigo-700",
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <Card key={card.label} className="p-5">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${card.tone} text-white shadow-md`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{card.value}</p>
                  <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{card.label}</p>
                </Card>
              );
            })}
          </div>

          {/* Evolución */}
          <Card className="p-6">
            <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">
              Evolución de tus calificaciones
            </h2>
            <ScoreLineChart
              data={stats.score_series.map((s, i) => ({ label: `Examen ${i + 1}`, score: s.score }))}
            />
          </Card>

          {/* Dominio por tema */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                <BarChart3 className="h-5 w-5 text-violet-500" /> Aciertos por tema
              </h2>
              <TopicAccuracyChart data={stats.topics} />
            </Card>

            <Card className="p-6">
              <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
                <Target className="h-5 w-5 text-violet-500" /> Dominio detallado
              </h2>
              {stats.topics.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Realiza exámenes para medir tu dominio por tema.
                </p>
              ) : (
                <ul className="space-y-3.5">
                  {stats.topics.map((t) => (
                    <li key={t.topic}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                          {t.topic}
                        </span>
                        <span className={cn("text-sm font-bold", scoreClass(t.accuracy))}>
                          {t.accuracy}%
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-3">
                        <Progress
                          value={t.accuracy}
                          className="h-1.5"
                          barClassName={
                            t.accuracy >= 80
                              ? "bg-emerald-500"
                              : t.accuracy >= 60
                                ? "bg-violet-500"
                                : t.accuracy >= 40
                                  ? "bg-amber-500"
                                  : "bg-rose-500"
                          }
                        />
                        <span className="shrink-0 text-xs text-slate-400">
                          {t.correct}/{t.answered}
                          {t.relevance != null && ` · rel. ${t.relevance}`}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Planes de estudio */}
          <Card className="p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <BookOpen className="h-5 w-5 text-violet-500" /> Planes de estudio generados
            </h2>
            {!plans || plans.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Los planes se generan desde la página de resultados de cada examen, con base en tus
                errores reales.
              </p>
            ) : (
              <div className="space-y-2.5">
                {plans.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlanOpen(p)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5 text-left transition hover:border-violet-300 dark:border-slate-700 dark:hover:border-violet-500/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                        {p.content.headline}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {fmtDateTime(p.created_at)} · {p.content.blocks.length} temas prioritarios
                      </p>
                    </div>
                    <Badge tone="violet">Ver plan</Badge>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {/* Modal plan */}
      <Modal
        open={!!planOpen}
        onClose={() => setPlanOpen(null)}
        title={planOpen?.content.headline ?? "Plan de estudio"}
        wide
        footer={
          <Button variant="ghost" onClick={() => setPlanOpen(null)}>
            Cerrar
          </Button>
        }
      >
        {planOpen && (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              {planOpen.content.blocks.map((b, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {b.topic}
                    </span>
                    <Badge tone={b.priority === "alta" ? "rose" : b.priority === "media" ? "amber" : "green"}>
                      {b.priority}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{b.reason}</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {b.actions.map((a, j) => (
                      <li key={j}>• {a}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-slate-400">≈ {b.estimated_minutes} minutos</p>
                </div>
              ))}
            </div>
            {planOpen.content.session_plan.length > 0 && (
              <div className="space-y-2">
                {planOpen.content.session_plan.map((s, i) => (
                  <div key={i} className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {s.day_label} — {s.focus}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {s.activities.map((a, j) => (
                        <li key={j}>• {a}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {planOpen.content.general_tips.length > 0 && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-500/30 dark:bg-violet-500/10">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                  Consejos
                </p>
                <ul className="mt-1.5 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  {planOpen.content.general_tips.map((t, i) => (
                    <li key={i}>• {t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
