// Tipos compartidos que reflejan los esquemas de la API del backend

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export interface Subject {
  id: string;
  name: string;
  description: string;
  color: string;
  analysis_status: "pending" | "partial" | "ready";
  summary: string | null;
  created_at: string;
  updated_at: string;
  documents_count: number;
  documents_ready: number;
  documents_processing: number;
  topics_count: number;
  attempts_count: number;
}

export interface DocumentItem {
  id: string;
  subject_id: string;
  original_name: string;
  filetype: string;
  kind: "material" | "exam" | "notes";
  size_bytes: number;
  status: "uploaded" | "processing" | "ready" | "error";
  stage: string;
  progress: number;
  error: string | null;
  page_count: number;
  word_count: number;
  ocr_used: boolean;
  rag_mode: "semantic" | "keyword" | null;
  ai_summary: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface UploadResult {
  uploaded: DocumentItem[];
  rejected: { name: string; reason: string }[];
}

export interface Topic {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  importance: number;
  reasons: string[];
  scores: Record<string, number>;
  mention_count: number;
  document_ids: string[];
  llm_hint: number | null;
  updated_at: string;
}

export type QType = "mc" | "tf" | "open" | "fill" | "match" | "problem" | "analysis";
export type Difficulty = "facil" | "intermedia" | "dificil";

export interface SourceRef {
  quote: string;
  document_id: string | null;
  document_name: string | null;
  page: number | null;
  section: string | null;
  verified: boolean;
  llm_page?: number | null;
}

export interface Reveal {
  correct_answer: Record<string, unknown>;
  explanation: string;
  is_correct: boolean | null;
  points_awarded: number | null;
  feedback: string | null;
}

export interface QuestionPreview {
  id: string;
  qtype: QType;
  difficulty: Difficulty;
  topic: string;
  statement: string;
  options: string[];
  pairs: { left: string; right: string }[];
  relevance: number;
  relevance_reasons: string[];
  source_refs: SourceRef[];
  points: number;
  reveal?: Reveal;
}

export interface QuestionSetItem {
  id: string;
  subject_id: string;
  status: "generating" | "ready" | "error";
  error: string | null;
  config: {
    count?: number;
    difficulty?: Difficulty | null;
    types?: QType[];
    topics?: string[];
    generated?: number;
    requested?: number;
    note?: string;
  };
  created_at: string;
  questions_count: number;
}

export interface QuestionSet extends Omit<QuestionSetItem, "questions_count"> {
  questions: QuestionPreview[];
}

export interface Attempt {
  id: string;
  subject_id: string;
  subject_name: string;
  set_id: string;
  title: string;
  mode: "exam" | "practice";
  status: "in_progress" | "grading" | "finished";
  time_limit_sec: number;
  started_at: string;
  finished_at: string | null;
  score: number | null;
  duration_sec: number | null;
  questions_count: number;
  answered_count: number;
}

export interface AttemptState {
  attempt: Attempt;
  remaining_sec: number | null;
  questions: QuestionPreview[];
  answers: Record<string, { answer: Record<string, unknown> | null; flagged: boolean }>;
}

export interface TopicStat {
  topic: string;
  answered: number;
  correct: number;
  accuracy: number;
  relevance: number | null;
}

export interface ResultQuestion extends QuestionPreview {
  correct_answer: Record<string, unknown>;
  explanation: string;
  answer: Record<string, unknown> | null;
  flagged: boolean;
  is_correct: boolean | null;
  points_awarded: number | null;
  feedback: string | null;
}

export interface Results {
  attempt: Attempt;
  questions: ResultQuestion[];
  by_topic: TopicStat[];
  graded_count: number;
  ungraded_count: number;
}

export interface ChatSource {
  document_id: string;
  document_name: string;
  page: number | null;
  section: string | null;
  excerpt: string;
  score: number;
}

export interface ChatSession {
  id: string;
  subject_id: string;
  title: string;
  created_at: string;
  message_count: number;
  last_message: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[];
  grounded: boolean | null;
  created_at: string;
}

export interface ChatSessionDetail {
  id: string;
  subject_id: string;
  subject_name: string;
  title: string;
  created_at: string;
  messages: ChatMessage[];
}

export interface SendMessageResponse {
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  rag_mode: "semantic" | "keyword" | null;
  suggested_questions: string[];
}

export interface SubjectStats {
  subject_id: string;
  attempts_count: number;
  avg_score: number | null;
  last_score: number | null;
  best_score: number | null;
  score_series: { attempt_id: string; title: string; date: string | null; score: number | null; mode: string }[];
  topics: TopicStat[];
}

export interface DashboardData {
  subjects: {
    id: string;
    name: string;
    color: string;
    analysis_status: string;
    documents_count: number;
    documents_ready: number;
    documents_processing: number;
    topics_count: number;
    attempts_count: number;
    last_score: number | null;
    created_at: string | null;
  }[];
  totals: {
    subjects: number;
    documents: number;
    documents_ready: number;
    question_sets: number;
    attempts: number;
    avg_score: number | null;
    last_score: number | null;
  };
  priority_topics: { topic: string; subject_id: string; subject_name: string; importance: number }[];
  recent_attempts: {
    id: string;
    title: string;
    subject_name: string;
    mode: string;
    status: string;
    score: number | null;
    started_at: string | null;
  }[];
  score_series: { date: string | null; score: number | null; title: string }[];
}

export interface StudyPlanBlock {
  topic: string;
  priority: "alta" | "media" | "baja";
  reason: string;
  actions: string[];
  estimated_minutes: number;
}

export interface StudyPlan {
  id: string;
  subject_id: string;
  attempt_id: string | null;
  content: {
    headline: string;
    blocks: StudyPlanBlock[];
    session_plan: { day_label: string; focus: string; activities: string[] }[];
    general_tips: string[];
  };
  created_at: string;
}

export interface AiStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  embeddings: boolean;
  detail: string | null;
}
