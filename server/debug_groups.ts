import * as dotenv from "dotenv";
dotenv.config();

import { getDb } from "./db";
import { contacts, conversations, messages } from "../drizzle/schema";
import { eq, like, desc, sql } from "drizzle-orm";

async function run() {
    const db = await getDb();
    if (!db) {
        console.error("Database not connected");
        return;
    }

    // 1. List Group Contacts (searching all and filtering in JS to catch metadata)
    const allContacts = await db.select().from(contacts);
    const groupContacts = allContacts.filter(c => {
        const isGroupMeta = (c.metadata as any)?.isGroup;
        const isGroupJid = c.whatsappNumber.endsWith("@g.us") || (c.metadata as any)?.whatsappJid?.endsWith("@g.us");
        const isLongID = c.whatsappNumber.length > 15; // Groups usually have long IDs
        return isGroupMeta || isGroupJid || isLongID;
    });

    console.log(`\n=== Group Contacts (${groupContacts.length}) ===`);
    groupContacts.forEach(c => {
        console.log(`- [${c.id}] ${c.name} (${c.whatsappNumber}) - Metadata:`, c.metadata);
    });

    // 2. Check Conversations for these groups
    console.log(`\n=== Conversations for Groups ===`);
    for (const group of groupContacts) {
        const convs = await db.select().from(conversations).where(eq(conversations.contactId, group.id));
        console.log(`Group: ${group.name} (${group.whatsappNumber}) -> Conversations: ${convs.length}`);

        // 3. Count messages for each conversation
        for (const conv of convs) {
            const msgCount = await db.select({ count: sql<number>`count(*)` })
                .from(messages)
                .where(eq(messages.conversationId, conv.id));
            console.log(`   - ConvID [${conv.id}]: ${msgCount[0]?.count} messages`);

            // Show last 3 messages
            const lastMsgs = await db.select().from(messages)
                .where(eq(messages.conversationId, conv.id))
                .orderBy(desc(messages.sentAt))
                .limit(3);

            lastMsgs.forEach(m => {
                console.log(`     - [${m.id}] ${m.sentAt} (${m.senderType}): ${m.content?.substring(0, 30)}... Metadata:`, m.metadata);
            });
        }
    }
}

run().catch(console.error);
