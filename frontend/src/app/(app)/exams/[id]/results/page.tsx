"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Info,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Target,
  XCircle,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { ResultQuestion, Results, StudyPlan } from "@/lib/types";
import { Alert, Badge, Button, Card, LoadingBlock, Progress } from "@/components/ui";
import { cn, DIFFICULTY_CLASSES, DIFFICULTY_LABELS, fmtDuration, QTYPE_LABELS, relevanceBarClass, scoreClass } from "@/lib/utils";

function answerToText(q: ResultQuestion, answer: Record<string, unknown> | null): string {
  if (!answer) return "(sin responder)";
  if (q.qtype === "mc" && typeof answer.index === "number")
    return q.options[answer.index as number] ?? `Opción ${answer.index}`;
  if (q.qtype === "tf") return answer.value ? "Verdadero" : "Falso";
  if (q.qtype === "fill") return ((answer.values as string[]) ?? []).join(" / ") || "(vacío)";
  if (q.qtype === "match")
    return ((answer.pairs as { left: string; right: string }[]) ?? [])
      .map((p) => `${p.left} → ${p.right || "…"}`)
      .join("; ") || "(vacío)";
  return ((answer.text as string) ?? "").trim() || "(vacío)";
}

function correctToText(q: ResultQuestion): string {
  const ca = q.correct_answer;
  if (q.qtype === "mc" && typeof ca.index === "number") return q.options[ca.index as number] ?? "";
  if (q.qtype === "tf") return ca.value ? "Verdadero" : "Falso";
  if (q.qtype === "fill") return ((ca.accepted as string[]) ?? []).join(" / ");
  if (q.qtype === "match")
    return ((ca.pairs as { left: string; right: string }[]) ?? [])
      .map((p) => `${p.left} → ${p.right}`)
      .join("; ");
  return ((ca.model as string) ?? "").trim() || "—";
}

