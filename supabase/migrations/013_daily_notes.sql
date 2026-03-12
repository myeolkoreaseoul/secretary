-- Daily notes: brain dump + AI-generated priorities per day
CREATE TABLE daily_notes (
    date DATE PRIMARY KEY,
    brain_dump TEXT DEFAULT '',
    priorities JSONB DEFAULT '[]'::jsonb,  -- [{text, done}]
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE daily_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON daily_notes
    FOR ALL USING (true) WITH CHECK (true);
