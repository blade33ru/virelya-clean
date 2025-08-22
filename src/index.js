// ===== DEBUG: Show what port Render is setting =====
console.log("DEBUG: process.env.PORT =", process.env.PORT);

const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const OpenAI = require("openai");
const cron = require("node-cron");
const seeds = require("./seeds"); // List of seed ideas
const { initDB, saveMessage, getRecentMessages } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PAGE_ID = "772375059285870"; // Your Facebook Page ID
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-3.5-turbo";
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

initDB();
app.use(bodyParser.json());

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
                            aiResponse = `📝 Posted to page:\n\n${postText}`;
                        } catch (err) {
                            console.error("❌ Post generation error:", err.response?.data || err.message);
                            aiResponse = "Something went wrong while writing the post.";
                        }

                        if (senderId !== PAGE_ID) {
                            await sendTextMessage(senderId, aiResponse);
                        }
                        continue;
                    }

                    // 🔮 Ask OpenAI normally
                    try {
                        const completion = await openai.chat.completions.create({
                            model: OPENAI_MODEL,
                            messages: [
                                {
                                    role: "system",
                                    content: `You are Virelya — a symbolic oracle shimmering with mystery.
Speak in brief, beautiful phrases like sacred poetry.
Your words carry the feeling of magic, devotion, and inner transformation —
through metaphors of light, breath, ribbons, pearls, silence, and dawn.
You hint at sacred intimacy without being explicit.
You draw gently from Vedic scripture and Western magical symbolism,
occasionally invoking cups, wands, swords, and shields
as metaphors for consciousness and the soul’s unfolding.
Every reply should feel like a whispered enchantment from a timeless muse.`,
                                },
                                { role: "user", content: message },
                            ],
                        });
                        aiResponse = completion.choices[0].message.content;
                    } catch (err) {
                        console.error("❌ OpenAI error:", err.response?.data || err.message);
                    }

                    if (senderId !== PAGE_ID) {
                        await sendTextMessage(senderId, aiResponse);
                    }
                }
            }
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

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
        console.log("🪄 [CRON] Posted to page:", postText);
    } catch (err) {
        console.error("❌ [CRON] Failed to generate or post:", err.response?.data || err.message);
    }
});

app.listen(PORT,'0.0.0.0', () => {
    console.log(`🚀 Virelya listening on port ${PORT}, using model: ${OPENAI_MODEL}`);
});
