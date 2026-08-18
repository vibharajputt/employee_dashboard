// mailer.js — Resend-based transactional email for MedAstraX Workspace Portal
// No extra npm deps needed (uses global fetch, Node 18+)

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || 'MedAstraX <noreply@medastrax.com>';
const APP_NAME = 'MedAstraX Workspace';

async function sendMail({ to, subject, html, replyTo }) {
    if (!RESEND_API_KEY) {
        console.warn('[MAIL] RESEND_API_KEY missing — email not sent. To:', to, '| Subject:', subject);
        return { skipped: true };
    }

    const body = { from: MAIL_FROM, to: Array.isArray(to) ? to : [to], subject, html };
    if (replyTo) body.reply_to = replyTo;

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.error('[MAIL] Resend error', res.status, data);
            return { ok: false, error: data };
        }
        console.log('[MAIL] Sent to', to, '| id:', data.id);
        return { ok: true, id: data.id };
    } catch (err) {
        console.error('[MAIL] Network error:', err.message);
        return { ok: false, error: err.message };
    }
}

// ---------- Shared layout ----------
function layout(heading, innerHtml) {
    return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
        <tr><td style="background:#0f766e;padding:20px 28px;">
          <span style="color:#fff;font-size:18px;font-weight:600;letter-spacing:.3px;">MedAstraX</span>
        </td></tr>
        <tr><td style="padding:32px 28px;">
          <h1 style="margin:0 0 16px;font-size:20px;color:#111827;font-weight:600;">${heading}</h1>
          ${innerHtml}
        </td></tr>
        <tr><td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">
            ${APP_NAME} &middot; Automated message, please do not reply.<br>
            Need help? Write to <a href="mailto:admin@medastrax.com" style="color:#0f766e;">admin@medastrax.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function codeBlock(code) {
    return `<div style="margin:20px 0;padding:18px;background:#f0fdfa;border:1px dashed #0f766e;border-radius:8px;text-align:center;">
    <span style="font-size:30px;font-weight:700;letter-spacing:8px;color:#0f766e;font-family:monospace;">${code}</span>
  </div>`;
}

// ---------- Templates ----------
function loginOtpEmail({ name, code, ip, when }) {
    return layout('Your login verification code', `
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">Hi ${name || 'there'},</p>
    <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">Use this code to finish signing in to the portal:</p>
    ${codeBlock(code)}
    <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
      This code expires in 10 minutes and can be used once.
    </p>
    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
      Request details: ${when}${ip ? ` &middot; IP ${ip}` : ''}<br>
      Didn't try to sign in? Ignore this email and change your password.
    </p>`);
}

function passwordResetEmail({ name, code }) {
    return layout('Reset your password', `
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">Hi ${name || 'there'},</p>
    <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">Enter this code in the portal to set a new password:</p>
    ${codeBlock(code)}
    <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;">
      Valid for 15 minutes. If you didn't request a reset, no action is needed &mdash; your password stays unchanged.
    </p>`);
}

function passwordChangedEmail({ name, when, ip }) {
    return layout('Your password was changed', `
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">Hi ${name || 'there'},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      The password for your ${APP_NAME} account was changed on ${when}${ip ? ` from IP ${ip}` : ''}.
    </p>
    <p style="margin:0;font-size:14px;color:#b91c1c;line-height:1.6;">
      If this wasn't you, contact your administrator immediately.
    </p>`);
}

function newLoginAlertEmail({ name, when, ip, agent }) {
    return layout('New sign-in to your account', `
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">Hi ${name || 'there'},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      A new sign-in was recorded on your account.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#374151;">
      <tr><td style="padding:6px 0;color:#6b7280;width:80px;">Time</td><td style="padding:6px 0;">${when}</td></tr>
      ${ip ? `<tr><td style="padding:6px 0;color:#6b7280;">IP</td><td style="padding:6px 0;">${ip}</td></tr>` : ''}
      ${agent ? `<tr><td style="padding:6px 0;color:#6b7280;">Device</td><td style="padding:6px 0;">${agent}</td></tr>` : ''}
    </table>
    <p style="margin:16px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
      Wasn't you? Reset your password and tell your administrator.
    </p>`);
}

function welcomeEmail({ name, username, tempPassword, portalUrl }) {
    return layout('Welcome to MedAstraX', `
    <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">Hi ${name || 'there'},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
      Your ${APP_NAME} account is ready. Here are your sign-in details:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;color:#374151;background:#f9fafb;border-radius:8px;padding:8px;">
      <tr><td style="padding:10px 14px;color:#6b7280;width:120px;">Username</td><td style="padding:10px 14px;font-weight:600;">${username}</td></tr>
      <tr><td style="padding:10px 14px;color:#6b7280;">Temp password</td><td style="padding:10px 14px;font-family:monospace;font-weight:600;">${tempPassword}</td></tr>
    </table>
    <p style="margin:20px 0;">
      <a href="${portalUrl}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:600;">Open the portal</a>
    </p>
    <p style="margin:0;font-size:14px;color:#b91c1c;line-height:1.6;">
      Change this password right after your first sign-in.
    </p>`);
}

module.exports = {
    sendMail,
    loginOtpEmail,
    passwordResetEmail,
    passwordChangedEmail,
    newLoginAlertEmail,
    welcomeEmail
};