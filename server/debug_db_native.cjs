
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../local.db');
console.log('Opening DB at:', dbPath);

try {
    const db = new Database(dbPath, { readonly: true });

    // Count products
    const count = db.prepare('SELECT COUNT(*) as count FROM products').get();
    console.log('Total Products:', count.count);

    // Search for 'colch'
    const query = "SELECT * FROM products WHERE name LIKE '%olcha%' OR name LIKE '%king%' LIMIT 20";
    console.log('Executing:', query);
    const rows = db.prepare(query).all();

    if (rows.length === 0) {
        console.log('❌ No products found matching "olcha" or "king".');

        // Show random 5 products to see what IS there
        console.log('--- Random 5 Products ---');
        const random = db.prepare('SELECT * FROM products LIMIT 5').all();
        console.log(random);
    } else {
        console.log('✅ Found matches:');
        rows.forEach(r => {
            console.log(`[${r.sku}] ${r.name} (Price: ${r.price})`);
        });
    }

} catch (err) {
    console.error('Database Error:', err);
}
