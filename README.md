# ExamPredict AI 🎓

Plataforma de estudio con IA para estudiantes universitarios: sube tus apuntes (PDF, Word, PowerPoint, TXT o fotos), la IA los analiza, extrae los temas importantes, genera exámenes de práctica con preguntas reales basadas en **tus** documentos, simula exámenes con temporizador y corrige tus respuestas — todo con estadísticas de progreso y un tutor que responde citando tus propios apuntes.

> **Importante sobre la "predicción":** ExamPredict AI **no adivina exámenes reales**. Lo que hace es calcular una estimación de relevancia (0–100) de cada tema y cada pregunta basándose en señales objetivas del material (frecuencia, definiciones, repetición entre documentos, objetivos de aprendizaje, énfasis, exámenes anteriores que subas, etc.) y te explica **por qué** cada pregunta es relevante. Úsalo como guía de estudio priorizada, no como bola de cristal.

---

## ✨ ¿Qué hace?

| Área | Funcionalidades |
|---|---|
| **Documentos** | Subida múltiple con barra de progreso · PDF, DOCX, PPTX, TXT, JPG/PNG · OCR de páginas escaneadas e imágenes con IA · detección de títulos, definiciones, conceptos y fórmulas · enlazado de conceptos entre documentos · resumen por tema |
| **Preguntas** | Opción múltiple (4 opciones) · verdadero/falso · desarrollo · completar huecos · emparejar columnas · problemas prácticos · razonamiento/análisis · cada pregunta incluye respuesta correcta, explicación y **referencia a la fuente** (documento / sección / página) |
| **Configuración de examen** | Nº de preguntas (10/20/30/50/personalizado) · dificultad · tipo de evaluación · temas específicos · límite de tiempo |
| **Relevancia 0–100** | Por factor: frecuencia, cobertura temática, estructura (definiciones/fórmulas), títulos, criterio de la IA y coincidencia con exámenes anteriores que hayas subido · con **explicación legible** de por qué |
| **Simulador** | Temporizador con finalización automática · orden aleatorio o por relevancia · navegación entre preguntas · marcar para revisar · guardado en el servidor · modo práctica (revela la respuesta al instante) |
| **Calificación** | Autocalificación de preguntas objetivas · corrección de desarrollo por IA con rúbrica y retroalimentación · nota sobre /100 · revisión detallada de cada pregunta con tu respuesta vs. la correcta |
| **Estadísticas** | Nota, % de acierto y tiempo por examen · histórico · gráfico de evolución · dominio por tema (aciertos + relevancia) · temas fuertes/débiles · **plan de estudio personalizado** generado por IA según tus errores reales |
| **Tutor IA** | Chat anclado a tus documentos (RAG) · te avisa explícitamente cuando una respuesta **no** está respaldada por tus apuntes · sesiones por materia |
| **Cuenta** | Registro/login con cookie segura httpOnly · edición de perfil · cambio de contraseña · eliminación total de cuenta y archivos |

---

## 🧱 Arquitectura

```
┌─────────────────────┐      rewrites /api/*      ┌──────────────────────┐
│  Frontend (Next.js) │ ────────────────────────► │  Backend (FastAPI)   │
│  React + Tailwind   │      http://:3000          │  http://127.0.0.1:8000│
│  puerto 3000        │ ◄──────────────────────── │                      │
└─────────────────────┘    cookie httpOnly ep_token└──────────┬───────────┘
                                                             │
                          ┌──────────────────────────────────┼──────────────────┐
                          ▼                                  ▼                  ▼
                 ┌────────────────┐                ┌──────────────────┐  ┌────────────┐
                 │  PostgreSQL    │                │  Proveedor IA    │  │ storage/   │
                 │  (datos)       │                │  Gemini (API)    │  │ (archivos  │
                 └────────────────┘                │ o compatible     │  │  privados) │
                                                   │ OpenAI           │  └────────────┘
                                                   └──────────────────┘
```

- **Frontend:** Next.js 15 (App Router) + React 19 + Tailwind CSS v4 + TanStack Query + Recharts + lucide-react. Tema claro/oscuro, interfaz en español, responsive.
- **Backend:** Python + FastAPI + SQLAlchemy 2 + PostgreSQL (psycopg 3). Autenticación JWT en cookie httpOnly. Todo el trabajo pesado de IA corre en segundo plano con progreso consultable.
- **IA:** capa intercambiable por variable de entorno:
  - `AI_PROVIDER=gemini` → Google Gemini (recomendado, tiene capa gratuita).
  - `AI_PROVIDER=openai_compat` → cualquier API compatible con OpenAI (OpenAI, Groq, DeepSeek, Ollama…).
  - `AI_PROVIDER=none` → sin IA: los documentos se suben y extraen texto igualmente, pero el análisis con IA, la generación de preguntas, la corrección de desarrollo y el tutor devuelven un aviso claro en español (nunca datos falsos).
