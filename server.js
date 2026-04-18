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

// DEBUG: List all files
app.get('/debug/files', (req, res) => {
  const publicDir = path.join(__dirname, 'public');
  const files = [];

  function listDir(dir, prefix = '') {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          listDir(fullPath, prefix + item + '/');
        } else {
          files.push(prefix + item);
        }
      }
    } catch (e) {
      files.push('Error: ' + e.message);
    }
  }

  listDir(publicDir);
  res.json({
    publicDir,
    files,
    __dirname,
    cwd: process.cwd()
  });
});

// Debug: Read a specific file
app.get('/debug/read', (req, res) => {
  const file = req.query.file || 'widget.html';
  const filePath = path.join(__dirname, 'public', file);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.json({ error: err.message, filePath, exists: fs.existsSync(filePath) });
    } else {
      res.json({ success: true, filePath, size: data.length });
    }
  });
});

// Manual static file serving
app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'widget.html');
  console.log('Trying to serve:', filePath);
  console.log('Exists:', fs.existsSync(filePath));
  fs.readFile(filePath, (err, data) => {
    if (err) return res.status(404).send('Not found: ' + err.message);
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

const userStates = new Map();

wss.on('connection', (widgetWs) => {
  const widgetId = `widget:${Date.now()}`;
  userStates.set(widgetId, { awaitingScreenshot: false, originalMessage: '' });

  widgetWs.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);
      const state = userStates.get(widgetId) || { awaitingScreenshot: false, originalMessage: '' };
    
      if (msg.type === 'init') {
        widgetWs.send(JSON.stringify({ type: 'init', sessionKey: widgetId, botName: 'Support Bot' }));
        widgetWs.send(JSON.stringify({ type: 'bot_message', text: 'Hi there! 👋 I\'m your virtual assistant. How can I help you today?' }));
        return;
      }

      const lowerText = (msg.text || '').toLowerCase();
      const wantsHuman = HUMAN_TRIGGERS.some(t => lowerText.includes(t));

      if (wantsHuman) {
        widgetWs.send(JSON.stringify({ type: 'human_mode', message: 'Connecting you to a human... Please hold 🙏' }));
        if (YOUR_TELEGRAM_ID && TELEGRAM_BOT_TOKEN) {
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: YOUR_TELEGRAM_ID, text: `🆘 Human Handoff\n\nSession: ${widgetId}\nMessage: ${msg.text}` })
          });
        }
        return;
      }

      if (state.awaitingScreenshot) {
        const hasConfirmation = lowerText.includes('screenshot') || lowerText.includes('done') || 
                             lowerText.includes('sent') || lowerText.includes('yes') ||
                             lowerText.includes('image') || lowerText.includes('photo');
      
        if (hasConfirmation) {
          widgetWs.send(JSON.stringify({ type: 'human_mode', message: 'Perfect! 🙏 Connecting you to a human now...' }));
          if (YOUR_TELEGRAM_ID && TELEGRAM_BOT_TOKEN) {
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                chat_id: YOUR_TELEGRAM_ID, 
                text: `🆘 Human Handoff - DEPOSIT ISSUE\n\nSession: ${widgetId}\nIssue: ${state.originalMessage}\n\n✅ User has provided screenshot confirmation` 
              })
            });
          }
        } else {
          widgetWs.send(JSON.stringify({ type: 'bot_message', text: '📸 Please send a screenshot of your deposit issue first.\n\nType "done" once you\'ve sent the screenshot and I\'ll connect you right away 🙏' }));
        }
        return;
      }

      const depositKeywords = ['deposit', 'balance', 'not added', 'missing', 'fail', 'failed', 'not going through', 'stuck', 'transaction'];
      const isDepositIssue = depositKeywords.some(k => lowerText.includes(k));

      if (isDepositIssue) {
        userStates.set(widgetId, { awaitingScreenshot: true, originalMessage: msg.text });
        widgetWs.send(JSON.stringify({ type: 'bot_message', text: 'I understand your concern boss 🙏\n\nTo help you faster, please send a **screenshot** of your deposit issue.\n\nOnce sent, type "done" and I\'ll connect you to a human agent immediately 💬' }));
        return;
      }

      const faqMatch = faq.find(item => item.keywords.some(k => lowerText.includes(k)));
      if (faqMatch && faqMatch.answer) {
        widgetWs.send(JSON.stringify({ type: 'bot_message', text: faqMatch.answer }));
      } else {
        widgetWs.send(JSON.stringify({ type: 'bot_message', text: 'Thanks for your message! A human will get back to you shortly. 🙏\n\nOr type "talk to human" to connect now 💬' }));
      }

    } catch (e) {}
  });

  widgetWs.on('close', () => userStates.delete(widgetId));
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
