
import { createClient } from "@libsql/client";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbUrl = "file:" + path.resolve(__dirname, "../local.db");
console.log("Connecting to:", dbUrl);

const client = createClient({ url: dbUrl });

async function run() {
    try {
        const rs = await client.execute("SELECT count(*) as count FROM products");
        console.log("Total products:", rs.rows[0].count);

        const search = await client.execute("SELECT * FROM products WHERE name LIKE '%olch%' OR name LIKE '%king%' LIMIT 20");
        console.log("Search matches:");
        if (search.rows.length === 0) console.log("NONE");

        for (const row of search.rows) {
            console.log(`[${row.sku}] ${row.name} - ${row.price}`);
        }

    } catch (e) {
        console.error(e);
    }
}

run();
