-- Plan blocks for daily timeboxing (Elon Musk style)
-- Each block = one planned time slot for a specific task

CREATE TABLE plan_blocks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    start_time TIME NOT NULL,          -- e.g. '09:00'
    end_time TIME NOT NULL,            -- e.g. '10:30'
    title TEXT NOT NULL,
    category TEXT DEFAULT 'coding',
    color TEXT,                         -- optional override color
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_plan_blocks_date ON plan_blocks(date);

-- RLS
ALTER TABLE plan_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON plan_blocks
    FOR ALL USING (true) WITH CHECK (true);
