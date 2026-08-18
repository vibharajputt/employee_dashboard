// auth-email.js — server-side OTP login, password reset, and change-password
// Mount in server.js:
//   const authEmail = require('./auth-email');
//   app.use('/api/auth', authEmail(pool));

const crypto = require('crypto');
const {
    sendMail,
    loginOtpEmail,
    passwordResetEmail,
    passwordChangedEmail,
    newLoginAlertEmail
} = require('./mailer');

const express = require('express');

const OTP_TTL_MIN = 10;
const RESET_TTL_MIN = 15;
const MAX_ATTEMPTS = 5;

function sixDigit() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}
function hash(v) {
    return crypto.createHash('sha256').update(String(v)).digest('hex');
}
function nowIST() {
    return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}
function clientIp(req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
}
function shortAgent(req) {
    const ua = req.headers['user-agent'] || '';
    return ua.length > 90 ? ua.slice(0, 90) + '…' : ua;
}
function mailTarget(user) {
    // Company address first; personal Gmail is the fallback if routing isn't set up yet
    return (user.workEmail && user.workEmail.trim()) || (user.gmail && user.gmail.trim()) || '';
}
function maskEmail(e) {
    if (!e || !e.includes('@')) return '';
    const [u, d] = e.split('@');
    const keep = u.slice(0, 2);
    return `${keep}${'*'.repeat(Math.max(u.length - 2, 2))}@${d}`;
}

