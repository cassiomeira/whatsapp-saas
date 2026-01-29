import "dotenv/config";
import { getDb } from './db';
import * as schema from '../drizzle/schema';
import { sql } from 'drizzle-orm';

async function main() {
    const db = await getDb();
    if (!db) {
        console.error("Database not available");
        process.exit(1);
    }

    console.log("--- DATABASE DIAGNOSTICS ---");

    // 1. Usuarios e seus Workspaces
    const users = await db.select().from(schema.users);
    console.log(`\nUsuarios encontrados: ${users.length}`);
    for (const u of users) {
        console.log(`- ID: ${u.id}, Nome: ${u.name}, WorkspaceID: ${u.workspaceId}, Role: ${u.role}, Status: ${u.status}`);
    }

    // 2. Workspaces
    const workspaces = await db.select().from(schema.workspaces);
    console.log(`\nWorkspaces encontrados: ${workspaces.length}`);
    for (const w of workspaces) {
        console.log(`- ID: ${w.id}, Nome: ${w.name}`);
    }

    // 3. Contatos por Workspace
    console.log("\nContatos por Workspace:");
    for (const w of workspaces) {
        const contacts = await db.select({ count: sql<number>`count(*)` }).from(schema.contacts).where(sql`${schema.contacts.workspaceId} = ${w.id}`);
        console.log(`- Workspace ${w.id} (${w.name}): ${contacts[0]?.count || 0} contatos`);
    }

    // 4. Conversas por Workspace
    console.log("\nConversas por Workspace:");
    for (const w of workspaces) {
        const convs = await db.select({ count: sql<number>`count(*)` }).from(schema.conversations).where(sql`${schema.conversations.workspaceId} = ${w.id}`);
        console.log(`- Workspace ${w.id} (${w.name}): ${convs[0]?.count || 0} conversas`);
    }

    process.exit(0);
}

main().catch(console.error);
