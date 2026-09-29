import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to, subject, message, html, user, pass } = req.body || {};

    if (!to || !subject || (!message && !html)) {
      return res.status(400).json({ error: 'Missing to, subject, or message in request body' });
    }

    const emailUser = user || process.env.EMAIL_HOST_USER || 'queraai78789@gmail.com';
    const emailPass = pass || process.env.EMAIL_HOST_PASSWORD || 'gehx gwoo ltgp lwsx';

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });

    const mailOptions = {
      from: `"Question Generation System" <${emailUser}>`,
      to,
      subject,
      text: message,
      ...(html ? { html } : {}),
    };

    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (error) {
    console.error('Error in send-email handler:', error);
    return res.status(500).json({ error: error.message || 'Failed to send email' });
  }
}