module.exports = function authEmail(pool) {
    const router = express.Router();

    // ---------- one-time table setup ----------
    (async () => {
        try {
            await pool.query(`
        CREATE TABLE IF NOT EXISTS auth_codes (
          "id"        SERIAL PRIMARY KEY,
          "userId"    VARCHAR(50) NOT NULL,
          "purpose"   VARCHAR(20) NOT NULL,
          "codeHash"  VARCHAR(64) NOT NULL,
          "expiresAt" TIMESTAMPTZ NOT NULL,
          "attempts"  INTEGER DEFAULT 0,
          "usedAt"    TIMESTAMPTZ,
          "createdAt" TIMESTAMPTZ DEFAULT NOW()
        )
      `);
            await pool.query(`CREATE INDEX IF NOT EXISTS auth_codes_lookup ON auth_codes ("userId","purpose","usedAt")`);
            console.log('[AUTH] auth_codes table ready');
        } catch (e) {
            console.error('[AUTH] table setup failed:', e.message);
        }
    })();

    async function findUser(identifier) {
        const id = (identifier || '').trim().toLowerCase();
        const { rows } = await pool.query(
            `SELECT * FROM users WHERE LOWER(username) = $1 OR LOWER(gmail) = $1 OR LOWER("workEmail") = $1 LIMIT 1`,
            [id]
        );
        return rows[0] || null;
    }

    async function issueCode(userId, purpose, ttlMin) {
        // invalidate previous unused codes for this purpose
        await pool.query(
            `UPDATE auth_codes SET "usedAt" = NOW() WHERE "userId" = $1 AND "purpose" = $2 AND "usedAt" IS NULL`,
            [userId, purpose]
        );
        const code = sixDigit();
        await pool.query(
            `INSERT INTO auth_codes ("userId","purpose","codeHash","expiresAt")
       VALUES ($1,$2,$3, NOW() + ($4 || ' minutes')::interval)`,
            [userId, purpose, hash(code), String(ttlMin)]
        );
        return code;
    }

    async function consumeCode(userId, purpose, code) {
        const { rows } = await pool.query(
            `SELECT * FROM auth_codes
       WHERE "userId" = $1 AND "purpose" = $2 AND "usedAt" IS NULL
       ORDER BY "id" DESC LIMIT 1`,
            [userId, purpose]
        );
        const row = rows[0];
        if (!row) return { ok: false, reason: 'no_code' };
        if (new Date(row.expiresAt) < new Date()) return { ok: false, reason: 'expired' };
        if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'locked' };

        if (row.codeHash !== hash(code)) {
            await pool.query(`UPDATE auth_codes SET "attempts" = "attempts" + 1 WHERE "id" = $1`, [row.id]);
            return { ok: false, reason: 'mismatch', left: MAX_ATTEMPTS - (row.attempts + 1) };
        }
        await pool.query(`UPDATE auth_codes SET "usedAt" = NOW() WHERE "id" = $1`, [row.id]);
        return { ok: true };
    }

    function safeUser(u) {
        const { password, ...rest } = u;
        return rest;
    }

    // =========================================================
    // STEP 1 — verify credentials on the SERVER, then email OTP
    // POST /api/auth/login  { username, password }
    // =========================================================
    router.post('/login', async (req, res) => {
        try {
            const { username, password } = req.body || {};
            if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

            const user = await findUser(username);
            // same response either way — don't reveal which usernames exist
            if (!user || String(user.password).trim() !== String(password).trim()) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }
            if (user.status && user.status !== 'Active') {
                return res.status(403).json({ error: 'Your account has been deactivated. Contact Admin.' });
            }
            const target = mailTarget(user);
            if (!target) {
                return res.status(400).json({ error: 'No email on file for this account. Contact Admin.' });
            }

            const code = await issueCode(user.id, 'login', OTP_TTL_MIN);
            await sendMail({
                to: target,
                subject: `${code} is your MedAstraX login code`,
                html: loginOtpEmail({ name: user.fullname, code, ip: clientIp(req), when: nowIST() })
            });

            res.json({
                step: 'otp_required',
                userId: user.id,
                sentTo: maskEmail(target),
                expiresInMinutes: OTP_TTL_MIN
            });
        } catch (err) {
            console.error('[AUTH] /login', err);
            res.status(500).json({ error: 'Login failed' });
        }
    });

    // =========================================================
    // STEP 2 — verify OTP, return the user object
    // POST /api/auth/verify-otp  { userId, code }
    // =========================================================
    router.post('/verify-otp', async (req, res) => {
        try {
            const { userId, code } = req.body || {};
            if (!userId || !code) return res.status(400).json({ error: 'userId and code required' });

            const result = await consumeCode(userId, 'login', code);
            if (!result.ok) {
                const msg = {
                    no_code: 'No active code. Please sign in again.',
                    expired: 'This code has expired. Request a new one.',
                    locked: 'Too many wrong attempts. Please sign in again.',
                    mismatch: `Incorrect code.${result.left > 0 ? ` ${result.left} attempt(s) left.` : ''}`
                }[result.reason] || 'Verification failed';
                return res.status(400).json({ error: msg });
            }

            const { rows } = await pool.query(`SELECT * FROM users WHERE "id" = $1`, [userId]);
            const user = rows[0];
            if (!user) return res.status(404).json({ error: 'User not found' });

            // fire-and-forget sign-in alert
            sendMail({
                to: mailTarget(user),
                subject: 'New sign-in to your MedAstraX account',
                html: newLoginAlertEmail({ name: user.fullname, when: nowIST(), ip: clientIp(req), agent: shortAgent(req) })
            }).catch(() => { });

            res.json({ ok: true, user: safeUser(user) });
        } catch (err) {
            console.error('[AUTH] /verify-otp', err);
            res.status(500).json({ error: 'Verification failed' });
        }
    });

    // =========================================================
    // Resend the login OTP
    // POST /api/auth/resend-otp  { userId }
    // =========================================================
    router.post('/resend-otp', async (req, res) => {
        try {
            const { userId } = req.body || {};
            const { rows } = await pool.query(`SELECT * FROM users WHERE "id" = $1`, [userId]);
            const user = rows[0];
            if (!user || !mailTarget(user)) return res.status(404).json({ error: 'User not found' });

            const code = await issueCode(user.id, 'login', OTP_TTL_MIN);
            await sendMail({
                to: mailTarget(user),
                subject: `${code} is your MedAstraX login code`,
                html: loginOtpEmail({ name: user.fullname, code, ip: clientIp(req), when: nowIST() })
            });
            res.json({ ok: true, sentTo: maskEmail(mailTarget(user)) });
        } catch (err) {
            console.error('[AUTH] /resend-otp', err);
            res.status(500).json({ error: 'Could not resend code' });
        }
    });

    // =========================================================
    // Forgot password — always returns success (no user enumeration)
    // POST /api/auth/forgot-password  { identifier }
    // =========================================================
    router.post('/forgot-password', async (req, res) => {
        try {
            const { identifier } = req.body || {};
            const user = await findUser(identifier);
            if (user && mailTarget(user)) {
                const code = await issueCode(user.id, 'reset', RESET_TTL_MIN);
                await sendMail({
                    to: mailTarget(user),
                    subject: `${code} is your MedAstraX password reset code`,
                    html: passwordResetEmail({ name: user.fullname, code })
                });
            }
            res.json({ ok: true, message: 'If that account exists, a reset code has been emailed.' });
        } catch (err) {
            console.error('[AUTH] /forgot-password', err);
            res.status(500).json({ error: 'Request failed' });
        }
    });

    // =========================================================
    // Reset password with emailed code
    // POST /api/auth/reset-password  { identifier, code, newPassword }
    // =========================================================
    router.post('/reset-password', async (req, res) => {
        try {
            const { identifier, code, newPassword } = req.body || {};
            if (!identifier || !code || !newPassword) return res.status(400).json({ error: 'All fields required' });
            if (String(newPassword).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

            const user = await findUser(identifier);
            if (!user) return res.status(400).json({ error: 'Invalid code' });

            const result = await consumeCode(user.id, 'reset', code);
            if (!result.ok) {
                const msg = {
                    no_code: 'No active reset code. Start again.',
                    expired: 'This code has expired. Request a new one.',
                    locked: 'Too many wrong attempts. Start again.',
                    mismatch: `Incorrect code.${result.left > 0 ? ` ${result.left} attempt(s) left.` : ''}`
                }[result.reason] || 'Verification failed';
                return res.status(400).json({ error: msg });
            }

            await pool.query(`UPDATE users SET "password" = $1 WHERE "id" = $2`, [newPassword, user.id]);
            sendMail({
                to: mailTarget(user),
                subject: 'Your MedAstraX password was changed',
                html: passwordChangedEmail({ name: user.fullname, when: nowIST(), ip: clientIp(req) })
            }).catch(() => { });

            res.json({ ok: true, message: 'Password updated. You can sign in now.' });
        } catch (err) {
            console.error('[AUTH] /reset-password', err);
            res.status(500).json({ error: 'Reset failed' });
        }
    });

    // =========================================================
    // Change password while signed in (sends confirmation email)
    // POST /api/auth/change-password  { userId, currentPassword, newPassword }
    // =========================================================
    router.post('/change-password', async (req, res) => {
        try {
            const { userId, currentPassword, newPassword } = req.body || {};
            if (!userId || !currentPassword || !newPassword) return res.status(400).json({ error: 'All fields required' });
            if (String(newPassword).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

            const { rows } = await pool.query(`SELECT * FROM users WHERE "id" = $1`, [userId]);
            const user = rows[0];
            if (!user) return res.status(404).json({ error: 'User not found' });
            if (String(user.password).trim() !== String(currentPassword).trim()) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }

            await pool.query(`UPDATE users SET "password" = $1 WHERE "id" = $2`, [newPassword, userId]);
            sendMail({
                to: mailTarget(user),
                subject: 'Your MedAstraX password was changed',
                html: passwordChangedEmail({ name: user.fullname, when: nowIST(), ip: clientIp(req) })
            }).catch(() => { });

            res.json({ ok: true, message: 'Password changed. A confirmation email has been sent.' });
        } catch (err) {
            console.error('[AUTH] /change-password', err);
            res.status(500).json({ error: 'Change failed' });
        }
    });

    return router;
};