const db = require('./src/config/db');

(async () => {
    try {
        const { rows } = await db.query("SELECT name, email, (fcm_token IS NOT NULL) as has_fcm_token FROM users");
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (e) { console.error(e); process.exit(1); }
})();
