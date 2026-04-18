const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const fetch = require('node-fetch');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const GATEWAY_URL = process.env.GATEWAY_URL || 'ws://localhost:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '4ac5b2f05962f454';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7924646791:AAEuqc7xy29MIFL14MgoL6KOw9O6-WlYD_I';
const HUMAN_TRIGGERS = ['talk to human', 'human', 'agent', 'real person', 'person', 'someone help', 'help me'];
const YOUR_TELEGRAM_ID = process.env.YOUR_TELEGRAM_ID || '';

app.use(express.static(path.join(__dirname, 'public')));

const sessions = new Map();
let gatewayWs = null;

function connectToGateway() {
  gatewayWs = new WebSocket(GATEWAY_URL);

  gatewayWs.on('open', () => {
    gatewayWs.send(JSON.stringify({ type: 'auth', token: GATEWAY_TOKEN }));
  });

  gatewayWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.sessionKey) {
        for (const [widgetWs, sessionData] of sessions.entries()) {
          if (sessionData.gatewaySessionKey === msg.sessionKey) {
            widgetWs.send(JSON.stringify(msg));
          }
        }
      }
    } catch (e) {}
  });

  gatewayWs.on('close', () => {
    setTimeout(connectToGateway, 5000);
  });
}

wss.on('connection', (widgetWs) => {
  let sessionKey = `widget:${Date.now()}`;
  let isHumanMode = false;

  sessions.set(widgetWs, { sessionKey, gatewaySessionKey: null, isHumanMode });

  widgetWs.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
    
      if (msg.type === 'init') {
        widgetWs.send(JSON.stringify({ type: 'init', sessionKey, botName: 'Support Bot' }));
        return;
      }

      const lowerText = (msg.text || '').toLowerCase();
      const wantsHuman = HUMAN_TRIGGERS.some(t => lowerText.includes(t));

      if (wantsHuman) {
        isHumanMode = true;
        sessions.get(widgetWs).isHumanMode = true;
        widgetWs.send(JSON.stringify({ type: 'human_mode', message: 'Connecting you to a human...' }));
        await notifyHuman(msg.text || '', sessionKey);
        return;
      }

      if (gatewayWs && gatewayWs.readyState === WebSocket.OPEN) {
        gatewayWs.send(JSON.stringify({ type: 'chat.send', sessionKey, text: msg.text }));
      }
    } catch (e) {}
  });

  widgetWs.on('close', () => sessions.delete(widgetWs));
});

async function notifyHuman(userMessage, sessionKey) {
  if (!YOUR_TELEGRAM_ID) return;
  const text = `🆘 Human Handoff Request\n\nSession: ${sessionKey}\nMessage: ${userMessage}`;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: YOUR_TELEGRAM_ID, text })
  });
}

app.use(express.json());
app.post('/webhook/telegram', async (req, res) => {
  const { message } = req.body;
  if (message && message.text) {
    for (const [widgetWs, sessionData] of sessions.entries()) {
      widgetWs.send(JSON.stringify({ type: 'human_message', text: message.text, sender: 'Human Support' }));
    }
  }
  res.send('OK');
});

connectToGateway();
server.listen(PORT, () => console.log(`Bridge running on port ${PORT}`));