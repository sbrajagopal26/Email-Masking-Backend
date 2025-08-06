const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: 'https://email-masking-frontend.vercel.app'
}));

app.use(bodyParser.json());

// In-memory storage for demo (use DB like MongoDB in production)
const emailMappings = {}; // { maskedEmail: { realEmail, expiresAt } }

// Email transporter setup (Gmail example)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// === FIXED ROUTE HERE ===
app.post('/api/generate', (req, res) => {
  const { realEmail, plan } = req.body;
  
  if (!realEmail) return res.status(400).json({ error: 'Real email required.' });
  
  const uniqueId = uuidv4().split('-')[0];
  const domain = 'maskmail.io'; // Custom domain
  const maskedEmail = `${uniqueId}@${domain}`;
  
  const expiresIn = plan === 'premium' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  
  emailMappings[maskedEmail] = {
    realEmail,
    expiresAt: Date.now() + expiresIn
  };
  
  // Make sure the response matches what frontend expects
  return res.json({ maskedEmail });
});

// Email Forwarding Handler
app.post('/api/forward', (req, res) => {
  const { toMasked, subject, message } = req.body;

  const mapping = emailMappings[toMasked];

  if (!mapping) return res.status(404).json({ error: 'Masked email not found.' });
  if (Date.now() > mapping.expiresAt) return res.status(410).json({ error: 'Masked email expired.' });

  // Forward email to real address
  transporter.sendMail({
    from: 'noreply@maskmail.io',
    to: mapping.realEmail,
    subject: `[MaskMail] ${subject}`,
    text: message
  }, (error, info) => {
    if (error) return res.status(500).json({ error: 'Failed to forward email.' });
    return res.json({ success: true });
  });
});

// Clean-up expired emails periodically
setInterval(() => {
  const now = Date.now();
  for (const email in emailMappings) {
    if (emailMappings[email].expiresAt < now) {
      delete emailMappings[email];
    }
  }
}, 60 * 60 * 1000); // Every hour

app.get('/', (req, res) => {
  res.send('Backend is working!');
});

app.listen(PORT, () => console.log(`Email Masking Backend running on port ${PORT}`));
