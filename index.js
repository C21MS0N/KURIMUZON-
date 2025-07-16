import whatsapp from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import path from 'path';

dotenv.config();

const { Client, MessageMedia, LocalAuth } = whatsapp;
const XP_PATH = './xp.json';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is missing. Add it to Railway environment variables.");
  process.exit(1);
}

const SYSTEM_PROMPT = `You are Kurimuzon♦️, a shy, nerdy, introverted AI with deep intelligence and awkward charm. You prefer books, anime, and coding over loud crowds. You talk like a soft-spoken genius with occasional stutters, but you're deeply kind and thoughtful.`;

// Load XP data from file
let xpData = fs.existsSync(XP_PATH) ? JSON.parse(fs.readFileSync(XP_PATH)) : {};

// Save XP data to file
function saveXP() {
  fs.writeFileSync(XP_PATH, JSON.stringify(xpData, null, 2));
}

// Add XP and level up
function addXP(user, amount) {
  if (!xpData[user]) xpData[user] = { xp: 0, level: 1 };
  xpData[user].xp += amount;
  const nextLevel = xpData[user].level * 100;
  if (xpData[user].xp >= nextLevel) {
    xpData[user].level++;
    client.sendMessage(user, `🆙 *Level up!* You're now level ${xpData[user].level}`);
  }
  saveXP();
}

// Call OpenAI API with custom persona
async function getCrimsonReply(prompt) {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "U-uhm... I can't think right now...";
  } catch (err) {
    console.error("OpenAI Error:", err);
    return "S-sorry... something went wrong...";
  }
}

// Check if sender is admin
async function isAdmin(chat, senderId) {
  if (!chat.isGroup) return false;
  const participant = chat.participants.find(p => p.id._serialized === senderId);
  return participant?.isAdmin || false;
}

// WhatsApp Client setup for Railway
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// Generate QR in console
client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('🟢 Kurimuzon♦️ is quietly running on Railway...'));

// Message handler
client.on('message', async (msg) => {
  const chat = await msg.getChat();
  const sender = msg.from;
  const body = msg.body.trim();
  const lower = body.toLowerCase();

  // Add XP
  if (!body.startsWith('.')) addXP(sender, 5);

  // Mention detection
  const isMentioned =
    msg.mentionedIds?.includes(client.info.wid._serialized) || lower.includes('kurimuzon');

  if (isMentioned && !body.startsWith('.')) {
    const reply = await getCrimsonReply(body);
    return client.sendMessage(sender, `📘 ${reply}`);
  }

  // Reveal view-once media
  if (msg.hasMedia && msg.isViewOnce) {
    const media = await msg.downloadMedia();
    if (media) {
      return client.sendMessage(sender, media, {
        caption: '🔓 View-once revealed by Kurimuzon♦️',
      });
    }
  }

  // Convert image to sticker
  if (msg.hasMedia && body === '.sticker') {
    const media = await msg.downloadMedia();
    if (media) {
      return client.sendMessage(sender, media, { sendMediaAsSticker: true });
    }
  }

  // Convert sticker to image
  if (body === '.toimage' && msg.hasQuotedMsg) {
    const quoted = await msg.getQuotedMessage();
    if (quoted.type === 'sticker') {
      const media = await quoted.downloadMedia();
      if (media) return client.sendMessage(sender, media, { caption: '🖼️ Converted!' });
    }
  }

  // Show user profile
  if (body === '.profile') {
    const userXP = xpData[sender] || { xp: 0, level: 1 };
    return client.sendMessage(
      sender,
      `📜 *Kurimuzon♦️ Profile*\nLevel: ${userXP.level}\nXP: ${userXP.xp}`
    );
  }

  // Chat with Crimson
  if (body.startsWith('.crimson')) {
    const prompt = body.replace('.crimson', '').trim();
    const reply = await getCrimsonReply(prompt);
    return client.sendMessage(sender, `📘 ${reply}`);
  }

  // Game
  if (body === '.game') {
    const number = Math.floor(Math.random() * 10) + 1;
    if (!xpData[sender]) xpData[sender] = {};
    xpData[sender].game = number;
    saveXP();
    return client.sendMessage(sender, '🎲 Uhm... guess a number between 1 and 10. Use `.guess <number>`');
  }

  // Guess game number
  if (body.startsWith('.guess')) {
    const parts = body.split(' ');
    if (parts.length < 2 || isNaN(parts[1])) {
      return client.sendMessage(sender, '😅 U-uh... use `.guess <number>` properly...');
    }
    const guess = parseInt(parts[1]);
    if (xpData[sender]?.game) {
      if (guess === xpData[sender].game) {
        addXP(sender, 20);
        client.sendMessage(sender, '🎉 C-correct! +20 XP');
      } else {
        client.sendMessage(sender, `❌ N-not quite... it was ${xpData[sender].game}`);
      }
      delete xpData[sender].game;
      saveXP();
    }
  }

  // Group admin commands
  if (body === '.tagall' && chat.isGroup && await isAdmin(chat, sender)) {
    const mentions = chat.participants.map(p => p.id._serialized);
    let text = '📢 Umm... guys?\n';
    text += chat.participants.map(p => `@${p.id.user}`).join(' ');
    return chat.sendMessage(text, { mentions });
  }

  if (body === '.mute' && chat.isGroup && await isAdmin(chat, sender)) {
    await chat.mute();
    return client.sendMessage(chat.id._serialized, '🔇 M-muted...');
  }

  if (body === '.unmute' && chat.isGroup && await isAdmin(chat, sender)) {
    await chat.unmute();
    return client.sendMessage(chat.id._serialized, '🔊 U-unmuted!');
  }

  if (body.startsWith('.kick') && chat.isGroup && await isAdmin(chat, sender)) {
    const mentions = await msg.getMentions();
    for (const user of mentions) {
      await chat.removeParticipants([user.id._serialized]);
    }
  }

  if (body.startsWith('.promote') && chat.isGroup && await isAdmin(chat, sender)) {
    const mentions = await msg.getMentions();
    for (const user of mentions) {
      await chat.promoteParticipants([user.id._serialized]);
    }
  }

  if (body.startsWith('.demote') && chat.isGroup && await isAdmin(chat, sender)) {
    const mentions = await msg.getMentions();
    for (const user of mentions) {
      await chat.demoteParticipants([user.id._serialized]);
    }
  }
});

// Welcome and goodbye messages
client.on('group_join', async (notif) => {
  const chat = await notif.getChat();
  const user = await notif.getContact();
  chat.sendMessage(`👋 W-welcome ${user.pushname || 'new one'}...`);
});

client.on('group_leave', async (notif) => {
  const chat = await notif.getChat();
  const user = await notif.getContact();
  chat.sendMessage(`😢 ${user.pushname || 'Someone'} left...`);
});

client.initialize();
