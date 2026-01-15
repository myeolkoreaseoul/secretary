export type AISource = 'claude' | 'gemini' | 'grok' | 'gpt'
export type ExpertRole = 'secretary' | 'cto' | 'marketing' | 'admin' | 'pr'

export interface Conversation {
  id: string
  ai_source: AISource
  role: ExpertRole
  title: string
  content: string
  summary?: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface DailyArchive {
  id: string
  date: string
  summary: string
  todos: TodoItem[]
  ideas: string[]
  timeline: TimelineItem[]
  created_at: string
}

export interface TodoItem {
  text: string
  completed: boolean
  due_date?: string
}

export interface TimelineItem {
  time: string
  ai_source: AISource
  summary: string
  conversation_id: string
}

export interface Database {
  public: {
    Tables: {
      conversations: {
        Row: Conversation
        Insert: Omit<Conversation, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Conversation, 'id'>>
      }
      daily_archives: {
        Row: DailyArchive
        Insert: Omit<DailyArchive, 'id' | 'created_at'>
        Update: Partial<Omit<DailyArchive, 'id'>>
      }
    }
  }
}
