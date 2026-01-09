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

// API 요청/응답 타입
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
  type: 'conversation' | 'thought';
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
