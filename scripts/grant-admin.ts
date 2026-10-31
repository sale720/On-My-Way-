/**
 * Operator bootstrap: grant PLATFORM_ADMIN to an account that has already signed in once.
 * Usage: npm run admin:grant -- 05XXXXXXXX "reason for the grant"
 * Recorded in the audit log with actor = system (null).
 */
import "dotenv/config";
import { bootstrapAdmin } from "../src/server/users/service";
import { db } from "../src/server/db";

async function main() {
  const [phone, reason] = process.argv.slice(2);
  if (!phone || !reason) {
    console.error('Usage: npm run admin:grant -- <phone> "<reason>"');
    process.exit(2);
  }
  const id = await bootstrapAdmin(phone, reason);
  console.log(`PLATFORM_ADMIN granted to user ${id}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