- **Búsqueda semántica (RAG):** los fragmentos de tus documentos se guardan con embeddings (JSON) y la búsqueda usa similitud coseno en NumPy. Si el proveedor no ofrece embeddings, cae automáticamente a búsqueda por palabras clave (estilo BM25 ligero). El tutor siempre cita los fragmentos usados.
- **OCR:** las páginas escaneadas de PDF y las imágenes (JPG/PNG) se procesan con el modelo de visión del proveedor de IA.
- **Sin Docker.** Backend en `127.0.0.1:8000`, frontend en `:3000`; Next hace *proxy* de `/api/*` al backend, así que todo es mismo origen (sin problemas de CORS).

---

## ✅ Requisitos previos

| Herramienta | Versión | Notas |
|---|---|---|
| Python | 3.11 o superior | En Windows usa el lanzador `py -3` |
| Node.js | 18 o superior | Incluye npm |
| PostgreSQL | 14 o superior | Servicio corriendo en `127.0.0.1:5432` |
| API key de Gemini | gratis | https://aistudio.google.com/apikey (opcional para arrancar, necesaria para las funciones de IA) |

---

## 🚀 Instalación paso a paso (Windows)

### 1. Crear la base de datos

Abre una terminal y conéctate como superusuario de PostgreSQL (te pedirá la contraseña que pusiste al instalar Postgres):

```powershell
psql -U postgres -h 127.0.0.1
```

Dentro de psql, crea el usuario de la aplicación y la base de datos (cambia `TU_PASSWORD_SEGURA` por una contraseña que inventes; la app la usará para conectarse):

```sql
CREATE ROLE exampredict_app WITH LOGIN PASSWORD 'TU_PASSWORD_SEGURA';
CREATE DATABASE exampredict OWNER exampredict_app;
\q
```

> Las tablas se crean **solas** la primera vez que arranca el backend. El superusuario `postgres` no se usa en ningún momento por la aplicación.

### 2. Configurar y arrancar el backend

```powershell
cd backend

# 1) Entorno virtual e instalación de dependencias
py -3 -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 2) Archivo de configuración
Copy-Item .env.example .env
```

Edita `backend\.env` con un editor y completa **al menos**:

```ini
# La contraseña que definiste en el paso 1
DATABASE_URL=postgresql+psycopg://exampredict_app:TU_PASSWORD_SEGURA@127.0.0.1:5432/exampredict

# Clave secreta del JWT — genera una con:
#   py -3 -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET=pega-aqui-la-clave-generada

# Tu API key de Gemini (https://aistudio.google.com/apikey)
GEMINI_API_KEY=tu_api_key
```

Arranca el servidor:

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Comprueba que responde: abre http://127.0.0.1:8000/api/health → `{"status":"ok", ...}`.
La documentación interactiva de la API está en http://127.0.0.1:8000/docs.

### 3. Configurar y arrancar el frontend

En **otra** terminal:

```powershell
cd frontend
npm install
npm run dev
```

Abre http://localhost:3000 — verás la página de inicio. Crea tu cuenta en **Registrarse** y ya puedes usar la plataforma.

> Las peticiones del navegador van a `localhost:3000/api/*` y Next las reenvía al backend automáticamente (`next.config.ts`). No hace falta configurar CORS ni tocar nada más.

### 4. (Primera vez) Verificar que la IA está activa

Dentro de la app, entra a **Mi perfil → Estado de la IA**. Debe aparecer “Configurada” con proveedor y modelo. Si aparece un aviso, revisa que `GEMINI_API_KEY` esté bien pegada en `backend\.env` y **reinicia el backend**.

---

## 🧭 Uso típico

1. **Crea una materia** en *Materias → Nueva materia* (p. ej. “Bases de Datos”).
2. **Sube tus documentos** en la pestaña *Documentos*: apuntes, diapositivas, PDFs. Verás el progreso del análisis (extracción → temas → embeddings → resumen). Si tienes exámenes de años anteriores, súbelos marcándolos como **Examen** — se usan como señal extra de relevancia.
3. Revisa la pestaña **Guía**: temas ordenados por relevancia 0–100 con la explicación de por qué, definiciones, fórmulas y referencias cruzadas entre documentos.
4. Ve a **Exámenes → Nuevo examen**: elige nº de preguntas, dificultad, tipos, temas concretos, tiempo y orden (por relevancia o aleatorio).
5. Haz el **simulador**: temporizador, navegación, marcar para revisar; al terminar se autocorrigen los objetivos y la IA corrige los desarrollos con rúbrica.
6. Mira tus **resultados**: nota /100, revisión pregunta a pregunta con tu respuesta vs. la correcta y la fuente, y genera un **plan de estudio** sobre tus temas débiles.
7. Pregunta al **Tutor** lo que quieras sobre la materia; te responderá citando tus documentos o avisándote si algo no está en ellos.
8. Sigue tu progreso en **Estadísticas**: evolución, dominio por tema, histórico.

