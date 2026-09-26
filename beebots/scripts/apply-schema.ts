/** Apply src/lib/schema.sql to the configured Postgres database. */
import "./lib-env.ts";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(url, { prepare: false });
const ddl = readFileSync(new URL("../src/lib/schema.sql", import.meta.url), "utf8");
const statements = ddl
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));
for (const statement of statements) {
  await sql.unsafe(statement);
}
console.log(`Applied ${statements.length} schema statements.`);
await sql.end();
