
import { getDb } from "./db";
import { products } from "../drizzle/schema";

async function listProducts() {
    const db = await getDb();
    if (!db) {
        console.error("Database not connected");
        return;
    }

    const allProducts = await db.select().from(products).limit(50);
    console.log("Total products found:", allProducts.length);
    if (allProducts.length === 0) {
        console.log("⚠️ No products found in database! Import likely failed or hasn't been done.");
    }
    allProducts.forEach(p => {
        console.log(`[${p.sku}] ${p.name} - R$ ${(p.price / 100).toFixed(2)}`);
    });
}

listProducts().catch(console.error);
