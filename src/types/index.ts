// AI 직원
export interface Employee {
  id: string;
  name: string;
  role: string | null;
  site_url: string | null;
  created_at: string;
}

// 카테고리
export interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
}

// 생각 (분리수거)
export interface Thought {
  id: string;
  created_at: string;
  date: string;
  raw_input: string;
  category_id: string | null;
  title: string | null;
  summary: string | null;
  advice: string | null;
  is_reported: boolean;
  category?: Category;
}

// 대화
export interface Conversation {
  id: string;
  created_at: string;
  conversation_date: string | null;
  employee_id: string | null;
  source_url: string | null;
  title: string | null;
  content: string;
  summary: string | null;
  category_id: string | null;
  tags: string[] | null;
  is_reported: boolean;
  employee?: Employee;
  category?: Category;
}

// 일일 리포트
export interface DailyReport {
  id: string;
  report_date: string;
  content: string | null;
  created_at: string;
}

// --- V2 타입 ---

// 텔레그램 메시지
export interface TelegramMessage {
  id: string;
  telegram_message_id: number | null;
  chat_id: number;
  sender: string | null;
  role: "user" | "assistant";
  content: string;
  media_type: string | null;
  media_path: string | null;
  metadata: Record<string, unknown>;
  embedding_model: string | null;
  category_id: string | null;
  classification: MessageClassification | null;
  created_at: string;
  category?: Category;
}

// 분류 결과
export interface MessageClassification {
  category: string;
  title: string;
  summary: string;
  advice: string;
  entities: string[];
}

// 활동 로그
export interface ActivityLog {
  id: string;
  window_title: string;
  app_name: string | null;
  category: string | null;
  recorded_at: string;
}

// 시간별 집계
export interface HourlySummary {
  id: string;
  date: string;
  hour: number;
  summary: Record<string, unknown>;
  top_apps: Array<{ app: string; minutes: number }>;
  created_at: string;
}

// 할일
export interface Todo {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  priority: number;
  is_done: boolean;
  due_date: string | null;
  source: string;
  created_at: string;
  completed_at: string | null;
  category?: Category;
}

// Daily Report V2
export interface DailyReportV2 {
  id: string;
  report_date: string;
  content: string | null;
  time_grid: Record<string, unknown> | null;
  stats: Record<string, unknown> | null;
  created_at: string;
}

// 메시지 큐
export interface MessageQueue {
  id: string;
  chat_id: number;
  content: string;
  telegram_message_id: number | null;
  sender: string | null;
  media_type: string | null;
  metadata: Record<string, unknown>;
  status: "pending" | "processing" | "done" | "failed";
  error_message: string | null;
  retry_count: number;
  created_at: string;
  processed_at: string | null;
}

// --- API 요청/응답 타입 ---

export interface ThoughtRequest {
  input: string;
}

export interface ThoughtResultItem {
  id: string;
  category: string;
  title: string;
  summary: string;
  advice: string;
}

export interface ThoughtResponse {
  results: ThoughtResultItem[];
}

export interface ConversationRequest {
  employee: string;
  content: string;
  source_url?: string;
  conversation_date?: string;
}

export interface ConversationResponse {
  id: string;
  title: string;
  category: string;
  summary: string;
}

export interface SearchResult {
  type: "conversation" | "thought" | "telegram";
  id: string;
  title: string | null;
  employee?: string;
  category: string | null;
  summary: string | null;
  date: string;
}

export interface SearchResponse {
  results: SearchResult[];
}

export interface ReportResponse {
  date: string;
  summary: {
    thoughts: number;
    conversations: number;
  };
  by_category: {
    category: string;
    color: string;
    count: number;
    items: (Thought | Conversation)[];
  }[];
  by_employee: {
    employee: string;
    role: string;
    count: number;
    items: Conversation[];
  }[];
}

// Claude API 분류 결과
export interface ClassifierItem {
  category: string;
  title: string;
  summary: string;
  advice: string;
}

export interface ClassifierResponse {
  items: ClassifierItem[];
}
