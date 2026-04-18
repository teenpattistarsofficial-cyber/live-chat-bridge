const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const YOUR_TELEGRAM_ID = process.env.YOUR_TELEGRAM_ID || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

const HUMAN_TRIGGERS = ['talk to human', 'human', 'agent', 'person', 'help me', 'operator', 'real person'];

const faq = [
  { keywords: ['withdrawal', 'withdraw', ' WD ', 'reject'], 
    answer: "Hello boss 🙏\nYour withdrawal may not meet the required conditions.\nKindly check turnover or contact us for full details 😊" },
  { keywords: ['bonus', 'new member', 'register', 'signup'],
    answer: "Hi boss 🎉\nYou can get 100% New Member Bonus\n✔️ Min deposit: 50K\n✔️ Max bonus: 200K\n✔️ Turnover: x18\n\nJust select bonus when depositing 😊" },
  { keywords: ['slow', 'delay', 'processing', 'taking too long'],
    answer: "Hi boss 🙏\nYour request is currently under process.\nKindly allow a few minutes. Thank you for your patience 😊" },
  { keywords: ['refresh', 'reload', 'not working', 'error', 'issue'],
    answer: "Hello boss 🙏\nKindly try to refresh the game or switch internet connection.\nIf issue persists, let us know so we can assist further 😊" }
];

app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'widget.html');
  fs.readFile(filePath, (err, data) => {
    if (err) return res.status(404).send('Not found');
    res.type('html').send(data);
  });
});

app.get('/widget.html', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'widget.html');
  fs.readFile(filePath, (err, data) => {
    if (err) return res.status(404).send('Not found');
    res.type('html').send(data);
  });
});

wss.on('connection', (ws) => {
  console.log('WebSocket connected!');

  ws.send(JSON.stringify({ type: 'init', sessionKey: 'test', botName: 'Support Bot' }));
  ws.send(JSON.stringify({ type: 'bot_message', text: 'Hi there! 👋 I\'m your virtual assistant. How can I help you today?' }));

  ws.on('message', async (data) => {
    console.log('Received:', data.toString());
  
    try {
      const msg = JSON.parse(data);
      const lowerText = (msg.text || '').toLowerCase();
      const wantsHuman = HUMAN_TRIGGERS.some(t => lowerText.includes(t));
    
      if (wantsHuman) {
        ws.send(JSON.stringify({ type: 'human_mode', message: 'Connecting you to a human... Please hold 🙏' }));
      
        if (YOUR_TELEGRAM_ID && TELEGRAM_BOT_TOKEN) {
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: YOUR_TELEGRAM_ID, text: `🆘 Human Handoff\n\nSession: test\nMessage: ${msg.text}` })
          });
        }
        return;
      }

      const faqMatch = faq.find(item => item.keywords.some(k => lowerText.includes(k)));
      if (faqMatch && faqMatch.answer) {
        ws.send(JSON.stringify({ type: 'bot_message', text: faqMatch.answer }));
      } else {
        ws.send(JSON.stringify({ type: 'bot_message', text: 'Thanks for your message! A human will get back to you shortly. 🙏\n\nOr type "talk to human" to connect now 💬' }));
      }

    } catch (e) {
      console.error('Error:', e);
    }
  });

  ws.on('close', () => console.log('WebSocket disconnected'));
  ws.on('error', (e) => console.error('WebSocket error:', e));
});

app.use(express.json());
app.post('/webhook/telegram', async (req, res) => {
  const { message } = req.body;
  if (message && message.text) {
    wss.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: 'human_message', text: message.text, sender: 'Human Support' }));
      }
    });
  }
  res.send('OK');
});

server.listen(PORT, () => console.log(`Bridge running on port ${PORT}`));
