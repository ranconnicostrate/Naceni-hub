import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const sqlHost = process.env.SQL_HOST || 'localhost';
const sqlDbName = process.env.SQL_DB_NAME || 'nacenis_db';
const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER;
const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD;

if (!user) {
  throw new Error('SQL_ADMIN_USER or SQL_USER must be set in environment variables.');
}
if (!password) {
  throw new Error('SQL_ADMIN_PASSWORD or SQL_PASSWORD must be set in environment variables.');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: {
    host: sqlHost,
    user,
    password,
    database: sqlDbName,
    ssl: false,
  },
  verbose: true,
});