function ResultRow({ q, index }: { q: ResultQuestion; index: number }) {
  const [open, setOpen] = useState(false);
  const status =
    q.is_correct === true ? "correct" : q.is_correct === false ? "incorrect" : "ungraded";
  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        status === "correct"
          ? "border-emerald-200 dark:border-emerald-500/30"
          : status === "incorrect"
            ? "border-rose-200 dark:border-rose-500/30"
            : "border-slate-200 dark:border-slate-800"
      )}
    >
      <button className="flex w-full items-start justify-between gap-4 text-left" onClick={() => setOpen(!open)}>
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5">
            {status === "correct" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : status === "incorrect" ? (
              <XCircle className="h-5 w-5 text-rose-500" />
            ) : (
              <Info className="h-5 w-5 text-slate-400" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
              #{index + 1}. {q.statement}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone="violet">{QTYPE_LABELS[q.qtype]}</Badge>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", DIFFICULTY_CLASSES[q.difficulty])}>
                {DIFFICULTY_LABELS[q.difficulty]}
              </span>
              <span className="text-xs text-slate-400">{q.topic}</span>
              <span className="text-xs text-slate-400">· Relevancia {q.relevance}/100</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            {q.points_awarded != null ? `${q.points_awarded.toFixed(1)} / ${q.points}` : "—"} pts
          </span>
          <ChevronDown className={cn("h-4 w-4 text-slate-400 transition", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="mt-4 animate-fade-in space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Tu respuesta
              </p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                {answerToText(q, q.answer)}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50/70 p-3.5 dark:bg-emerald-500/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Respuesta correcta
              </p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{correctToText(q)}</p>
            </div>
          </div>

          {q.feedback && (
            <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Retroalimentación
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">
                {q.feedback}
              </p>
            </div>
          )}

          {q.explanation && (
            <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              {q.explanation}
            </p>
          )}

          {q.relevance_reasons.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Target className="h-3.5 w-3.5" /> Relevancia estimada
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <Progress value={q.relevance} className="h-1.5 max-w-40" barClassName={relevanceBarClass(q.relevance)} />
                <span className="text-xs font-semibold text-slate-500">{q.relevance}/100</span>
              </div>
              <ul className="mt-1.5 space-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                {q.relevance_reasons.slice(0, 3).map((r, i) => (
                  <li key={i}>• {r}</li>
                ))}
              </ul>
            </div>
          )}

          {q.source_refs.filter((s) => s.quote).length > 0 && (
            <div className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <FileText className="h-3.5 w-3.5" /> Fuente en tu material
              </p>
              {q.source_refs.slice(0, 1).map((s, i) => (
                <div key={i} className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {s.document_name && (
                    <p className="font-medium text-slate-600 dark:text-slate-300">
                      {s.document_name}
                      {s.page ? ` · pág. ${s.page}` : ""}
                      {s.section ? ` · ${s.section}` : ""}
                    </p>
                  )}
                  <p className="mt-1 italic">«{s.quote}»</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [planError, setPlanError] = useState<string | null>(null);

  const { data: results, isLoading } = useQuery({
    queryKey: ["results", id],
    queryFn: () => apiGet<Results>(`/attempts/${id}/results`),
  });

  const { data: existingPlan, refetch: refetchPlan } = useQuery({
    queryKey: ["study-plan", id],
    queryFn: () => apiGet<StudyPlan | null>(`/attempts/${id}/study-plan`),
  });

  const planMutation = useMutation({
    mutationFn: () => apiPost<StudyPlan>(`/attempts/${id}/study-plan`),
    onSuccess: () => {
      setPlanError(null);
      refetchPlan();
    },
    onError: (err) => setPlanError(err instanceof Error ? err.message : "No se pudo generar el plan."),
  });

  if (isLoading || !results) return <LoadingBlock text="Calculando resultados…" />;

  const { attempt } = results;
  const correct = results.questions.filter((q) => q.is_correct === true).length;
  const incorrect = results.questions.filter((q) => q.is_correct === false).length;
  const plan = existingPlan ?? planMutation.data;

  return (
    <div className="mx-auto max-w-4xl animate-fade-up space-y-6">
      <Link
        href="/exams"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-violet-600 dark:text-slate-400"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a exámenes
      </Link>

      {/* Resumen */}
      <Card className="overflow-hidden">
        <div className="ep-gradient px-6 py-8 text-white">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="text-sm text-white/70">{attempt.subject_name}</p>
              <h1 className="mt-1 text-xl font-bold">{attempt.title}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                  {attempt.mode === "practice" ? "Modo práctica" : "Modo examen"}
                </span>
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                  {results.questions.length} preguntas
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                  <Clock className="h-3.5 w-3.5" /> {fmtDuration(attempt.duration_sec)}
                </span>
              </div>
            </div>
            <div className="text-center">
              <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-white/25 bg-white/10">
                <span className="text-4xl font-bold">
                  {attempt.score != null ? Math.round(attempt.score) : "—"}
                </span>
              </div>
              <p className="mt-2 text-xs text-white/70">sobre 100 puntos</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
          <div>
            <p className="text-xs text-slate-400">Correctas</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{correct}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Incorrectas</p>
            <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{incorrect}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Sin calificar con IA</p>
            <p className="text-lg font-bold text-slate-500">{results.ungraded_count}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Calificadas</p>
            <p className="text-lg font-bold text-slate-700 dark:text-slate-200">{results.graded_count}</p>
          </div>
        </div>
      </Card>

      {results.ungraded_count > 0 && (
        <Alert tone="amber" title="Algunas respuestas abiertas no pudieron calificarse con IA">
          La calificación se calculó sobre las preguntas calificadas. Vuelve a intentarlo cuando el
          proveedor de IA esté disponible.
        </Alert>
      )}

      {/* Dominio por tema */}
      {results.by_topic.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
            <Target className="h-5 w-5 text-violet-500" /> Desempeño por tema
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {results.by_topic.map((t) => (
              <div key={t.topic} className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                    {t.topic}
                  </span>
                  <span className={cn("text-sm font-bold", scoreClass(t.accuracy))}>{t.accuracy}%</span>
                </div>
                <Progress
                  value={t.accuracy}
                  className="mt-2 h-1.5"
                  barClassName={t.accuracy >= 60 ? "bg-emerald-500" : "bg-rose-500"}
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  {t.correct}/{t.answered} correctas
                  {t.relevance != null && ` · relevancia ${t.relevance}/100`}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Plan de estudio */}
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
            <Sparkles className="h-5 w-5 text-violet-500" /> Plan de estudio personalizado
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => planMutation.mutate()}
            loading={planMutation.isPending}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {plan ? "Regenerar plan" : "Generar plan con IA"}
          </Button>
        </div>

        {planError && <Alert tone="rose">{planError}</Alert>}

        {!plan ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Genera un plan de estudio basado en tus aciertos y errores de este examen: qué repasar
            primero, con qué actividades y en cuánto tiempo.
          </p>
        ) : (
          <div className="space-y-5">
            <p className="text-sm font-medium text-violet-700 dark:text-violet-300">
              {plan.content.headline}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {plan.content.blocks.map((b, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {b.topic}
                    </span>
                    <Badge tone={b.priority === "alta" ? "rose" : b.priority === "media" ? "amber" : "green"}>
                      Prioridad {b.priority}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{b.reason}</p>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {b.actions.map((a, j) => (
                      <li key={j}>• {a}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-slate-400">
                    ≈ {b.estimated_minutes} minutos sugeridos
                  </p>
                </div>
              ))}
            </div>

            {plan.content.session_plan.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Sesiones sugeridas
                </p>
                <div className="space-y-2">
                  {plan.content.session_plan.map((s, i) => (
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
              </div>
            )}

            {plan.content.general_tips.length > 0 && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-500/30 dark:bg-violet-500/10">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                  <BookOpen className="h-3.5 w-3.5" /> Consejos
                </p>
                <ul className="mt-1.5 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  {plan.content.general_tips.map((t, i) => (
                    <li key={i}>• {t}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Revisión pregunta por pregunta */}
      <div>
        <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">Revisión de respuestas</h2>
        <div className="space-y-3">
          {results.questions.map((q, i) => (
            <ResultRow key={q.id} q={q} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
