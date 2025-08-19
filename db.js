const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./virelya.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id TEXT,
      user_message TEXT,
      bot_response TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

function logMessage(senderId, userMessage, botResponse) {
  db.run(`
    INSERT INTO messages (sender_id, user_message, bot_response)
    VALUES (?, ?, ?)
  `, [senderId, userMessage, botResponse]);
}

function getRecentMessages(senderId, callback) {
  db.all(`
    SELECT * FROM messages WHERE sender_id = ? ORDER BY timestamp DESC LIMIT 10
  `, [senderId], (err, rows) => {
    if (err) {
      console.error("DB read error:", err);
      callback([]);
    } else {
      callback(rows);
    }
  });
}

module.exports = { logMessage, getRecentMessages };
