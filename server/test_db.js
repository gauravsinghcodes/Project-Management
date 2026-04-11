import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

async function main() {
    try {
        const pool = new Pool();
        const res = await pool.query('SELECT 1 as result');
        console.log("Query result:", res.rows);
    } catch (e) {
        console.error("DB Error:", e);
    }
}

main();
