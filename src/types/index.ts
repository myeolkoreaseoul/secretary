// 카테고리
export interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
}

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
