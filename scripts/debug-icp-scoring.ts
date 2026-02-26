import { initDb, getDb, schema } from '../src/db/index.js';
import { eq, and, isNull } from 'drizzle-orm';

initDb(process.env.DATABASE_URL!);
const db = getDb();

// Get the list and its ICP
const [list] = await db.select().from(schema.lists).where(eq(schema.lists.id, '2b5c0e3a-45f1-4370-ade3-150075d3584d'));
if (!list) { console.log('List not found'); process.exit(); }

console.log('List:', list.name, 'ICP ID:', list.icpId);

if (list.icpId) {
  const [icp] = await db.select().from(schema.icps).where(eq(schema.icps.id, list.icpId));
  console.log('\nICP:', icp.name);
  console.log('Filters:', JSON.stringify(icp.filters, null, 2));
  console.log('Provider hints:', JSON.stringify(icp.providerHints, null, 2));
}

// Check what data companies actually have
const members = await db.select({
  companyName: schema.companies.name,
  domain: schema.companies.domain,
  industry: schema.companies.industry,
  employeeCount: schema.companies.employeeCount,
  country: schema.companies.country,
  revenue: schema.companies.annualRevenue,
  fundingStage: schema.companies.latestFundingStage,
  foundedYear: schema.companies.foundedYear,
  icpFitScore: schema.listMembers.icpFitScore,
  addedReason: schema.listMembers.addedReason,
}).from(schema.listMembers)
  .innerJoin(schema.companies, eq(schema.listMembers.companyId, schema.companies.id))
  .where(and(eq(schema.listMembers.listId, list.id), isNull(schema.listMembers.removedAt)))
  .limit(15);

// Check the build job output
const jobs = await db.select({
  id: schema.jobs.id,
  status: schema.jobs.status,
  output: schema.jobs.output,
  createdAt: schema.jobs.createdAt,
}).from(schema.jobs)
  .where(eq(schema.jobs.type, 'list_build'))
  .orderBy(schema.jobs.createdAt)
  .limit(5);

for (const j of jobs) {
  console.log(`\nJob ${j.id} (${j.status}, ${j.createdAt}):`);
  console.log('  Output:', JSON.stringify(j.output, null, 2));
}

// Check company sources
const companySources = await db.select({
  name: schema.companies.name,
  domain: schema.companies.domain,
  primarySource: schema.companies.primarySource,
  sources: schema.companies.sources,
}).from(schema.listMembers)
  .innerJoin(schema.companies, eq(schema.listMembers.companyId, schema.companies.id))
  .where(and(eq(schema.listMembers.listId, list.id), isNull(schema.listMembers.removedAt)))
  .limit(10);

console.log('\nCompany sources:');
for (const c of companySources) {
  console.log(`  ${c.name} | primarySource=${c.primarySource} | sources=${JSON.stringify(c.sources)}`);
}

console.log('\nSample companies (' + members.length + '):');
for (const m of members) {
  console.log(`  ${m.companyName} | domain=${m.domain} | industry=${m.industry} | empl=${m.employeeCount} | country=${m.country} | rev=${m.revenue} | funding=${m.fundingStage} | founded=${m.foundedYear} | score=${m.icpFitScore}`);
  console.log(`    reason: ${m.addedReason?.slice(0, 120)}`);
}

process.exit();
