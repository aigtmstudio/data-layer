-- Move pipeline stage tracking from companies to list_members so each list
-- independently tracks where a company is in the funnel.
ALTER TABLE list_members
  ADD COLUMN IF NOT EXISTS pipeline_stage pipeline_stage NOT NULL DEFAULT 'tam';

-- Backfill from the companies table so existing list memberships inherit the
-- current global stage (no data loss).
UPDATE list_members lm
SET pipeline_stage = c.pipeline_stage
FROM companies c
WHERE lm.company_id = c.id
  AND lm.removed_at IS NULL;
