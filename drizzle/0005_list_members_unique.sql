-- Remove duplicate list_members (keep the earliest row per list_id + company_id)
DELETE FROM list_members a
  USING list_members b
  WHERE a.list_id = b.list_id
    AND a.company_id IS NOT NULL
    AND a.company_id = b.company_id
    AND a.removed_at IS NULL
    AND b.removed_at IS NULL
    AND a.id > b.id;

-- Remove duplicate list_members for contacts too
DELETE FROM list_members a
  USING list_members b
  WHERE a.list_id = b.list_id
    AND a.contact_id IS NOT NULL
    AND a.contact_id = b.contact_id
    AND a.removed_at IS NULL
    AND b.removed_at IS NULL
    AND a.id > b.id;

-- Unique partial index: one active company per list
CREATE UNIQUE INDEX idx_list_members_list_company_unique
  ON list_members (list_id, company_id)
  WHERE removed_at IS NULL AND company_id IS NOT NULL;

-- Unique partial index: one active contact per list
CREATE UNIQUE INDEX idx_list_members_list_contact_unique
  ON list_members (list_id, contact_id)
  WHERE removed_at IS NULL AND contact_id IS NOT NULL;
