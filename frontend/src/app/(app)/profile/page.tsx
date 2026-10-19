"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Brain, CheckCircle2, KeyRound, LogOut, Save, Trash2, User as UserIcon } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { AiStatus } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { Alert, Badge, Button, Card, Field, Input, Modal } from "@/components/ui";

export default function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const router = useRouter();

  const [name, setName] = useState(user?.name ?? "");
  const [profileMsg, setProfileMsg] = useState<{ tone: "green" | "rose"; text: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{ tone: "green" | "rose"; text: string } | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: aiStatus } = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => apiGet<AiStatus>("/ai/status"),
  });

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const updated = await apiPatch<{ id: string; email: string; name: string; created_at: string }>("/auth/me", { name });
      setUser(updated);
      setProfileMsg({ tone: "green", text: "Perfil actualizado correctamente." });
    } catch (err) {
      setProfileMsg({ tone: "rose", text: err instanceof Error ? err.message : "Error al guardar." });
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword.length < 8) {
      setPasswordMsg({ tone: "rose", text: "La nueva contraseña debe tener al menos 8 caracteres." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ tone: "rose", text: "Las contraseñas nuevas no coinciden." });
      return;
    }
    setSavingPassword(true);
    try {
      await apiPost("/auth/change-password", { current_password: currentPassword, new_password: newPassword });
      setPasswordMsg({ tone: "green", text: "Contraseña cambiada correctamente." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordMsg({ tone: "rose", text: err instanceof Error ? err.message : "Error al cambiar la contraseña." });
    } finally {
      setSavingPassword(false);
    }
  };

  const deleteAccount = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await apiDelete("/auth/me", { password: deletePassword });
      router.replace("/login");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "No se pudo eliminar la cuenta.");
    } finally {
      setDeleting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl animate-fade-up space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Mi perfil</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Gestiona tu cuenta, la seguridad y la configuración de la IA.
        </p>
      </div>

      {/* Datos del estudiante */}
      <Card className="p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="ep-gradient flex h-12 w-12 items-center justify-center rounded-2xl text-white">
            <UserIcon className="h-6 w-6" />
          </span>
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">{user.name}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
          </div>
        </div>
        <form onSubmit={saveProfile} className="space-y-4">
          <Field label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} minLength={2} required />
          </Field>
          {profileMsg && <Alert tone={profileMsg.tone}>{profileMsg.text}</Alert>}
          <Button type="submit" loading={savingProfile} disabled={name.trim().length < 2 || name === user.name}>
            <Save className="h-4 w-4" /> Guardar cambios
          </Button>
        </form>
      </Card>

      {/* Seguridad */}
      <Card className="p-6">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
          <KeyRound className="h-5 w-5 text-violet-500" /> Cambiar contraseña
        </h2>
        <form onSubmit={changePassword} className="space-y-4">
          <Field label="Contraseña actual">
            <Input type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nueva contraseña">
              <Input type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <Field label="Confirmar nueva contraseña">
              <Input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </Field>
          </div>
          {passwordMsg && <Alert tone={passwordMsg.tone}>{passwordMsg.text}</Alert>}
          <Button type="submit" variant="secondary" loading={savingPassword} disabled={!currentPassword || !newPassword}>
            Actualizar contraseña
          </Button>
        </form>
      </Card>

      {/* Estado de la IA */}
      <Card className="p-6">
        <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
          <Brain className="h-5 w-5 text-violet-500" /> Estado de la IA
        </h2>
        {!aiStatus ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Consultando…</p>
        ) : aiStatus.configured ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="green">
                <CheckCircle2 className="h-3 w-3" /> Configurada
              </Badge>
              <Badge tone="violet">Proveedor: {aiStatus.provider}</Badge>
              <Badge tone="blue">Modelo: {aiStatus.model}</Badge>
              <Badge tone={aiStatus.embeddings ? "green" : "amber"}>
                {aiStatus.embeddings ? "Búsqueda semántica activa" : "Solo búsqueda por palabras clave"}
              </Badge>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              El análisis de documentos, la generación de preguntas, la calificación y el tutor están
              activos. Tu API key solo vive en el servidor (backend/.env) y nunca se expone al navegador.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert tone="amber" title="La IA aún no está configurada">
              {aiStatus.detail ?? "Falta la API key del proveedor de IA."}
            </Alert>
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              <p className="font-medium">Cómo activarla (2 minutos):</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs">
                <li>
                  Obtén una API key gratuita en{" "}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-violet-600 underline dark:text-violet-400">
                    aistudio.google.com/apikey
                  </a>
                  .
                </li>
                <li>
                  Abre el archivo <code className="rounded bg-slate-200 px-1.5 py-0.5 dark:bg-slate-700">backend/.env</code> y pega la clave en{" "}
                  <code className="rounded bg-slate-200 px-1.5 py-0.5 dark:bg-slate-700">GEMINI_API_KEY=...</code>
                </li>
                <li>Reinicia el servidor del backend (Ctrl+C y vuelve a ejecutar el comando de arranque).</li>
              </ol>
            </div>
          </div>
        )}
      </Card>

      {/* Sesión y zona de peligro */}
      <Card className="p-6">
        <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Sesión</h2>
        <Button
          variant="outline"
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </Button>
      </Card>

      <Card className="border-rose-200 p-6 dark:border-rose-500/30">
        <h2 className="mb-2 flex items-center gap-2 font-semibold text-rose-600 dark:text-rose-400">
          <AlertTriangle className="h-5 w-5" /> Zona de peligro
        </h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Eliminar tu cuenta borra permanentemente tus materias, documentos (incluidos los archivos
          almacenados), exámenes, conversaciones y planes de estudio. Esta acción no se puede deshacer.
        </p>
        <Button variant="danger" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="h-4 w-4" /> Eliminar mi cuenta y todos mis datos
        </Button>
      </Card>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Eliminar cuenta definitivamente"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={deleteAccount} loading={deleting} disabled={!deletePassword}>
              Eliminar todo
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="rose" title="Esta acción es irreversible">
            Se eliminarán todos tus datos y archivos del servidor.
          </Alert>
          <Field label="Confirma tu contraseña para continuar">
            <Input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} />
          </Field>
          {deleteError && <Alert tone="rose">{deleteError}</Alert>}
        </div>
      </Modal>
    </div>
  );
}
