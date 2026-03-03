-- ICP build plans table (Market Builder AI Strategist)
CREATE TABLE IF NOT EXISTS icp_build_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  icp_id UUID REFERENCES icps(id) ON DELETE SET NULL,
  plan JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  feedback_history JSONB NOT NULL DEFAULT '[]',
  execution_history JSONB NOT NULL DEFAULT '[]',
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_icp_build_plans_client ON icp_build_plans(client_id);
CREATE INDEX IF NOT EXISTS idx_icp_build_plans_icp ON icp_build_plans(icp_id);
CREATE INDEX IF NOT EXISTS idx_icp_build_plans_status ON icp_build_plans(status);
