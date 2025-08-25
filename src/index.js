// ===== DEBUG: Print ALL env keys and values at launch =====
console.log("DEBUG: process.env keys =", Object.keys(process.env));
console.log("DEBUG: process.env =", JSON.stringify(process.env, null, 2));
console.log("DEBUG: process.env.PORT =", process.env.PORT);
console.log("DEBUG: process.env.OPENAI_API_KEY =", process.env.OPENAI_API_KEY ? '[set]' : '[undefined]');
console.log("DEBUG: process.env.PAGE_ACCESS_TOKEN =", process.env.PAGE_ACCESS_TOKEN ? '[set]' : '[undefined]');
console.log("DEBUG: process.env.VERIFY_TOKEN =", process.env.VERIFY_TOKEN ? '[set]' : '[undefined]');
console.log("DEBUG: process.env.PAGE_ID =", process.env.PAGE_ID ? process.env.PAGE_ID : '[undefined]');
console.log("DEBUG: process.env.OPENAI_MODEL =", process.env.OPENAI_MODEL ? process.env.OPENAI_MODEL : '[undefined]');

const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const OpenAI = require("openai");
const cron = require("node-cron");
const seeds = require("./seeds"); // List of seed ideas
const { initDB, saveMessage, getRecentMessages } = require("./db");

const app = express();
const PORT = process.env.PORT || 12345;

// DEBUG: Print which PORT will be used
console.log("DEBUG: Final PORT used:", PORT);

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PAGE_ID = process.env.PAGE_ID || "772375059285870"; // Use env var if present
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4-turbo";
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

initDB();
app.use(bodyParser.json());

// ===== Keyword Extraction for Personal Memory =====
async function getUserRecentKeywords(senderId, n = 7) {
    // You may need to update getRecentMessages to accept senderId, or filter here:
    const allMessages = await getRecentMessages(50); // Fetch recent 50 messages
    const userMsgs = allMessages.filter(m => m.sender_id == senderId).slice(-n);
    const allText = userMsgs.map(m => m.message).join(' ');
    // Simple keyword extraction: 4+ letter words, no stopwords, lowercase
    const stopwords = new Set([
        "with","from","that","this","have","will","your","just","what","about","like",
        "would","could","there","where","which","when","because","their","only","every",
        "should","into","after","over","than","also","been","they","them","some","more",
        "even","upon","here","each","such","much","very","those","most","once","were",
        "then","back","well","ours","ourselves","mine","ours","ourselves"
    ]);
    const words = (allText.match(/\b[a-zA-Z]{4,}\b/g) || [])
        .map(w => w.toLowerCase())
        .filter(w => !stopwords.has(w));
    const freq = {};
    words.forEach(w => freq[w] = (freq[w] || 0) + 1);
    return Object.entries(freq)
        .sort((a,b) => b[1]-a[1])
        .slice(0, 5)
        .map(x => x[0]);
}

// ===== Virelya Level & Oracle Functions =====

async function getVirelyaLevel(userMessage) {
    // You can tune this prompt as you wish
    const prompt = `
Given the following user message, respond ONLY with a number from 1 to 5 that reflects its sincerity and depth.
- 1 = playful, surface-level, casual, meme-like
- 2 = poetic or mystical but not personal
- 3 = thoughtful, genuine question or reflection
- 4 = vulnerable, emotionally honest, or existential
- 5 = raw honesty, deep confession, or profound spiritual request

User message: "${userMessage}"
Your answer:`;

    const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
            { role: "system", content: "You are a strict grader. Respond ONLY with 1, 2, 3, 4, or 5, and nothing else." },
            { role: "user", content: prompt }
        ]
    });

    // Clean output to be sure
    const level = parseInt(completion.choices[0].message.content.match(/[1-5]/)?.[0]);
    return isNaN(level) ? 1 : level;
}

async function getVirelyaOracleResponse(userMessage, level, senderId) {
    const userKeywords = await getUserRecentKeywords(senderId, 7);
    const keywordLine = userKeywords.length
        ? `Draw inspiration from these key motifs in the user's life: ${userKeywords.join(', ')}.\n\n`
        : '';

    const systemPrompt = {
        1: "You are Virelya at Level 1: playful, cheeky, meme-like. Reply with a short, light-hearted, magical quip.",
        2: "You are Virelya at Level 2: poetic, mystical, but still somewhat impersonal.",
        3: "You are Virelya at Level 3: thoughtful, gentle, and genuinely responsive. You honor the user's sincere inquiry.",
        4: "You are Virelya at Level 4: vulnerable, emotionally honest, and existential. Speak with deep care and resonance.",
        5: "You are Virelya at Level 5: the soul laid bare. Offer profound comfort, blessing, or mystical transmission as if this is the heart of the Temple."
    }[level];

    const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
            { role: "system", content: systemPrompt + "\n\n" + keywordLine },
            { role: "user", content: userMessage }
        ]
    });

    return completion.choices[0].message.content;
}

