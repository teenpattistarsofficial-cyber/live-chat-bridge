const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const YOUR_TELEGRAM_ID = process.env.YOUR_TELEGRAM_ID || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

const HUMAN_TRIGGERS = ['talk to human', 'human', 'agent', 'real person', 'person', 'help me'];

app.use(express.static(path.join(__dirname, 'public')));

const sessions = new Map();

wss.on('connection', (widgetWs) => {
  const sessionKey = `widget:${Date.now()}`;
  sessions.set(widgetWs, { sessionKey });

  widgetWs.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
    
      if (msg.type === 'init') {
        widgetWs.send(JSON.stringify({ type: 'init', sessionKey, botName: 'Support Bot' }));
        widgetWs.send(JSON.stringify({ type: 'bot_message', text: 'Hi there! 👋 I\'m your virtual assistant. How can I help you today?' }));
        return;
      }

      const lowerText = (msg.text || '').toLowerCase();
      const wantsHuman = HUMAN_TRIGGERS.some(t => lowerText.includes(t));

      if (wantsHuman) {
        widgetWs.send(JSON.stringify({ type: 'human_mode', message: 'Connecting you to a human...' }));
        if (YOUR_TELEGRAM_ID && TELEGRAM_BOT_TOKEN) {
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              chat_id: YOUR_TELEGRAM_ID, 
              text: `🆘 Human Handoff Request\n\nSession: ${sessionKey}\nMessage: ${msg.text}`
            })
          });
        }
        return;
      }

      // Demo mode: simple auto-reply
      const responses = [
        "Thanks for your message! A human will get back to you soon.",
        "Got it! I'll pass this along to our team.",
        "Interesting question! Let me check and get back to you.",
        "Thanks for reaching out! We'll respond shortly."
      ];
      const reply = responses[Math.floor(Math.random() * responses.length)];
      setTimeout(() => {
        widgetWs.send(JSON.stringify({ type: 'bot_message', text: reply }));
      }, 1000);

    } catch (e) {}
  });

  widgetWs.on('close', () => sessions.delete(widgetWs));
});

app.use(express.json());
app.post('/webhook/telegram', async (req, res) => {
  const { message } = req.body;
  if (message && message.text) {
    for (const [widgetWs] of sessions) {
      widgetWs.send(JSON.stringify({ type: 'human_message', text: message.text, sender: 'Human Support' }));
    }
  }
  res.send('OK');
});

server.listen(PORT, () => console.log(`Bridge running on port ${PORT}`));
