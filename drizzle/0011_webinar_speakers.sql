CREATE TABLE webinar_speakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  buzz_report_id UUID NOT NULL REFERENCES buzz_reports(id) ON DELETE CASCADE,
  angle_index INTEGER NOT NULL,
  angle_title TEXT NOT NULL,

  -- Identity
  name TEXT NOT NULL,
  current_title TEXT,
  company TEXT,
  bio TEXT,

  -- Social presence
  social_profiles JSONB NOT NULL DEFAULT '[]',
  primary_platform TEXT,
  primary_profile_url TEXT,

  -- Scores
  relevance_score NUMERIC(3,2),
  reach_score NUMERIC(3,2),
  overall_rank INTEGER,

  -- AI content
  speaker_reasoning TEXT,
  evidence JSONB NOT NULL DEFAULT '[]',
  outreach_message TEXT,

  -- Provenance
  discovery_source TEXT,
  source_url TEXT,

  -- Job linkage
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webinar_speakers_report ON webinar_speakers(buzz_report_id, angle_index);
CREATE INDEX idx_webinar_speakers_client ON webinar_speakers(client_id);

-- Add webinar_speaker_find to job_type enum
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'webinar_speaker_find';