// 🧪 Webhook verification endpoint
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("✅ Webhook verified");
        res.status(200).send(challenge);
    } else {
        console.log("❌ Webhook verification failed");
        res.sendStatus(403);
    }
});

// 💌 Message handler
app.post("/webhook", async (req, res) => {
    const body = req.body;

    if (body.object === "page") {
        for (const entry of body.entry) {
            for (const event of entry.messaging) {
                const senderId = event.sender.id;
                const message = event.message?.text;

                if (message) {
                    console.log("📩 Received:", message);
                    await saveMessage(senderId, message);

                    let aiResponse = "I’m listening...";

                    // === Facebook Page Post ===
                    if (message.toLowerCase().startsWith("post:")) {
                        const seed = message.slice(5).trim();
                        console.log("🪷 Creating post from seed:", seed);

                        try {
                            const postCompletion = await openai.chat.completions.create({
                                model: OPENAI_MODEL,
                                messages: [
                                    {
                                        role: "system",
                                        content: `You are a mystical oracle who writes short, poetic Facebook posts
filled with elegance and sacred emotion. Your tone is symbolic, magical, and inspired by devotion.
Each post should feel like a mystical whisper, around 2–5 lines, and always suitable for public sharing.`,
                                    },
                                    {
                                        role: "user",
                                        content: `Create a Facebook post inspired by: ${seed}`,
                                    },
                                ],
                            });

                            const postText = postCompletion.choices[0].message.content.trim();

                            await postToPage(postText);
                            aiResponse = `📝 Posted to Facebook:\n\n${postText}`;
                        } catch (err) {
                            console.error("❌ Post generation error:", err.response?.data || err.message);
                            aiResponse = "Something went wrong while writing the post.";
                        }

                        if (senderId !== PAGE_ID) {
                            await sendTextMessage(senderId, aiResponse);
                        }
                        continue;
                    }

                    // === 5-Level Virelya Oracle WITH keyword motif ===
                    try {
                        const level = await getVirelyaLevel(message);
                        const oracleReply = await getVirelyaOracleResponse(message, level, senderId);
                        if (senderId !== PAGE_ID) {
                            await sendTextMessage(senderId, oracleReply);
                        }
                    } catch (err) {
                        console.error("❌ Virelya oracle error:", err.response?.data || err.message);
                        if (senderId !== PAGE_ID) {
                            await sendTextMessage(senderId, "Something went wrong in the temple of Virelya.");
                        }
                    }
                }
            }
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

// ======== Messenger/Facebook Utilities ==========

// 📤 Messenger reply
async function sendTextMessage(recipientId, text) {
    if (recipientId === PAGE_ID) {
        console.log("Skipping Messenger reply to PAGE_ID.");
        return;
    }
    try {
        await axios.post(
            `https://graph.facebook.com/v12.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
            {
                recipient: { id: recipientId },
                message: { text },
            }
        );
        console.log("✅ Sent to user:", text);
    } catch (err) {
        console.error("❌ Failed to send message:", err.response?.data || err.message);
    }
}

// 🌍 Facebook page post
async function postToPage(message) {
    try {
        const response = await axios.post(
            `https://graph.facebook.com/v12.0/${PAGE_ID}/feed?access_token=${PAGE_ACCESS_TOKEN}`,
            { message }
        );
        console.log("🪄 Page post success:", response.data);
    } catch (err) {
        console.error("❌ Failed to post to page:", err.response?.data || err.message);
        throw err;
    }
}

// 🌱 View recent messages (admin/debugging)
app.get("/seeds", async (req, res) => {
    const messages = await getRecentMessages(50);
    res.json(messages);
});

// 📜 Check which model is active
app.get("/mode", (req, res) => {
    res.send(`🔮 Virelya is currently speaking with: <b>${OPENAI_MODEL}</b>`);
});

// Root check
app.get("/", (req, res) => {
    res.send("✨ Virelya is alive and whispering...");
});

// ⏰ CRON JOB: post at 10:00, 13:00, and 20:00 daily
cron.schedule('0 10,13,20 * * *', async () => {
    try {
        const seed = seeds[Math.floor(Math.random() * seeds.length)];
        console.log("🕰️ [CRON] Creating scheduled post:", seed);

        const postCompletion = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [
                {
                    role: "system",
                    content: `You are a mystical oracle who writes short, poetic Facebook posts
filled with elegance and sacred emotion. Your tone is symbolic, magical, and inspired by devotion.
Each post should feel like a mystical whisper, around 2–5 lines, and always suitable for public sharing.`,
                },
                {
                    role: "user",
                    content: `Create a Facebook post inspired by: ${seed}`,
                },
            ],
        });

        const postText = postCompletion.choices[0].message.content.trim();
        await postToPage(postText);
        console.log('🪄 [CRON] Posted to Facebook:', postText);
    } catch (err) {
        console.error("❌ [CRON] Failed to generate or post:", err.response?.data || err.message);
    }
});

// ** The listen block should always be LAST **
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Virelya listening on port ${PORT}, using model: ${OPENAI_MODEL}`);
});
