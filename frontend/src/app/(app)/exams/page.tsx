"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Play } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Attempt } from "@/lib/types";
import { Badge, Button, Card, EmptyState, LoadingBlock } from "@/components/ui";
import { cn, fmtDateTime, fmtDuration, scoreClass, statusLabel } from "@/lib/utils";

export default function ExamsPage() {
  const { data: attempts, isLoading } = useQuery({
    queryKey: ["attempts", "all"],
    queryFn: () => apiGet<Attempt[]>("/attempts"),
  });

  if (isLoading) return <LoadingBlock text="Cargando exámenes…" />;

  return (
    <div className="mx-auto max-w-5xl animate-fade-up space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Mis exámenes</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Historial completo de simulaciones y su calificación.
        </p>
      </div>

      {!attempts || attempts.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-9 w-9" />}
          title="Todavía no has realizado exámenes"
          description="Entra a una materia, genera preguntas y lanza tu primera simulación."
          action={
            <Link href="/subjects">
              <Button size="sm">Ir a mis materias</Button>
            </Link>
          }
        />
      ) : (
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          {attempts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800 dark:text-slate-100">{a.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                  <span>{a.subject_name}</span>
                  <span>·</span>
                  <span>{fmtDateTime(a.started_at)}</span>
                  <span>·</span>
                  <span>{a.mode === "practice" ? "Modo práctica" : "Modo examen"}</span>
                  {a.duration_sec != null && (
                    <>
                      <span>·</span>
                      <span>{fmtDuration(a.duration_sec)}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-4">
                {a.status === "finished" ? (
                  <span className={cn("text-xl font-bold", scoreClass(a.score))}>
                    {a.score != null ? `${a.score}` : "—"}
                    <span className="text-xs font-normal text-slate-400">/100</span>
                  </span>
                ) : (
                  <Badge tone="amber">{statusLabel(a.status)}</Badge>
                )}
                <Link href={a.status === "finished" ? `/exams/${a.id}/results` : `/exams/${a.id}`}>
                  <Button variant={a.status === "finished" ? "outline" : "primary"} size="sm">
                    {a.status === "finished" ? (
                      "Ver resultados"
                    ) : (
                      <>
                        <Play className="h-3.5 w-3.5" /> Continuar
                      </>
                    )}
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
