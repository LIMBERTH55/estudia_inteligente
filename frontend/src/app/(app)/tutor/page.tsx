"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  FileText,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { ChatSession, ChatSessionDetail, SendMessageResponse, Subject } from "@/lib/types";
import { Badge, Button, Card, EmptyState, LoadingBlock, Select, Textarea } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { cn, fmtDateTime } from "@/lib/utils";

export default function TutorPage() {
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [subjectToCreate, setSubjectToCreate] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [suggested, setSuggested] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: subjects } = useQuery({
    queryKey: ["subjects"],
    queryFn: () => apiGet<Subject[]>("/subjects"),
  });

  const { data: sessions, isLoading: loadingSessions } = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: () => apiGet<ChatSession[]>("/tutor/sessions"),
  });

  const { data: session, isLoading: loadingSession } = useQuery({
    queryKey: ["chat-session", selectedSession],
    queryFn: () => apiGet<ChatSessionDetail>(`/tutor/sessions/${selectedSession}`),
    enabled: !!selectedSession,
  });

  const createSession = useMutation({
    mutationFn: (subjectId: string) => apiPost<ChatSession>("/tutor/sessions", { subject_id: subjectId }),
    onSuccess: (s) => {
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
      setSelectedSession(s.id);
      setSuggested([]);
    },
  });

  const deleteSession = useMutation({
    mutationFn: (id: string) => apiDelete(`/tutor/sessions/${id}`),
    onSuccess: (_r, id) => {
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
      if (selectedSession === id) setSelectedSession(null);
    },
  });

  const sendMessage = useMutation({
    mutationFn: (content: string) =>
      apiPost<SendMessageResponse>(`/tutor/sessions/${selectedSession}/messages`, { content }),
    onSuccess: (res) => {
      setDraft("");
      setSuggested(res.suggested_questions ?? []);
      queryClient.invalidateQueries({ queryKey: ["chat-session", selectedSession] });
      queryClient.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages.length, sendMessage.isPending]);

  const readySubjects = (subjects ?? []).filter((s) => s.documents_ready > 0);

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Tutor virtual</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Pregúntale sobre tu material: explica temas, da ejemplos y advierte cuando algo no está
          respaldado por tus documentos.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* Sesiones */}
        <div className="space-y-4">
          <Card className="p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Nueva conversación
            </p>
            {readySubjects.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Necesitas al menos una materia con documentos analizados.
              </p>
            ) : (
              <div className="space-y-2.5">
                <Select value={subjectToCreate} onChange={(e) => setSubjectToCreate(e.target.value)}>
                  <option value="">Elige una materia…</option>
                  {readySubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                <Button
                  className="w-full"
                  size="sm"
                  disabled={!subjectToCreate}
                  loading={createSession.isPending}
                  onClick={() => createSession.mutate(subjectToCreate)}
                >
                  <Plus className="h-4 w-4" /> Crear conversación
                </Button>
              </div>
            )}
          </Card>

          <Card className="max-h-[420px] overflow-y-auto p-2">
            {loadingSessions ? (
              <LoadingBlock text="Cargando…" />
            ) : !sessions || sessions.length === 0 ? (
              <p className="p-4 text-xs text-slate-500 dark:text-slate-400">
                Aún no tienes conversaciones con el tutor.
              </p>
            ) : (
              sessions.map((s) => {
                const subject = (subjects ?? []).find((x) => x.id === s.subject_id);
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "group flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 transition",
                      selectedSession === s.id
                        ? "bg-violet-600 text-white"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800"
                    )}
                    onClick={() => {
                      setSelectedSession(s.id);
                      setSuggested([]);
                    }}
                  >
                    <MessageCircle className="h-4 w-4 shrink-0 opacity-70" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.title}</p>
                      <p
                        className={cn(
                          "truncate text-xs",
                          selectedSession === s.id ? "text-white/70" : "text-slate-400"
                        )}
                      >
                        {subject?.name} · {s.message_count} mensajes
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("¿Eliminar esta conversación?")) deleteSession.mutate(s.id);
                      }}
                      className={cn(
                        "rounded-lg p-1.5 opacity-0 transition group-hover:opacity-100",
                        selectedSession === s.id ? "hover:bg-white/20" : "hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
                      )}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </Card>
        </div>

        {/* Chat */}
        <Card className="flex min-h-[560px] flex-col">
          {!selectedSession ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <EmptyState
                icon={<Sparkles className="h-9 w-9" />}
                title="Elige o crea una conversación"
                description="El tutor responde usando exclusivamente el contenido de los documentos de la materia seleccionada."
              />
            </div>
          ) : loadingSession || !session ? (
            <div className="flex flex-1 items-center justify-center">
              <LoadingBlock text="Cargando conversación…" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {session.title}
                  </p>
                  <p className="text-xs text-slate-400">
                    <BookOpen className="mr-1 inline h-3 w-3" />
                    {session.subject_name}
                  </p>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                {session.messages.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Hazle tu primera pregunta al tutor, por ejemplo:
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {[
                        "Explícame el tema principal de forma sencilla",
                        "¿Qué temas debería estudiar primero?",
                        "Dame un ejemplo distinto de lo que expliqué",
                      ].map((s) => (
                        <button
                          key={s}
                          onClick={() => setDraft(s)}
                          className="rounded-full border border-slate-200 px-3.5 py-1.5 text-xs text-slate-600 transition hover:border-violet-400 hover:text-violet-600 dark:border-slate-700 dark:text-slate-300"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {session.messages.map((m) => (
                  <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                        m.role === "user"
                          ? "rounded-br-md bg-violet-600 text-white"
                          : "rounded-bl-md border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200"
                      )}
                    >
                      {m.role === "assistant" ? (
                        <>
                          {m.grounded === false && (
                            <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                              ⚠ No está respaldado por completo en tu material
                            </p>
                          )}
                          <Markdown content={m.content} />
                          {m.sources.length > 0 && (
                            <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-2.5 dark:border-slate-700">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                Fuentes de tu material
                              </p>
                              {m.sources.slice(0, 3).map((s, i) => (
                                <div key={i} className="rounded-lg bg-white/70 px-2.5 py-1.5 text-xs dark:bg-slate-900/60">
                                  <p className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
                                    <FileText className="h-3 w-3" />
                                    {s.document_name}
                                    {s.page ? ` · pág. ${s.page}` : ""}
                                  </p>
                                  <p className="mt-0.5 line-clamp-2 italic text-slate-400">«{s.excerpt}»</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                      <p
                        className={cn(
                          "mt-1.5 text-[10px]",
                          m.role === "user" ? "text-white/60" : "text-slate-400"
                        )}
                      >
                        {fmtDateTime(m.created_at)}
                      </p>
                    </div>
                  </div>
                ))}

                {sendMessage.isPending && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
                      <span className="flex gap-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:0ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:120ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:240ms]" />
                      </span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {suggested.length > 0 && (
                <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
                  {suggested.map((s) => (
                    <button
                      key={s}
                      onClick={() => setDraft(s)}
                      className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs text-violet-700 transition hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-300"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div className="border-t border-slate-100 p-4 dark:border-slate-800">
                <div className="flex items-end gap-3">
                  <Textarea
                    rows={2}
                    placeholder="Escribe tu pregunta… (p. ej.: «explícame la normalización con un ejemplo»)"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && draft.trim() && !sendMessage.isPending) {
                        e.preventDefault();
                        sendMessage.mutate(draft.trim());
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    disabled={!draft.trim() || sendMessage.isPending}
                    loading={sendMessage.isPending}
                    onClick={() => sendMessage.mutate(draft.trim())}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                {sendMessage.isError && (
                  <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                    {sendMessage.error instanceof Error ? sendMessage.error.message : "Error al enviar."}
                  </p>
                )}
                <p className="mt-2 text-[11px] text-slate-400">
                  El tutor solo usa tus documentos como fuente principal y te avisa cuando una respuesta
                  no está respaldada por ellos.
                </p>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
