import postgres from "postgres";
const sql = postgres("postgresql://postgres.zpsljfgcjvshqxjbxgid:R5InGhmSShaK6rd4@aws-1-eu-west-1.pooler.supabase.com:5432/postgres", { max: 1 });

// Latest list
const [list] = await sql`SELECT id, name FROM lists ORDER BY created_at DESC LIMIT 1`;
console.log("List:", list.name, list.id);

// Linktree
const linktree = await sql`
  SELECT c.name, c.domain, c.primary_source, c.industry
  FROM list_members lm
  JOIN companies c ON c.id = lm.company_id
  WHERE lm.list_id = ${list.id}
    AND lm.removed_at IS NULL
    AND (c.name ILIKE '%linktree%' OR c.domain ILIKE '%linktr%')
`;
console.log("\nLinktree entries:", linktree);

// Source distribution
const sources = await sql`
  SELECT c.primary_source, COUNT(*) as cnt
  FROM list_members lm
  JOIN companies c ON c.id = lm.company_id
  WHERE lm.list_id = ${list.id}
    AND lm.removed_at IS NULL
  GROUP BY c.primary_source
  ORDER BY cnt DESC
`;
console.log("\nSource distribution:");
console.table(sources);

// No-score companies
const noScore = await sql`
  SELECT c.name, c.domain, c.primary_source, c.industry, c.employee_count, c.country,
         lm.icp_fit_score, lm.added_reason
  FROM list_members lm
  JOIN companies c ON c.id = lm.company_id
  WHERE lm.list_id = ${list.id}
    AND lm.removed_at IS NULL
    AND lm.added_reason LIKE ${'%No scoreable%'}
`;
console.log("\nNo scoreable data companies:", noScore.length);
console.table(noScore);

// Sample of ALL members to see source column
const sample = await sql`
  SELECT c.name, c.domain, c.primary_source
  FROM list_members lm
  JOIN companies c ON c.id = lm.company_id
  WHERE lm.list_id = ${list.id}
    AND lm.removed_at IS NULL
  ORDER BY c.name
  LIMIT 15
`;
console.log("\nSample members with source:");
console.table(sample);

await sql.end();
