"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, FileText, ListChecks, RefreshCw, Sparkles } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { Subject } from "@/lib/types";
import { Alert, Badge, Button, LoadingBlock } from "@/components/ui";
import { statusLabel } from "@/lib/utils";
import { DocumentsTab } from "@/components/subject/documents-tab";
import { GuideTab } from "@/components/subject/guide-tab";
import { ExamsTab } from "@/components/subject/exams-tab";

type Tab = "documents" | "guide" | "exams";

export default function SubjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<Tab>("documents");
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeMsg, setReanalyzeMsg] = useState<string | null>(null);

  const { data: subject, isLoading, refetch } = useQuery({
    queryKey: ["subject", id],
    queryFn: () => apiGet<Subject>(`/subjects/${id}`),
    refetchInterval: (query) =>
      (query.state.data?.documents_processing ?? 0) > 0 ? 3000 : false,
  });

  if (isLoading) return <LoadingBlock text="Cargando materia…" />;
  if (!subject)
    return (
      <div className="mx-auto max-w-3xl">
        <Alert tone="rose" title="Materia no encontrada">
          Vuelve a <Link href="/subjects" className="underline">tus asignaturas</Link>.
        </Alert>
      </div>
    );

  const tabs: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: "documents", label: "Documentos", icon: FileText, count: subject.documents_count },
    { key: "guide", label: "Guía y temas", icon: ListChecks, count: subject.topics_count },
    { key: "exams", label: "Preguntas y exámenes", icon: Sparkles },
  ];

  const reanalyze = async () => {
    setReanalyzing(true);
    setReanalyzeMsg(null);
    try {
      await apiPost(`/subjects/${id}/reanalyze`);
      setReanalyzeMsg("Recálculo iniciado. Los temas y la guía se actualizarán en unos segundos.");
      setTimeout(() => {
        refetch();
        setReanalyzeMsg(null);
      }, 4000);
    } catch (err) {
      setReanalyzeMsg(err instanceof Error ? err.message : "No se pudo iniciar el recálculo.");
    } finally {
      setReanalyzing(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl animate-fade-up space-y-6">
      <Link
        href="/subjects"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-400"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a asignaturas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="ep-gradient flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg shadow-violet-600/30">
            <BookOpen className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{subject.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {subject.analysis_status === "ready" ? (
                <Badge tone="green">Análisis completo</Badge>
              ) : subject.analysis_status === "partial" ? (
                <Badge tone="amber">Análisis parcial</Badge>
              ) : (
                <Badge tone="slate">{statusLabel(subject.analysis_status)}</Badge>
              )}
              <span className="text-xs text-slate-400">
                {subject.documents_ready}/{subject.documents_count} documentos listos · {subject.topics_count} temas ·{" "}
                {subject.attempts_count} exámenes
              </span>
            </div>
          </div>
        </div>
        {subject.documents_ready > 0 && (
          <Button variant="outline" size="sm" onClick={reanalyze} loading={reanalyzing}>
            <RefreshCw className="h-4 w-4" />
            Recalcular relevancia y guía
          </Button>
        )}
      </div>

      {reanalyzeMsg && <Alert tone="violet">{reanalyzeMsg}</Alert>}

      {subject.description && (
        <p className="text-sm text-slate-500 dark:text-slate-400">{subject.description}</p>
      )}

      {/* Pestañas */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 dark:border-slate-800 dark:bg-slate-900/70">
        {tabs.map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition ${
              tab === key
                ? "bg-violet-600 text-white shadow-sm shadow-violet-600/30"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {count != null && count > 0 && (
              <span
                className={`rounded-full px-1.5 text-xs ${
                  tab === key ? "bg-white/20" : "bg-slate-200 dark:bg-slate-700"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "documents" && <DocumentsTab subject={subject} />}
      {tab === "guide" && <GuideTab subject={subject} />}
      {tab === "exams" && <ExamsTab subject={subject} />}
    </div>
  );
}