---

## 🗂 Estructura del proyecto

```
proyecto_10/
├── backend/                  # API FastAPI
│   ├── app/
│   │   ├── ai/               # proveedor Gemini / OpenAI-compatible + prompts
│   │   ├── routers/          # auth, subjects, documents, questions, exams, tutor, stats, study_plans
│   │   ├── services/         # extracción, procesamiento, relevancia, generación, calificación, tutor RAG
│   │   ├── models.py         # tablas SQLAlchemy
│   │   ├── schemas.py        # esquemas Pydantic
│   │   └── main.py           # aplicación FastAPI
│   ├── storage/              # archivos subidos (privado, por usuario; se ignora en git)
│   ├── requirements.txt
│   └── .env.example
├── frontend/                 # Next.js + React + Tailwind
│   └── src/
│       ├── app/              # páginas: landing, login, dashboard, materias, exámenes,
│       │                     # simulador, resultados, tutor, estadísticas, perfil
│       ├── components/       # UI, gráficos, shell de la app, pestañas de materia
│       └── lib/              # cliente API, tipos, auth, tema, utilidades
├── test_data/                # documentos de ejemplo (apuntes + PDF) y prueba de humo
└── README.md
```

---

## 🔐 Seguridad y privacidad

- **Autenticación:** registro/login con contraseñas hasheadas (bcrypt) y JWT firmado en cookie `httpOnly` + `SameSite=Lax`. El token nunca es accesible desde JavaScript.
- **Aislamiento de datos:** cada usuario solo puede ver/modificar sus propias materias, documentos, exámenes y chats; todas las consultas filtran por usuario en el servidor.
- **Archivos privados:** se guardan en `backend/storage/` con nombres aleatorios, fuera de cualquier carpeta pública, y solo se sirven a través de endpoints autenticados del propietario.
- **Por usuario**: eliminar la cuenta (Mi perfil → Zona de peligro) borra de la base de datos y del disco todo lo tuyo.
- **Validación de subidas:** extensiones permitidas, límite de tamaño (50 MB por archivo) y de cantidad (60 documentos por materia) configurables en `.env`.
- **La API key de IA vive solo en el servidor** (`backend/.env`); jamás se envía al navegador ni se incluye en git.

---

## 🛠 Solución de problemas

| Síntoma | Causa / Solución |
|---|---|
| `Falta la API key de Gemini…` al analizar o generar | Completa `GEMINI_API_KEY` en `backend\.env` y **reinicia** el backend. Luego usa “Reintentar” en el documento. |
| Error de conexión a PostgreSQL (`connection refused`) | El servicio de PostgreSQL no está corriendo, o `DATABASE_URL` tiene mal la contraseña. Verifica con `psql -U exampredict_app -h 127.0.0.1 -d exampredict`. |
| Puerto 8000 o 3000 ocupado | Cambia el puerto en el comando (`--port 8001`) y ajusta el rewrite en `frontend/next.config.ts`; o cierra el proceso que lo ocupa. |
| El OCR de una imagen no devuelve texto | El OCR usa el modelo de visión de la IA: necesita la API key configurada. |
| “Esta respuesta no está respaldada por tus documentos” en el tutor | Es intencional: la plataforma no inventa — te avisa cuando no encuentra base en tus apuntes. |
| Los documentos quedaron en estado “error” por la API key | Con la IA ya configurada, pulsa **Reintentar** en cada documento. |

---

## 🧪 Datos de ejemplo

La carpeta `test_data/` contiene apuntes de ejemplo (`bases_datos.txt`, `normalizacion.pdf`) y `smoke_test.py`, un script que prueba el flujo completo contra la API (registro, materias, subida, generación, intento, calificación, tutor). Para ejecutarlo con el backend encendido:

```powershell
cd test_data
..\backend\venv\Scripts\python.exe smoke_test.py
```

---

## 🗺 Por dónde seguir

Ideas naturales para ampliar el MVP: generación de exámenes en segundo plano con notificaciones, exportación a PDF de exámenes y planes, repaso espaciado (SM-2) sobre las preguntas falladas, y estadísticas comparativas entre materias. El código está organizado por capas (`routers → services → ai`) para que añadir cualquiera de estas piezas sea un cambio local.
