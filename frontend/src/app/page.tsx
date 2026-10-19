import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  Brain,
  ClipboardList,
  FileText,
  GraduationCap,
  ListChecks,
  MessageCircle,
  ScanText,
  Sparkles,
  Target,
  Timer,
} from "lucide-react";

const FEATURES = [
  {
    icon: FileText,
    title: "Sube tu material",
    text: "PDF, Word, PowerPoint, TXT e imágenes con OCR. Varios documentos por materia, analizados en conjunto.",
  },
  {
    icon: Brain,
    title: "Análisis con IA",
    text: "La IA detecta temas, definiciones, fórmulas y procedimientos, y relaciona conceptos entre documentos.",
  },
  {
    icon: ListChecks,
    title: "Preguntas reales",
    text: "Genera 7 tipos de preguntas (selección múltiple, V/F, abiertas, completar, relacionar, problemas y análisis) solo con el contenido de tus archivos.",
  },
  {
    icon: Target,
    title: "Relevancia estimada",
    text: "Cada tema y pregunta recibe un índice 0-100 explicado con evidencias: frecuencia, repetición, estructura y exámenes anteriores.",
  },
  {
    icon: Timer,
    title: "Simulador de examen",
    text: "Temporizador, navegación, marcar para revisar, corrección automática y calificación sobre 100.",
  },
  {
    icon: MessageCircle,
    title: "Tutor virtual",
    text: "Pregúntale sobre tus documentos: te explica, da ejemplos y te dice cuándo algo no está respaldado por tu material.",
  },
  {
    icon: BarChart3,
    title: "Estadísticas y plan",
    text: "Temas dominados, temas a reforzar, evolución de tu rendimiento y un plan de estudio personalizado generado por IA.",
  },
];

const STEPS = [
  { n: "1", t: "Crea tu materia", d: "Organiza cada asignatura por separado." },
  { n: "2", t: "Sube documentos", d: "La IA extrae y analiza todo el contenido." },
  { n: "3", t: "Genera preguntas", d: "Configura cantidad, dificultad y tipos." },
  { n: "4", t: "Simula y mejora", d: "Practica, revisa tus errores y sigue tu plan." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <header className="ep-gradient relative overflow-hidden text-white">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-violet-500/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                <GraduationCap className="h-6 w-6" />
              </span>
              <span className="text-lg font-bold tracking-tight">ExamPredict AI</span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="rounded-xl px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10"
              >
                Iniciar sesión
              </Link>
              <Link
                href="/register"
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-violet-700 shadow-lg shadow-violet-900/30 transition hover:bg-violet-50"
              >
                Crear cuenta gratis
              </Link>
            </div>
          </div>

          <div className="mx-auto mt-20 max-w-3xl text-center">
            <span className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-medium backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              Tu material de estudio convertido en exámenes de práctica
            </span>
            <h1 className="mt-6 animate-fade-up text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Estudia con inteligencia.
              <br />
              <span className="bg-gradient-to-r from-violet-200 via-indigo-200 to-blue-200 bg-clip-text text-transparent">
                Prepárate con precisión.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl animate-fade-up text-base leading-relaxed text-white/80 sm:text-lg">
              Sube tus apuntes, libros y diapositivas. ExamPredict AI los analiza, genera preguntas
              basadas únicamente en tu material, estima qué temas son prioritarios y simula exámenes
              completos con corrección y retroalimentación.
            </p>
            <div className="mt-10 flex animate-fade-up flex-wrap items-center justify-center gap-4">
              <Link
                href="/register"
                className="rounded-2xl bg-white px-7 py-3.5 text-base font-semibold text-violet-700 shadow-xl shadow-violet-950/40 transition hover:-translate-y-0.5 hover:bg-violet-50"
              >
                Comenzar ahora
              </Link>
              <Link
                href="/login"
                className="rounded-2xl border border-white/25 px-7 py-3.5 text-base font-medium text-white backdrop-blur transition hover:bg-white/10"
              >
                Ya tengo cuenta
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Características */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">
            Todo lo que necesitas para preparar tus exámenes
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500 sm:text-base dark:text-slate-400">
            Sin resultados inventados: cada pregunta, calificación y estimación proviene del análisis
            real de tus documentos.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group animate-fade-up rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-violet-300 hover:shadow-lg hover:shadow-violet-500/10 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-violet-500/40"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 text-white shadow-md shadow-violet-600/30">
                  <Icon className="h-5.5 w-5.5" />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {f.text}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="border-t border-slate-200 bg-white/60 py-20 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">
              Cómo funciona
            </h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/70">
                <span className="ep-gradient flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white">
                  {s.n}
                </span>
                <h3 className="mt-4 font-semibold text-slate-900 dark:text-white">{s.t}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Aviso honesto + CTA */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="ep-gradient relative overflow-hidden rounded-3xl px-8 py-14 text-center text-white">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-violet-400/25 blur-3xl" />
          <ScanText className="mx-auto h-10 w-10 text-violet-200" />
          <h2 className="mt-4 text-2xl font-bold sm:text-3xl">Empieza gratis en menos de un minuto</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-white/75">
            El índice de relevancia es una estimación de prioridad basada en tu material — no una
            predicción comprobada del examen real. Tú decides qué estudiar con mejores evidencias.
          </p>
          <Link
            href="/register"
            className="mt-8 inline-block rounded-2xl bg-white px-8 py-3.5 font-semibold text-violet-700 shadow-xl shadow-violet-950/40 transition hover:-translate-y-0.5 hover:bg-violet-50"
          >
            Crear mi cuenta
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
        ExamPredict AI — Plataforma educativa de preparación de exámenes con inteligencia artificial.
      </footer>
    </div>
  );
}
