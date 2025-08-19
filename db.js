const { Pool } = require("pg");

// Create a connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // required for Render
});

// Initialize DB and ensure the messages table exists
async function initDB() {
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log("✅ Database initialized: messages table ready");
    } catch (err) {
        console.error("❌ Error initializing database:", err);
    }
}

// Insert a message into the database
async function saveMessage(senderId, message) {
    try {
        await pool.query(
            `INSERT INTO messages (sender_id, message) VALUES ($1, $2)`,
            [senderId, message]
        );
        console.log("💾 Saved message:", senderId, message);
    } catch (err) {
        console.error("❌ Error saving message:", err);
    }
}

// Fetch recent messages (for seeds, memory, etc.)
async function getRecentMessages(limit = 20) {
    try {
        const result = await pool.query(
            `SELECT * FROM messages ORDER BY timestamp DESC LIMIT $1`,
            [limit]
        );
        return result.rows;
    } catch (err) {
        console.error("❌ Error fetching messages:", err);
        return [];
    }
}

module.exports = { pool, initDB, saveMessage, getRecentMessages };
