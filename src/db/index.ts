import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

let _db: ReturnType<typeof drizzle<typeof schema>>;
let _sql: ReturnType<typeof postgres>;

export function getDb() {
  if (!_db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return _db;
}

export function initDb(connectionString: string) {
  _sql = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  _db = drizzle(_sql, { schema });
  return _db;
}

export async function closeDb() {
  if (_sql) {
    await _sql.end();
  }
}

export { schema };
