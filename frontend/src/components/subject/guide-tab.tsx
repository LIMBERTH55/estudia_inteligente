"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Info, Lightbulb, ListChecks, Target } from "lucide-react";
import { useState } from "react";
import { apiGet } from "@/lib/api";
import type { Subject, Topic } from "@/lib/types";
import { Badge, Card, EmptyState, LoadingBlock, Progress } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { relevanceBarClass } from "@/lib/utils";

const FACTOR_LABELS: Record<string, string> = {
  frequency: "Frecuencia",
  coverage: "Repetición entre documentos",
  structure: "Definiciones/fórmulas",
  heading: "Énfasis en títulos",
  llm: "Análisis del contenido",
  exam: "Exámenes anteriores",
};

function TopicRow({ topic }: { topic: Topic }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-violet-300 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-violet-500/40">
      <button className="flex w-full items-start justify-between gap-4 text-left" onClick={() => setOpen(!open)}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-800 dark:text-slate-100">{topic.name}</span>
            {topic.llm_hint != null && topic.llm_hint >= 75 && <Badge tone="violet">Tema central</Badge>}
          </div>
          {topic.description && (
            <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
              {topic.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <span className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {topic.importance}
              <span className="text-xs font-normal text-slate-400">/100</span>
            </span>
          </div>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      <div className="mt-3 flex items-center gap-3">
        <Progress value={topic.importance} className="h-1.5" barClassName={relevanceBarClass(topic.importance)} />
        <span className="shrink-0 text-xs text-slate-400">{topic.mention_count} menciones</span>
      </div>

      {open && (
        <div className="mt-4 animate-fade-in space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Info className="h-3.5 w-3.5" /> ¿Por qué esta relevancia?
            </p>
            <ul className="space-y-1">
              {topic.reasons.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                  {r}
                </li>
              ))}
            </ul>
          </div>

          {Object.keys(topic.scores).length > 0 && (
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.entries(topic.scores).map(([key, value]) => (
                <div key={key} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                  <p className="text-[11px] text-slate-400">{FACTOR_LABELS[key] ?? key}</p>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {Math.round(value)}/100
                  </p>
                </div>
              ))}
            </div>
          )}

          {topic.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {topic.keywords.map((kw) => (
                <Badge key={kw} tone="slate">
                  {kw}
                </Badge>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-400">
            Aparece en {topic.document_ids.length} documento(s) de la materia.
          </p>
        </div>
      )}
    </div>
  );
}

export function GuideTab({ subject }: { subject: Subject }) {
  const { data: topics, isLoading } = useQuery({
    queryKey: ["topics", subject.id],
    queryFn: () => apiGet<Topic[]>(`/subjects/${subject.id}/topics`),
  });

  if (isLoading) return <LoadingBlock text="Cargando temas…" />;

  if (subject.documents_ready === 0) {
    return (
      <EmptyState
        icon={<Target className="h-9 w-9" />}
        title="Análisis pendiente"
        description="Cuando tus documentos terminen de analizarse, aquí verás la guía de estudio por temas y el índice de relevancia de cada uno."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Guía de estudio */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-500" />
          <h2 className="font-semibold text-slate-900 dark:text-white">Guía de estudio generada por IA</h2>
        </div>
        {subject.summary ? (
          <Markdown
            content={subject.summary}
            className="text-sm leading-relaxed text-slate-600 dark:text-slate-300"
          />
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            La guía se está generando o aún no está disponible. Usa «Recalcular relevancia y guía» para regenerarla.
          </p>
        )}
      </Card>

      {/* Temas por relevancia */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-violet-500" />
          <h2 className="font-semibold text-slate-900 dark:text-white">
            Temas por relevancia estimada
          </h2>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          El índice 0-100 estima la prioridad de estudio según evidencias del material (frecuencia,
          repetición entre documentos, definiciones y fórmulas, énfasis y exámenes anteriores). No es
          una predicción comprobada del examen real.
        </p>
        {!topics || topics.length === 0 ? (
          <EmptyState title="Aún no hay temas detectados" description="Sube y analiza documentos para descubrirlos." />
        ) : (
          <div className="space-y-3">
            {topics.map((t) => (
              <TopicRow key={t.id} topic={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
