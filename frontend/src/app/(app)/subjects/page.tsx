"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileText, ListChecks, Plus, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { Subject } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Field, Input, LoadingBlock, Modal, Textarea } from "@/components/ui";
import { fmtDate, statusLabel } from "@/lib/utils";

const COLORS = ["violet", "blue", "indigo", "emerald", "amber", "rose"] as const;

const colorClasses: Record<string, string> = {
  violet: "from-violet-600 to-indigo-700",
  blue: "from-blue-600 to-cyan-600",
  indigo: "from-indigo-600 to-blue-700",
  emerald: "from-emerald-600 to-teal-700",
  amber: "from-amber-500 to-orange-600",
  rose: "from-rose-500 to-pink-600",
};

export default function SubjectsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>("violet");
  const [error, setError] = useState<string | null>(null);

  const { data: subjects, isLoading } = useQuery({
    queryKey: ["subjects"],
    queryFn: () => apiGet<Subject[]>("/subjects"),
  });

  const createMutation = useMutation({
    mutationFn: () => apiPost<Subject>("/subjects", { name, description, color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setModalOpen(false);
      setName("");
      setDescription("");
      setColor("violet");
      setError(null);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error al crear la materia."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/subjects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  if (isLoading) return <LoadingBlock text="Cargando materias…" />;

  return (
    <div className="mx-auto max-w-6xl animate-fade-up space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Mis asignaturas</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Cada materia agrupa sus documentos, temas, preguntas y exámenes.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Nueva materia
        </Button>
      </div>

      {!subjects || subjects.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-9 w-9" />}
          title="Aún no tienes materias"
          description="Crea tu primera asignatura (por ejemplo «Bases de Datos») y sube los documentos de estudio."
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Crear mi primera materia
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => (
            <Card key={s.id} className="group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-violet-500/10">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/subjects/${s.id}`} className="flex items-center gap-3">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${
                      colorClasses[s.color] ?? colorClasses.violet
                    } text-white shadow-md`}
                  >
                    <BookOpen className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-semibold text-slate-900 group-hover:text-violet-600 dark:text-white dark:group-hover:text-violet-400">
                      {s.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-400">Creada el {fmtDate(s.created_at)}</p>
                  </div>
                </Link>
                <button
                  onClick={() => {
                    if (confirm(`¿Eliminar la materia «${s.name}» y todos sus datos?`)) {
                      deleteMutation.mutate(s.id);
                    }
                  }}
                  className="rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
                  title="Eliminar materia"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {s.description && (
                <p className="mt-3 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                  {s.description}
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone="violet">
                  <FileText className="h-3 w-3" /> {s.documents_ready}/{s.documents_count} docs
                </Badge>
                <Badge tone="blue">
                  <ListChecks className="h-3 w-3" /> {s.topics_count} temas
                </Badge>
                {s.analysis_status === "ready" ? (
                  <Badge tone="green">Lista para generar</Badge>
                ) : s.analysis_status === "partial" ? (
                  <Badge tone="amber">Análisis parcial</Badge>
                ) : (
                  <Badge tone="slate">{statusLabel(s.analysis_status)}</Badge>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                <span className="text-xs text-slate-400">
                  {s.documents_processing > 0
                    ? `${s.documents_processing} documento(s) procesándose…`
                    : `${s.attempts_count} examen(es) realizado(s)`}
                </span>
                <Link
                  href={`/subjects/${s.id}`}
                  className="text-sm font-medium text-violet-600 hover:underline dark:text-violet-400"
                >
                  Abrir →
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nueva materia"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              loading={createMutation.isPending}
              disabled={name.trim().length < 2}
            >
              Crear materia
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nombre de la materia">
            <Input
              autoFocus
              placeholder="Ej.: Bases de Datos, Anatomía, Cálculo II…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Descripción (opcional)">
            <Textarea
              placeholder="Ej.: Temario del primer parcial…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </Field>
          <Field label="Color">
            <div className="flex gap-2.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-9 w-9 rounded-xl bg-gradient-to-br ${colorClasses[c]} transition ${
                    color === c ? "ring-2 ring-violet-500 ring-offset-2 dark:ring-offset-slate-900" : "opacity-70 hover:opacity-100"
                  }`}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </Field>
          {error && (
            <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
