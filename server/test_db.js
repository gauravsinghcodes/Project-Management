import { Pool } from '@neondatabase/serverless';

process.env.DATABASE_URL = '"postgresql://test:test@host.com/db"';

const connectionString = `${process.env.DATABASE_URL}`;

async function main() {
    try {
        const pool = new Pool({ connectionString });
        console.log("Success pool instance");
    } catch(e) {
        console.error("THREW:", e);
    }
}
main();
