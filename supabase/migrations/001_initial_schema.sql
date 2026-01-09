-- 1. employees (AI 직원)
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL,
  role VARCHAR(100),
  site_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO employees (name, role, site_url) VALUES
('claude', 'CTO', 'https://claude.ai'),
('gemini', '총무', 'https://gemini.google.com'),
('grok', '아트디렉터', 'https://grok.x.ai'),
('perplexity', '홍보팀', 'https://perplexity.ai'),
('genspark', '스페셜에이전트', 'https://genspark.ai');

-- 2. categories (분류 카테고리)
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  color VARCHAR(7),
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO categories (name, color) VALUES
('업무', '#3B82F6'),
('소개팅비즈니스', '#EC4899'),
('온라인판매', '#F59E0B'),
('건강', '#10B981'),
('가족', '#8B5CF6'),
('개발', '#6366F1'),
('기타', '#6B7280');

-- 3. thoughts (생각 분리수거)
CREATE TABLE thoughts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP DEFAULT NOW(),
  date DATE DEFAULT CURRENT_DATE,

  raw_input TEXT NOT NULL,

  category_id UUID REFERENCES categories(id),
  title VARCHAR(500),
  summary TEXT,
  advice TEXT,

  is_reported BOOLEAN DEFAULT FALSE,

  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(raw_input, '') || ' ' || coalesce(title, '') || ' ' || coalesce(summary, ''))
  ) STORED
);

CREATE INDEX thoughts_search_idx ON thoughts USING GIN(search_vector);
CREATE INDEX thoughts_date_idx ON thoughts(date);
CREATE INDEX thoughts_category_idx ON thoughts(category_id);

-- 4. conversations (AI 직원 대화)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP DEFAULT NOW(),
  conversation_date TIMESTAMP,

  employee_id UUID REFERENCES employees(id),
  source_url TEXT,

  title VARCHAR(500),
  content TEXT NOT NULL,
  summary TEXT,

  category_id UUID REFERENCES categories(id),
  tags TEXT[],

  is_reported BOOLEAN DEFAULT FALSE,

  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(content, '') || ' ' || coalesce(title, '') || ' ' || coalesce(summary, ''))
  ) STORED
);

CREATE INDEX conversations_search_idx ON conversations USING GIN(search_vector);
CREATE INDEX conversations_employee_idx ON conversations(employee_id);
CREATE INDEX conversations_date_idx ON conversations(conversation_date);
CREATE INDEX conversations_category_idx ON conversations(category_id);

-- 5. sync_status (세이브 시점 추적)
CREATE TABLE sync_status (
  employee_id UUID PRIMARY KEY REFERENCES employees(id),
  last_synced_at TIMESTAMP,
  last_conversation_url TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. daily_reports (일일 리포트)
CREATE TABLE daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE UNIQUE NOT NULL,
  content TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
