"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Eye,
  Flag,
  Info,
  Lightbulb,
  Send,
  XCircle,
} from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { AttemptState, QuestionPreview, Reveal } from "@/lib/types";
import { Alert, Badge, Button, Card, LoadingBlock, Modal, Progress, Textarea, Input } from "@/components/ui";
import { cn, DIFFICULTY_CLASSES, DIFFICULTY_LABELS, QTYPE_LABELS } from "@/lib/utils";

type AnswerValue = Record<string, unknown> | null;

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const a = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const letters = ["A", "B", "C", "D", "E", "F"];

// ---------- Renderizadores por tipo de pregunta ----------

function QuestionInput({
  question,
  value,
  onChange,
  disabled,
}: {
  question: QuestionPreview;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  disabled: boolean;
}) {
  const pairs = question.pairs;

  switch (question.qtype) {
    case "mc": {
      const selected = (value as { index?: number } | null)?.index;
      return (
        <div className="space-y-2.5">
          {question.options.map((opt, i) => (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ index: i })}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left text-sm transition",
                selected === i
                  ? "border-violet-500 bg-violet-50 text-violet-900 dark:border-violet-500 dark:bg-violet-500/15 dark:text-violet-100"
                  : "border-slate-200 hover:border-violet-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-violet-500/50 dark:hover:bg-slate-800/60",
                disabled && "cursor-not-allowed opacity-70"
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  selected === i
                    ? "bg-violet-600 text-white"
                    : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                )}
              >
                {letters[i]}
              </span>
              <span className="text-slate-700 dark:text-slate-200">{opt}</span>
            </button>
          ))}
        </div>
      );
    }
    case "tf": {
      const selected = (value as { value?: boolean } | null)?.value;
      return (
        <div className="flex gap-3">
          {[
            { v: true, label: "Verdadero" },
            { v: false, label: "Falso" },
          ].map(({ v, label }) => (
            <button
              key={label}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ value: v })}
              className={cn(
                "flex-1 rounded-xl border px-4 py-4 text-sm font-semibold transition",
                selected === v
                  ? "border-violet-500 bg-violet-600 text-white"
                  : "border-slate-200 text-slate-600 hover:border-violet-300 dark:border-slate-700 dark:text-slate-300"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      );
    }
    case "fill": {
      const parts = question.statement.split("____");
      const values = ((value as { values?: string[] } | null)?.values ?? []) as string[];
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
            {parts.map((part, i) => (
              <span key={i} className="inline-flex flex-wrap items-center gap-2">
                <span className="whitespace-pre-wrap">{part}</span>
                {i < parts.length - 1 && (
                  <Input
                    className="inline-block w-40"
                    placeholder={`Espacio ${i + 1}`}
                    value={values[i] ?? ""}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = [...values];
                      next[i] = e.target.value;
                      onChange({ values: next });
                    }}
                  />
                )}
              </span>
            ))}
          </div>
        </div>
      );
    }
    case "match": {
      const rightOptions = useMemo(
        () => seededShuffle(pairs.map((p) => p.right), question.id),
        [pairs, question.id]
      );
      const current = ((value as { pairs?: { left: string; right: string }[] } | null)?.pairs ?? []) as {
        left: string;
        right: string;
      }[];
      const getSelected = (left: string) => current.find((p) => p.left === left)?.right ?? "";
      const setPair = (left: string, right: string) => {
        const next = pairs.map((p) => ({
          left: p.left,
          right: p.left === left ? right : getSelected(p.left),
        }));
        onChange({ pairs: next });
      };
      return (
        <div className="space-y-3">
          {pairs.map((pair) => (
            <div key={pair.left} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3.5 sm:flex-row sm:items-center dark:border-slate-700">
              <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                {pair.left}
              </span>
              <span className="hidden text-slate-300 sm:block">→</span>
              <select
                disabled={disabled}
                value={getSelected(pair.left)}
                onChange={(e) => setPair(pair.left, e.target.value)}
                className="flex-1 cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">— Selecciona —</option>
                {rightOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      );
    }
    case "open":
    case "problem":
    case "analysis":
    default: {
      const text = ((value as { text?: string } | null)?.text ?? "") as string;
      return (
        <Textarea
          placeholder="Escribe tu respuesta aquí…"
          rows={question.qtype === "open" ? 5 : 7}
          disabled={disabled}
          value={text}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      );
    }
  }
}

// ---------- Página del simulador ----------

export default function ExamRunnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: state, isLoading } = useQuery({
    queryKey: ["attempt", id],
    queryFn: () => apiGet<AttemptState>(`/attempts/${id}`),
  });

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [reveals, setReveals] = useState<Record<string, Reveal>>({});
  const [current, setCurrent] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [planMsg, setPlanMsg] = useState<string | null>(null);

  const initialized = useRef(false);
  const finishing = useRef(false);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Inicializar estado local desde el servidor
  useEffect(() => {
    if (!state || initialized.current) return;
    initialized.current = true;
    setAnswers(Object.fromEntries(Object.entries(state.answers).map(([qid, a]) => [qid, a.answer])));
    setFlags(Object.fromEntries(Object.entries(state.answers).map(([qid, a]) => [qid, a.flagged])));
    const initial: Record<string, Reveal> = {};
    state.questions.forEach((q) => {
      if (q.reveal) initial[q.id] = q.reveal;
    });
    setReveals(initial);
    setRemaining(state.remaining_sec);
  }, [state]);

  const finishMutation = useMutation({
    mutationFn: () => apiPost(`/attempts/${id}/finish`),
    onSuccess: () => router.replace(`/exams/${id}/results`),
    onError: () => {
      finishing.current = false;
      setPlanMsg("No se pudo finalizar el examen. Revisa tu conexión e inténtalo de nuevo.");
    },
  });

  // Temporizador
  useEffect(() => {
    if (remaining == null) return;
    if (remaining <= 0) {
      if (!finishing.current && state?.attempt.status === "in_progress") {
        finishing.current = true;
        finishMutation.mutate();
      }
      return;
    }
    const t = setTimeout(() => setRemaining((r) => (r == null ? null : r - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  // Si ya estaba finalizado (por tiempo agotado u otra pestaña)
  useEffect(() => {
    if (state && state.attempt.status === "finished") {
      router.replace(`/exams/${id}/results`);
    }
  }, [state, router, id]);

  const saveAnswer = useCallback(
    async (questionId: string, answer: AnswerValue, flagged: boolean) => {
      try {
        const res = await apiPatch<{ reveal: Reveal | null }>(
          `/attempts/${id}/answers/${questionId}`,
          { answer, flagged }
        );
        if (res?.reveal) setReveals((prev) => ({ ...prev, [questionId]: res.reveal as Reveal }));
      } catch (err) {
        setPlanMsg(err instanceof Error ? err.message : "No se pudo guardar tu respuesta.");
        setTimeout(() => setPlanMsg(null), 4000);
      }
    },
    [id]
  );

  const updateAnswer = useCallback(
    (questionId: string, value: AnswerValue) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
      const flag = flags[questionId] ?? false;
      // Guardado inmediato para selecciones; con pequeño retraso para texto
      if (saveTimers.current[questionId]) clearTimeout(saveTimers.current[questionId]);
      saveTimers.current[questionId] = setTimeout(
        () => saveAnswer(questionId, value, flag),
        typeof value?.text === "string" ? 900 : 120
      );
    },
    [flags, saveAnswer]
  );

  const toggleFlag = useCallback(
    (questionId: string) => {
      const next = !(flags[questionId] ?? false);
      setFlags((prev) => ({ ...prev, [questionId]: next }));
      saveAnswer(questionId, answers[questionId] ?? null, next);
    },
    [flags, answers, saveAnswer]
  );

  const questions = state?.questions ?? [];
  const answeredCount = useMemo(
    () => questions.filter((q) => answers[q.id] != null).length,
    [questions, answers]
  );
  const question = questions[current];
  const isPractice = state?.attempt.mode === "practice";
  const reveal = question ? reveals[question.id] : undefined;

  if (isLoading || !state) return <LoadingBlock text="Cargando examen…" />;
  if (!question) return <Alert tone="rose">Este examen no tiene preguntas disponibles.</Alert>;

  const fmtTime = (s: number | null) => {
    if (s == null) return "Sin límite";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="mx-auto max-w-4xl animate-fade-up space-y-5">
      {/* Encabezado */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-bold text-slate-900 dark:text-white">{state.attempt.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge tone={isPractice ? "blue" : "violet"}>
                {isPractice ? "Modo práctica" : "Modo examen"}
              </Badge>
              <span className="text-xs text-slate-400">{state.attempt.subject_name}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {remaining != null && (
              <span
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3.5 py-2 font-mono text-lg font-bold",
                  remaining <= 60
                    ? "animate-pulse-soft bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                )}
              >
                <Clock className="h-4.5 w-4.5" />
                {fmtTime(remaining)}
              </span>
            )}
            <Button variant="secondary" onClick={() => setConfirmFinish(true)}>
              <Send className="h-4 w-4" /> Finalizar
            </Button>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              Pregunta {current + 1} de {questions.length}
            </span>
            <span>
              {answeredCount}/{questions.length} respondidas
            </span>
          </div>
          <Progress value={(answeredCount / Math.max(questions.length, 1)) * 100} />
        </div>
      </Card>

      {planMsg && <Alert tone="rose">{planMsg}</Alert>}

      <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
        {/* Pregunta */}
        <Card className="p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone="violet">{QTYPE_LABELS[question.qtype]}</Badge>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", DIFFICULTY_CLASSES[question.difficulty])}>
              {DIFFICULTY_LABELS[question.difficulty]}
            </span>
            <span className="text-xs text-slate-400">{question.topic}</span>
            <button
              onClick={() => toggleFlag(question.id)}
              className={cn(
                "ml-auto flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition",
                flags[question.id]
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                  : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
            >
              <Flag className="h-3.5 w-3.5" />
              {flags[question.id] ? "Marcada" : "Marcar para revisar"}
            </button>
          </div>

          <p className="mb-5 text-base font-medium leading-relaxed text-slate-800 dark:text-slate-100">
            {question.statement}
          </p>

          <QuestionInput
            question={question}
            value={answers[question.id] ?? null}
            onChange={(v) => updateAnswer(question.id, v)}
            disabled={false}
          />

          {/* Revelación en modo práctica */}
          {isPractice && reveal && (
            <div className="mt-5 animate-fade-in">
              <div
                className={cn(
                  "rounded-xl border p-4",
                  reveal.is_correct
                    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                    : "border-rose-300 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10"
                )}
              >
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {reveal.is_correct === true && (
                    <>
                      <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-700 dark:text-emerald-300">¡Correcto!</span>
                    </>
                  )}
                  {reveal.is_correct === false && (
                    <>
                      <XCircle className="h-4.5 w-4.5 text-rose-600 dark:text-rose-400" />
                      <span className="text-rose-700 dark:text-rose-300">Incorrecto</span>
                    </>
                  )}
                  {reveal.is_correct === null && (
                    <>
                      <Info className="h-4.5 w-4.5 text-slate-500" />
                      <span className="text-slate-600 dark:text-slate-300">Respuesta registrada</span>
                    </>
                  )}
                </p>
                {reveal.feedback && (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{reveal.feedback}</p>
                )}
                <div className="mt-3 rounded-lg bg-white/70 p-3 text-sm dark:bg-slate-900/60">
                  <p className="font-medium text-slate-700 dark:text-slate-200">Respuesta correcta:</p>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    {(() => {
                      const ca = reveal.correct_answer as Record<string, unknown>;
                      if (question.qtype === "mc" && typeof ca.index === "number")
                        return question.options[ca.index as number];
                      if (question.qtype === "tf") return ca.value ? "Verdadero" : "Falso";
                      if (question.qtype === "fill" && Array.isArray(ca.accepted))
                        return (ca.accepted as string[]).join(" / ");
                      if (question.qtype === "match" && Array.isArray(ca.pairs))
                        return (ca.pairs as { left: string; right: string }[])
                          .map((p) => `${p.left} → ${p.right}`)
                          .join("; ");
                      return String(ca.model ?? "—");
                    })()}
                  </p>
                </div>
                {reveal.explanation && (
                  <p className="mt-3 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    {reveal.explanation}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Navegación */}
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-5 dark:border-slate-800">
            <Button
              variant="outline"
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              disabled={current === 0}
            >
              <ArrowLeft className="h-4 w-4" /> Anterior
            </Button>
            {current < questions.length - 1 ? (
              <Button onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}>
                Siguiente <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setConfirmFinish(true)}>
                <Send className="h-4 w-4" /> Finalizar examen
              </Button>
            )}
          </div>
        </Card>

        {/* Navegador de preguntas */}
        <Card className="h-fit p-4 lg:sticky lg:top-20">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Navegación
          </p>
          <div className="grid grid-cols-6 gap-2 lg:grid-cols-5">
            {questions.map((q, i) => {
              const answered = answers[q.id] != null;
              const flagged = flags[q.id];
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrent(i)}
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold transition",
                    i === current
                      ? "bg-violet-600 text-white ring-2 ring-violet-400 ring-offset-2 dark:ring-offset-slate-900"
                      : answered
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"
                  )}
                >
                  {i + 1}
                  {flagged && (
                    <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4 space-y-1.5 text-[11px] text-slate-400">
            <p className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-emerald-200 dark:bg-emerald-500/40" /> Respondida
            </p>
            <p className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-amber-300" /> Marcada para revisar
            </p>
          </div>
        </Card>
      </div>

      {/* Confirmación de finalización */}
      <Modal
        open={confirmFinish}
        onClose={() => setConfirmFinish(false)}
        title="¿Finalizar el examen?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmFinish(false)}>
              Seguir respondiendo
            </Button>
            <Button
              onClick={() => {
                setConfirmFinish(false);
                finishing.current = true;
                finishMutation.mutate();
              }}
              loading={finishMutation.isPending}
            >
              <Send className="h-4 w-4" /> Finalizar y calificar
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <p>
            Has respondido <strong>{answeredCount}</strong> de <strong>{questions.length}</strong>{" "}
            preguntas.
          </p>
          {answeredCount < questions.length && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Quedan {questions.length - answeredCount} pregunta(s) sin responder. Se contarán como
                incorrectas.
              </span>
            </div>
          )}
          <p>La calificación se calculará sobre 100 puntos y podrás revisar cada respuesta.</p>
        </div>
      </Modal>
    </div>
  );
}
