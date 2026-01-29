
import { createClient } from "@libsql/client";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbUrl = "file:" + path.resolve(__dirname, "../local.db");
const client = createClient({ url: dbUrl });

async function run() {
    try {
        console.log("Searching for '%cama%'...");
        const search = await client.execute("SELECT * FROM products WHERE name LIKE '%cama%' LIMIT 100");

        console.log(`Found ${search.rows.length} matches.`);

        search.rows.forEach(row => {
            console.log(`[${row.sku}] ${row.name} - ${row.price}`);
        });

        console.log("\nSearching for '%.cama%' (dot cama)...");
        const dott = await client.execute("SELECT * FROM products WHERE name LIKE '%.cama%' LIMIT 20");
        dott.rows.forEach(row => {
            console.log(`[${row.sku}] ${row.name}`);
        });

    } catch (e) {
        console.error(e);
    }
}

run();
