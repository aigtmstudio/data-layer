-- Add social_keywords to ICPs
ALTER TABLE icps ADD COLUMN IF NOT EXISTS social_keywords JSONB DEFAULT '[]';

-- Influencers table
CREATE TABLE IF NOT EXISTS influencers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  profile_url TEXT,
  category TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_influencers_client ON influencers(client_id);
CREATE INDEX IF NOT EXISTS idx_influencers_client_active ON influencers(client_id, is_active);

-- Monitored competitors table
CREATE TABLE IF NOT EXISTS monitored_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  uptimerobot_monitor_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitored_competitors_client ON monitored_competitors(client_id);

-- Competitor downtime alerts table
CREATE TABLE IF NOT EXISTS competitor_downtime_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  competitor_id UUID NOT NULL REFERENCES monitored_competitors(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  downtime_started_at TIMESTAMPTZ NOT NULL,
  downtime_resolved_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'ongoing',
  alert_data JSONB,
  dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_competitor_alerts_client ON competitor_downtime_alerts(client_id);
CREATE INDEX IF NOT EXISTS idx_competitor_alerts_client_status ON competitor_downtime_alerts(client_id, status);

-- Add social_signal_search to job_type enum
ALTER TYPE job_type ADD VALUE IF NOT EXISTS 'social_signal_search';
