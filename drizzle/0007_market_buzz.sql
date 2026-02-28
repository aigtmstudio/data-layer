-- Market Buzz reports table
CREATE TABLE IF NOT EXISTS buzz_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  time_window_days INTEGER NOT NULL DEFAULT 30,
  icp_ids JSONB,
  report JSONB,
  signals_analyzed INTEGER,
  topics_count INTEGER,
  webinar_angles_count INTEGER,
  copy_snippets_count INTEGER,
  input_hash TEXT,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'generating',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_buzz_reports_client ON buzz_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_buzz_reports_client_status ON buzz_reports(client_id, status);

-- Add buzz_generation to job_type enum
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'buzz_generation';
