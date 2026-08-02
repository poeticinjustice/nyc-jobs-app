/**
 * Optional outbound email. Alerts work without it — when SMTP isn't
 * configured the in-app new-match counts still update and sending is a no-op.
 *
 * Configure with SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_FROM_EMAIL.
 */

let transportPromise = null;

const isEmailConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const getTransport = () => {
  if (!isEmailConfigured()) return null;
  if (!transportPromise) {
    transportPromise = (async () => {
      try {
        const nodemailer = require('nodemailer');
        return nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT, 10) || 587,
          secure: String(process.env.SMTP_SECURE) === 'true',
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
      } catch (err) {
        console.warn('[mailer] nodemailer unavailable — email disabled:', err.message);
        return null;
      }
    })();
  }
  return transportPromise;
};

/**
 * Send an email. Returns true only if it was actually handed to an SMTP server.
 * Never throws — a mail failure must not break the refresh pipeline.
 */
const sendMail = async ({ to, subject, text, html }) => {
  const transport = await getTransport();
  if (!transport) return false;

  try {
    await transport.sendMail({
      from: process.env.ALERT_FROM_EMAIL || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
    return true;
  } catch (err) {
    console.error('[mailer] send failed:', err.message);
    return false;
  }
};

module.exports = { isEmailConfigured, sendMail };
