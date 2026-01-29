import "dotenv/config";
import { getContactsByWorkspace } from "./db";

async function check() {
    console.log("Checking workspaces 1, 2, 3...");
    const workspaceIds = [1, 2, 3];

    for (const id of workspaceIds) {
        console.log(`Checking Workspace ID: ${id}`);
        const allContacts = await getContactsByWorkspace(id);
        console.log(`  -> Found ${allContacts.length} contacts.`);

        allContacts.forEach(c => {
            console.log(`     ID: ${c.id}, Number: ${c.whatsappNumber}, Name: ${c.name}, Metadata: ${JSON.stringify(c.metadata)}`);
        });
    }
}

check().catch(console.error);
