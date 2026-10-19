import clsx, { type ClassValue } from "clsx";
import type { Difficulty, QType } from "./types";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
};

export const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const fmtDuration = (seconds: number | null | undefined): string => {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m >= 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${m} min ${s.toString().padStart(2, "0")} s`;
};

export const fmtBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const QTYPE_LABELS: Record<QType, string> = {
  mc: "Selección múltiple",
  tf: "Verdadero o falso",
  open: "Pregunta abierta",
  fill: "Completar espacios",
  match: "Relacionar columnas",
  problem: "Problema práctico",
  analysis: "Razonamiento y análisis",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  facil: "Fácil",
  intermedia: "Intermedia",
  dificil: "Difícil",
};

export const DIFFICULTY_CLASSES: Record<Difficulty, string> = {
  facil: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  intermedia: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  dificil: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

export const statusLabel = (status: string): string =>
  ({
    uploaded: "En cola",
    processing: "Procesando",
    ready: "Listo",
    error: "Error",
    in_progress: "En curso",
    grading: "Calificando",
    finished: "Finalizado",
    generating: "Generando",
    pending: "Sin analizar",
    partial: "Análisis parcial",
  })[status] ?? status;

export const relevanceTextClass = (value: number): string => {
  if (value >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (value >= 60) return "text-violet-600 dark:text-violet-400";
  if (value >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-slate-500 dark:text-slate-400";
};

export const relevanceBarClass = (value: number): string => {
  if (value >= 80) return "bg-emerald-500";
  if (value >= 60) return "bg-violet-500";
  if (value >= 40) return "bg-amber-500";
  return "bg-slate-400";
};

export const scoreClass = (score: number | null | undefined): string => {
  if (score == null) return "text-slate-500";
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-violet-600 dark:text-violet-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
};
