"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  FileText,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { Attempt, QType, QuestionSet, QuestionSetItem, Subject, Topic } from "@/lib/types";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingBlock,
  Modal,
  Progress,
  Select,
} from "@/components/ui";
import { cn, DIFFICULTY_CLASSES, DIFFICULTY_LABELS, fmtDateTime, QTYPE_LABELS, scoreClass } from "@/lib/utils";

const ALL_TYPES: QType[] = ["mc", "tf", "open", "fill", "match", "problem", "analysis"];
const COUNT_OPTIONS = [10, 20, 30, 50];

// ---------- Tarjeta de un conjunto (con sondeo mientras se genera) ----------

function SetCard({
  item,
  onStart,
  onDelete,
}: {
  item: QuestionSetItem;
  onStart: (set: QuestionSet) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: full } = useQuery({
    queryKey: ["qset", item.id],
    queryFn: () => apiGet<QuestionSet>(`/question-sets/${item.id}`),
    refetchInterval: (query) => (query.state.data?.status === "generating" ? 2500 : false),
    enabled: item.status === "ready" || expanded || item.status === "generating",
    initialData:
      item.status === "ready"
        ? undefined
        : ({
            ...item,
            questions: [],
          } as QuestionSet),
  });

  const status = full?.status ?? item.status;
  const questions = full?.questions ?? [];
  const config = full?.config ?? item.config;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-800 dark:text-slate-100">
              Preguntas del {fmtDateTime(item.created_at)}
            </span>
            {status === "generating" && (
              <Badge tone="amber">
                <Loader2 className="h-3 w-3 animate-spin" /> Generando…
              </Badge>
            )}
            {status === "ready" && <Badge tone="green">{item.questions_count} preguntas</Badge>}
            {status === "error" && (
              <Badge tone="rose">
                <AlertTriangle className="h-3 w-3" /> Error
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            {config.count ? `${config.count} solicitadas` : ""}
            {config.difficulty ? ` · ${DIFFICULTY_LABELS[config.difficulty]}` : " · dificultad mixta"}
            {config.types && config.types.length > 0
              ? ` · ${config.types.map((t) => QTYPE_LABELS[t]).join(", ")}`
              : " · todos los tipos"}
          </p>
          {config.note && (
            <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">{config.note}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {status === "ready" && (
            <>
              <Button size="sm" onClick={() => full && onStart(full)} disabled={!full}>
                <Play className="h-3.5 w-3.5" /> Simular examen
              </Button>
              <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>
                {expanded ? "Ocultar" : "Ver preguntas"}
                <ChevronDown className={cn("h-3.5 w-3.5 transition", expanded && "rotate-180")} />
              </Button>
            </>
          )}
          <button
            onClick={() => onDelete(item.id)}
            className="rounded-lg p-2 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
            title="Eliminar conjunto"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {status === "error" && full?.error && (
        <div className="mt-4">
          <Alert tone="rose" title="No se pudieron generar las preguntas">
            {full.error}
          </Alert>
        </div>
      )}

      {status === "generating" && (
        <div className="mt-4">
          <Progress value={45} barClassName="animate-pulse-soft" />
          <p className="mt-1.5 text-xs text-slate-400">
            La IA está redactando preguntas basadas en tus documentos. Esto puede tardar un poco.
          </p>
        </div>
      )}

      {expanded && status === "ready" && (
        <div className="mt-4 animate-fade-in space-y-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
          {questions.map((q, i) => (
            <div key={q.id} className="rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/50">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">#{i + 1}</span>
                <Badge tone="violet">{QTYPE_LABELS[q.qtype]}</Badge>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", DIFFICULTY_CLASSES[q.difficulty])}>
                  {DIFFICULTY_LABELS[q.difficulty]}
                </span>
                <span className="ml-auto text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Relevancia {q.relevance}/100
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{q.statement}</p>
              {q.relevance_reasons.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-violet-600 dark:text-violet-400">
                    ¿Por qué es relevante?
                  </summary>
                  <ul className="mt-1.5 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                    {q.relevance_reasons.map((r, j) => (
                      <li key={j}>• {r}</li>
                    ))}
                  </ul>
                </details>
              )}
              {q.source_refs.length > 0 && q.source_refs[0].document_name && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                  <FileText className="h-3 w-3" />
                  {q.source_refs[0].document_name}
                  {q.source_refs[0].page ? `, pág. ${q.source_refs[0].page}` : ""}
                  {q.source_refs[0].verified ? " · cita verificada" : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------- Pestaña principal ----------

export function ExamsTab({ subject }: { subject: Subject }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Configuración de generación
  const [count, setCount] = useState<number>(10);
  const [customCount, setCustomCount] = useState("");
  const [difficulty, setDifficulty] = useState<string>("");
  const [types, setTypes] = useState<QType[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [genError, setGenError] = useState<string | null>(null);

  // Modal de inicio de examen
  const [startSet, setStartSet] = useState<QuestionSet | null>(null);
  const [mode, setMode] = useState<"exam" | "practice">("exam");
  const [timeLimit, setTimeLimit] = useState(20);
  const [questionCount, setQuestionCount] = useState<number | "all">("all");
  const [highRelevance, setHighRelevance] = useState(false);

  const { data: sets, isLoading: loadingSets } = useQuery({
    queryKey: ["sets", subject.id],
    queryFn: () => apiGet<QuestionSetItem[]>(`/subjects/${subject.id}/question-sets`),
  });
  const { data: topics } = useQuery({
    queryKey: ["topics", subject.id],
    queryFn: () => apiGet<Topic[]>(`/subjects/${subject.id}/topics`),
  });
  const { data: attempts } = useQuery({
    queryKey: ["attempts", subject.id],
    queryFn: () => apiGet<Attempt[]>(`/attempts?subject_id=${subject.id}`),
  });

  const generate = useMutation({
    mutationFn: () =>
      apiPost<QuestionSet>(`/subjects/${subject.id}/question-sets`, {
        count: customCount ? Math.max(1, Math.min(60, parseInt(customCount) || 10)) : count,
        difficulty: difficulty || null,
        types,
        topics: selectedTopics,
      }),
    onSuccess: () => {
      setGenError(null);
      queryClient.invalidateQueries({ queryKey: ["sets", subject.id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => setGenError(err instanceof Error ? err.message : "Error al generar."),
  });

  const deleteSet = useMutation({
    mutationFn: (id: string) => apiDelete(`/question-sets/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sets", subject.id] }),
    onError: (err) => alert(err instanceof Error ? err.message : "No se pudo eliminar."),
  });

  const startAttempt = useMutation({
    mutationFn: () =>
      apiPost<Attempt>("/attempts", {
        set_id: startSet?.id,
        title: "",
        mode,
        time_limit_sec: timeLimit * 60,
        question_count: questionCount === "all" ? null : questionCount,
        only_high_relevance: highRelevance,
      }),
    onSuccess: (attempt) => router.push(`/exams/${attempt.id}`),
    onError: (err) => alert(err instanceof Error ? err.message : "No se pudo iniciar el examen."),
  });

  const readyDocs = subject.documents_ready;
  const canGenerate = readyDocs > 0 && !generate.isPending;

  const sortedSets = useMemo(
    () => (sets ?? []).slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [sets]
  );

  return (
    <div className="space-y-6">
      {/* Generador */}
      <Card className="p-6">
        <div className="mb-5 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-md shadow-violet-600/30">
            <Wand2 className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Generar preguntas de examen</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              La IA usará únicamente el contenido de tus documentos de {subject.name}.
            </p>
          </div>
        </div>

        {readyDocs === 0 ? (
          <Alert tone="amber" title="Primero necesitas documentos analizados">
            Ve a la pestaña «Documentos», sube tu material y espera a que el análisis con IA termine.
          </Alert>
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-4">
                <Field label="Cantidad de preguntas">
                  <div className="flex flex-wrap gap-2">
                    {COUNT_OPTIONS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setCount(n);
                          setCustomCount("");
                        }}
                        className={cn(
                          "rounded-xl border px-4 py-2 text-sm font-medium transition",
                          count === n && !customCount
                            ? "border-violet-500 bg-violet-600 text-white"
                            : "border-slate-300 text-slate-600 hover:border-violet-400 dark:border-slate-700 dark:text-slate-300"
                        )}
                      >
                        {n}
                      </button>
                    ))}
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      placeholder="Personalizado"
                      value={customCount}
                      onChange={(e) => setCustomCount(e.target.value)}
                      className="w-36"
                    />
                  </div>
                </Field>

                <Field label="Dificultad">
                  <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                    <option value="">Mezcla equilibrada</option>
                    <option value="facil">Fácil — recuerdo de definiciones</option>
                    <option value="intermedia">Intermedia — comprensión y aplicación</option>
                    <option value="dificil">Difícil — análisis y casos complejos</option>
                  </Select>
                </Field>
              </div>

              <div className="space-y-4">
                <Field label="Tipos de pregunta" hint="Sin selección = todos los tipos.">
                  <div className="flex flex-wrap gap-2">
                    {ALL_TYPES.map((t) => {
                      const active = types.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() =>
                            setTypes(active ? types.filter((x) => x !== t) : [...types, t])
                          }
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                            active
                              ? "border-violet-500 bg-violet-600 text-white"
                              : "border-slate-300 text-slate-600 hover:border-violet-400 dark:border-slate-700 dark:text-slate-300"
                          )}
                        >
                          {QTYPE_LABELS[t]}
                        </button>
                      );
                    })}
                  </div>
                </Field>

                {topics && topics.length > 0 && (
                  <Field label="Temas específicos" hint="Sin selección = todos los temas detectados.">
                    <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                      {topics.map((t) => {
                        const active = selectedTopics.includes(t.name);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() =>
                              setSelectedTopics(
                                active
                                  ? selectedTopics.filter((x) => x !== t.name)
                                  : [...selectedTopics, t.name]
                              )
                            }
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                              active
                                ? "border-blue-500 bg-blue-600 text-white"
                                : "border-slate-300 text-slate-600 hover:border-blue-400 dark:border-slate-700 dark:text-slate-300"
                            )}
                            title={`Relevancia ${t.importance}/100`}
                          >
                            {t.name}
                            <span className="ml-1 opacity-60">{t.importance}</span>
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                )}
              </div>
            </div>

            {genError && (
              <div className="mt-4">
                <Alert tone="rose" title="No se pudo generar">
                  {genError}
                </Alert>
              </div>
            )}

            <div className="mt-5 flex items-center gap-3">
              <Button onClick={() => generate.mutate()} loading={generate.isPending} disabled={!canGenerate} size="lg">
                <Sparkles className="h-4.5 w-4.5" />
                {generate.isPending ? "Iniciando generación…" : "Generar preguntas"}
              </Button>
              <p className="text-xs text-slate-400">
                Las preguntas incluyen respuesta correcta, explicación y referencia al documento.
              </p>
            </div>
          </>
        )}
      </Card>

      {/* Conjuntos generados */}
      <div>
        <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">Conjuntos de preguntas</h2>
        {loadingSets ? (
          <LoadingBlock text="Cargando conjuntos…" />
        ) : sortedSets.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-9 w-9" />}
            title="Aún no hay preguntas generadas"
            description="Configura el generador y crea tu primer conjunto de preguntas de práctica."
          />
        ) : (
          <div className="space-y-3">
            {sortedSets.map((s) => (
              <SetCard
                key={s.id}
                item={s}
                onStart={(set) => {
                  setStartSet(set);
                  setQuestionCount("all");
                  setHighRelevance(false);
                  setMode("exam");
                  setTimeLimit(20);
                }}
                onDelete={(id) => {
                  if (confirm("¿Eliminar este conjunto de preguntas?")) deleteSet.mutate(id);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Historial de intentos */}
      <div>
        <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">Exámenes de esta materia</h2>
        {!attempts || attempts.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Todavía no has realizado simulaciones de esta materia.
          </p>
        ) : (
          <Card className="divide-y divide-slate-100 dark:divide-slate-800">
            {attempts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{a.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {fmtDateTime(a.started_at)} · {a.mode === "practice" ? "Práctica" : "Examen"} ·{" "}
                    {a.answered_count}/{a.questions_count} respondidas
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {a.status === "finished" ? (
                    <span className={cn("text-lg font-bold", scoreClass(a.score))}>
                      {a.score != null ? `${a.score}` : "—"}
                      <span className="text-xs font-normal text-slate-400">/100</span>
                    </span>
                  ) : (
                    <Badge tone="amber">En curso</Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(a.status === "finished" ? `/exams/${a.id}/results` : `/exams/${a.id}`)}
                  >
                    {a.status === "finished" ? "Resultados" : "Continuar"}
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Modal iniciar examen */}
      <Modal
        open={!!startSet}
        onClose={() => setStartSet(null)}
        title="Configurar simulación"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStartSet(null)}>
              Cancelar
            </Button>
            <Button onClick={() => startAttempt.mutate()} loading={startAttempt.isPending}>
              <Play className="h-4 w-4" /> Comenzar ahora
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Modo">
              <Select value={mode} onChange={(e) => setMode(e.target.value as "exam" | "practice")}>
                <option value="exam">Examen — sin mostrar respuestas hasta el final</option>
                <option value="practice">Práctica — retroalimentación inmediata</option>
              </Select>
            </Field>
            <Field label="Tiempo límite">
              <Select value={timeLimit} onChange={(e) => setTimeLimit(parseInt(e.target.value))}>
                <option value={0}>Sin límite</option>
                <option value={10}>10 minutos</option>
                <option value={15}>15 minutos</option>
                <option value={20}>20 minutos</option>
                <option value={30}>30 minutos</option>
                <option value={45}>45 minutos</option>
                <option value={60}>60 minutos</option>
              </Select>
            </Field>
          </div>
          <Field label="Cantidad de preguntas del examen">
            <Select
              value={questionCount}
              onChange={(e) => setQuestionCount(e.target.value === "all" ? "all" : parseInt(e.target.value))}
            >
              <option value="all">Todas ({startSet?.questions.length ?? 0})</option>
              {[10, 20, 30, 50]
                .filter((n) => n < (startSet?.questions.length ?? 0))
                .map((n) => (
                  <option key={n} value={n}>
                    {n} preguntas al azar
                  </option>
                ))}
            </Select>
          </Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3.5 dark:border-slate-700">
            <input
              type="checkbox"
              checked={highRelevance}
              onChange={(e) => setHighRelevance(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-violet-600"
            />
            <span className="text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">
                Priorizar preguntas de mayor relevancia
              </span>
              <span className="mt-0.5 block text-xs text-slate-400">
                Selecciona primero las preguntas con relevancia estimada ≥ 60 (según el análisis del material).
              </span>
            </span>
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:underline dark:text-violet-400"
              onClick={() => {
                setStartSet(null);
                generate.mutate();
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Generar más preguntas
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
