
import * as dotenv from "dotenv";
dotenv.config();

import { createClient } from "@libsql/client";

async function run() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL not set");
        return;
    }

    const client = createClient({ url: process.env.DATABASE_URL });

    try {
        console.log("Checking metadata column...");
        const check = await client.execute(
            "SELECT name FROM pragma_table_info('messages') WHERE name = 'metadata';"
        );

        if (check && Array.isArray((check as any).rows) && (check as any).rows.length > 0) {
            console.log("Column 'metadata' already exists.");
        } else {
            console.log("Adding 'metadata' column...");
            await client.execute("ALTER TABLE messages ADD COLUMN metadata TEXT;");
            console.log("Success!");
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        client.close();
    }
}

run();
