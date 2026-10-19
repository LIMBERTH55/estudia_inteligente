// Cliente HTTP: todas las llamadas pasan por /api (proxy same-origin hacia FastAPI)

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...options,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (data && typeof data.detail === "string" && data.detail) ||
      (data && Array.isArray(data.detail) && data.detail[0]?.msg) ||
      `Error ${res.status}`;
    throw new ApiError(res.status, detail);
  }
  return data as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const apiGet = <T>(path: string) => request<T>(path);

export const apiPost = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", ...(body !== undefined ? json(body) : {}) });

export const apiPatch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PATCH", ...json(body) });

export const apiDelete = <T = void>(path: string, body?: unknown) =>
  request<T>(path, { method: "DELETE", ...(body !== undefined ? json(body) : {}) });

export const apiUpload = <T>(path: string, form: FormData) =>
  request<T>(path, { method: "POST", body: form });
