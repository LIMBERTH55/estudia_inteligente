"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileAudio,
  FileImage,
  FileText,
  FileType,
  FolderUp,
  Loader2,
  RefreshCw,
  ScanText,
  Trash2,
} from "lucide-react";
import { apiDelete, apiGet, apiPost, apiUpload } from "@/lib/api";
import type { DocumentItem, Subject, UploadResult } from "@/lib/types";
import { Alert, Badge, Button, Card, EmptyState, Progress, Select } from "@/components/ui";
import { cn, fmtBytes, fmtDateTime } from "@/lib/utils";

const FILE_ICONS: Record<string, React.ElementType> = {
  pdf: FileText,
  docx: FileType,
  pptx: FileType,
  txt: FileAudio,
  jpg: FileImage,
  jpeg: FileImage,
  png: FileImage,
};

const KIND_LABELS: Record<string, string> = {
  material: "Material de estudio",
  exam: "Examen anterior",
  notes: "Apuntes / otros",
};

function StatusBadge({ doc }: { doc: DocumentItem }) {
  if (doc.status === "ready")
    return (
      <Badge tone="green">
        <CheckCircle2 className="h-3 w-3" /> Listo
      </Badge>
    );
  if (doc.status === "error")
    return (
      <Badge tone="rose">
        <AlertTriangle className="h-3 w-3" /> Error
      </Badge>
    );
  if (doc.status === "processing" || doc.status === "uploaded")
    return (
      <Badge tone="amber">
        <Loader2 className="h-3 w-3 animate-spin" /> {doc.stage || "Procesando"}
      </Badge>
    );
  return <Badge tone="slate">{doc.status}</Badge>;
}

export function DocumentsTab({ subject }: { subject: Subject }) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("material");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ tone: "green" | "rose" | "amber"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["documents", subject.id],
    queryFn: () => apiGet<DocumentItem[]>(`/subjects/${subject.id}/documents`),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((d) => d.status === "uploaded" || d.status === "processing")
        ? 2500
        : false,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["documents", subject.id] });
    queryClient.invalidateQueries({ queryKey: ["subject", subject.id] });
    queryClient.invalidateQueries({ queryKey: ["subjects"] });
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    setUploadMsg(null);
    const form = new FormData();
    list.forEach((f) => form.append("files", f));
    form.append("kind", kind);
    try {
      const result = await apiUpload<UploadResult>(`/subjects/${subject.id}/documents`, form);
      if (result.uploaded.length > 0) {
        setUploadMsg({
          tone: "green",
          text: `${result.uploaded.length} archivo(s) subido(s). El análisis con IA comenzará automáticamente.`,
        });
      }
      if (result.rejected.length > 0) {
        setUploadMsg({
          tone: "rose",
          text: `No se pudieron subir: ${result.rejected.map((r) => `${r.name} (${r.reason})`).join("; ")}`,
        });
      }
      invalidate();
    } catch (err) {
      setUploadMsg({ tone: "rose", text: err instanceof Error ? err.message : "Error al subir archivos." });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const deleteDoc = useMutation({
    mutationFn: (id: string) => apiDelete(`/documents/${id}`),
    onSuccess: invalidate,
  });

  const reprocess = useMutation({
    mutationFn: (id: string) => apiPost(`/documents/${id}/reprocess`),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      {/* Zona de subida */}
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">Subir documentos</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              PDF, Word (.docx), PowerPoint (.pptx), TXT e imágenes JPG/PNG (OCR). Máximo
              50 MB por archivo.
            </p>
          </div>
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-auto">
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) uploadFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInput.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
            dragOver
              ? "border-violet-500 bg-violet-50 dark:bg-violet-500/10"
              : "border-slate-300 hover:border-violet-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Subiendo…</p>
            </>
          ) : (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400">
                <FolderUp className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Arrastra tus archivos aquí o haz clic para seleccionar
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Puedes subir varios documentos de la misma materia a la vez.
                </p>
              </div>
            </>
          )}
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".pdf,.docx,.pptx,.txt,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => e.target.files && uploadFiles(e.target.files)}
          />
        </div>

        {uploadMsg && (
          <div className="mt-4">
            <Alert tone={uploadMsg.tone}>{uploadMsg.text}</Alert>
          </div>
        )}
      </Card>

      {/* Lista de documentos */}
      {isLoading ? (
        <Card className="p-6">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando documentos…
          </div>
        </Card>
      ) : !docs || docs.length === 0 ? (
        <EmptyState
          icon={<ScanText className="h-9 w-9" />}
          title="Sin documentos todavía"
          description="Sube tus apuntes, diapositivas o capítulos del libro para que la IA los analice y detecte los temas importantes."
        />
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => {
            const Icon = FILE_ICONS[doc.filetype] ?? FileText;
            const processing = doc.status === "uploaded" || doc.status === "processing";
            return (
              <Card key={doc.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {doc.original_name}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                        <span>{fmtBytes(doc.size_bytes)}</span>
                        <span>·</span>
                        <span>{KIND_LABELS[doc.kind] ?? doc.kind}</span>
                        {doc.word_count > 0 && (
                          <>
                            <span>·</span>
                            <span>{doc.word_count.toLocaleString("es-ES")} palabras</span>
                          </>
                        )}
                        {doc.page_count > 0 && (
                          <>
                            <span>·</span>
                            <span>{doc.page_count} pág.</span>
                          </>
                        )}
                        {doc.ocr_used && (
                          <>
                            <span>·</span>
                            <span>OCR aplicado</span>
                          </>
                        )}
                        {doc.rag_mode === "keyword" && (
                          <>
                            <span>·</span>
                            <span className="text-amber-500" title="Sin embeddings: búsqueda por palabras clave">
                              búsqueda básica
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span>{fmtDateTime(doc.created_at)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <StatusBadge doc={doc} />
                    {doc.status === "ready" && (
                      <a
                        href={`/api/documents/${doc.id}/file`}
                        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-violet-600 dark:hover:bg-slate-800"
                        title="Descargar"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                    {doc.status === "error" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => reprocess.mutate(doc.id)}
                        loading={reprocess.isPending}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Reintentar
                      </Button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar «${doc.original_name}»?`)) deleteDoc.mutate(doc.id);
                      }}
                      className="rounded-lg p-2 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {processing && (
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>{doc.stage}</span>
                      <span>{doc.progress}%</span>
                    </div>
                    <Progress value={doc.progress} />
                  </div>
                )}

                {doc.error && (
                  <div className="mt-4">
                    <Alert tone="rose" title="No se pudo completar el análisis">
                      {doc.error}
                    </Alert>
                  </div>
                )}

                {doc.status === "ready" && doc.stage.startsWith("Análisis completado con avisos") && (
                  <div className="mt-3">
                    <Alert tone="amber">{doc.stage}</Alert>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
