/**
 * ==========================================================================
 * MEDASTRAX AUTH UI  —  OTP login, password reset, secure change-password
 * ==========================================================================
 * Drop-in module. Load AFTER app.js:
 *     <script src="app.js?v=2.3"></script>
 *     <script src="auth-ui.js?v=1.0"></script>
 *
 * It overrides window.handleLogin, injects its own markup + styles, and
 * re-wires the Settings change-password form to the server.
 * No edits needed inside app.js, index.html body, or styles.css.
 * ==========================================================================
 */

(function () {
    "use strict";

    // ------------------------------------------------------------------------
    // 0. Small helpers
    // ------------------------------------------------------------------------
    var pendingLogin = null;   // { userId, portalType, username, rememberMe, sentTo }
    var resendTimer = null;
    var resendSeconds = 0;

    function el(id) { return document.getElementById(id); }

    function toast(msg, type) {
        if (typeof showToast === "function") showToast(msg, type || "info");
        else console.log("[" + (type || "info") + "] " + msg);
    }

    function icons() {
        if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
    }

    async function postJson(url, body) {
        var res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        var data = {};
        try { data = await res.json(); } catch (e) { /* empty body */ }
        return { ok: res.ok, status: res.status, data: data };
    }

    // ------------------------------------------------------------------------
    // 1. Styles (matches existing MedAstraX design tokens)
    // ------------------------------------------------------------------------
    function injectStyles() {
        if (el("mx-auth-styles")) return;
        var css = document.createElement("style");
        css.id = "mx-auth-styles";
        css.textContent = [
            /* ---- overlay ---- */
            ".mx-auth-overlay{position:fixed;inset:0;background:var(--overlay-bg);backdrop-filter:blur(8px);",
            "display:flex;align-items:center;justify-content:center;z-index:300;opacity:0;pointer-events:none;",
            "transition:opacity var(--transition-normal);padding:20px;}",
            ".mx-auth-overlay:not(.hidden){opacity:1;pointer-events:auto;}",

            ".mx-auth-card{width:100%;max-width:420px;background:var(--card-bg);backdrop-filter:blur(20px);",
            "border:1px solid var(--border-color);border-radius:var(--radius-lg);padding:36px 32px;",
            "box-shadow:var(--shadow-lg);text-align:center;transform:translateY(20px) scale(.98);",
            "transition:transform var(--transition-normal);max-height:92vh;overflow-y:auto;}",
            ".mx-auth-overlay:not(.hidden) .mx-auth-card{transform:translateY(0) scale(1);}",

            /* ---- head ---- */
            ".mx-auth-icon{width:60px;height:60px;border-radius:50%;margin:0 auto 18px;display:flex;",
            "align-items:center;justify-content:center;background:linear-gradient(135deg,var(--accent-color),var(--accent-secondary));",
            "color:#fff;box-shadow:var(--shadow-accent);}",
            ".mx-auth-icon i{width:26px;height:26px;}",
            ".mx-auth-card h2{font-family:var(--font-heading);font-size:1.35rem;color:var(--text-primary);margin-bottom:8px;}",
            ".mx-auth-sub{font-size:.88rem;color:var(--text-secondary);line-height:1.5;margin-bottom:24px;}",
            ".mx-auth-sub strong{color:var(--accent-color);font-weight:600;word-break:break-all;}",

            /* ---- 6-digit code boxes ---- */
            ".mx-code-row{display:flex;gap:8px;justify-content:center;margin-bottom:8px;}",
            ".mx-code-box{width:46px;height:56px;text-align:center;font-family:var(--font-heading);",
            "font-size:1.5rem;font-weight:700;color:var(--text-primary);background:rgba(0,0,0,.06);",
            "border:1.5px solid var(--border-color);border-radius:var(--radius-sm);outline:none;",
            "transition:all var(--transition-fast);-moz-appearance:textfield;}",
            ".mx-code-box::-webkit-outer-spin-button,.mx-code-box::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}",
            "[data-theme='dark'] .mx-code-box{background:rgba(255,255,255,.04);}",
            ".mx-code-box:focus{border-color:var(--accent-color);box-shadow:0 0 0 3px var(--accent-glow);}",
            ".mx-code-box.filled{border-color:var(--accent-color);}",
            ".mx-code-row.shake{animation:mxShake .4s ease;}",
            "@keyframes mxShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}",

            /* ---- misc ---- */
            ".mx-auth-hint{font-size:.78rem;color:var(--text-muted);margin-bottom:20px;min-height:18px;}",
            ".mx-auth-actions{display:flex;flex-direction:column;gap:10px;}",
            ".mx-auth-links{display:flex;justify-content:space-between;align-items:center;margin-top:18px;",
            "padding-top:16px;border-top:1px solid var(--border-color);gap:12px;}",
            ".mx-link{background:none;border:none;font-family:var(--font-body);font-size:.82rem;font-weight:600;",
            "color:var(--accent-color);cursor:pointer;padding:4px;transition:opacity var(--transition-fast);}",
            ".mx-link:hover{opacity:.75;text-decoration:underline;}",
            ".mx-link:disabled{color:var(--text-muted);cursor:not-allowed;text-decoration:none;opacity:1;}",

            ".mx-forgot-wrap{text-align:right;margin:-10px 0 18px;}",
            ".mx-field{text-align:left;margin-bottom:16px;}",
            ".mx-field label{display:block;font-size:.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:7px;}",
            ".mx-field input{width:100%;padding:12px 14px;border-radius:var(--radius-sm);background:rgba(0,0,0,.06);",
            "border:1px solid var(--border-color);color:var(--text-primary);font-family:var(--font-body);font-size:.92rem;",
            "transition:all var(--transition-fast);}",
            "[data-theme='dark'] .mx-field input{background:rgba(255,255,255,.04);}",
            ".mx-field input:focus{outline:none;border-color:var(--accent-color);box-shadow:0 0 0 3px var(--accent-glow);}",

            ".mx-spin{display:inline-block;width:15px;height:15px;border:2px solid rgba(255,255,255,.35);",
            "border-top-color:#fff;border-radius:50%;animation:mxSpin .7s linear infinite;}",
            "@keyframes mxSpin{to{transform:rotate(360deg)}}",

            "@media(max-width:480px){.mx-auth-card{padding:28px 20px;}.mx-code-box{width:40px;height:50px;font-size:1.25rem;}}"
        ].join("");
        document.head.appendChild(css);
    }

    // ------------------------------------------------------------------------
    // 2. Markup
    // ------------------------------------------------------------------------
    function injectMarkup() {
        if (el("mx-otp-overlay")) return;

        var wrap = document.createElement("div");
        wrap.innerHTML = [
            // ---------- OTP ----------
            '<div id="mx-otp-overlay" class="mx-auth-overlay hidden">',
            '  <div class="mx-auth-card">',
            '    <div class="mx-auth-icon"><i data-lucide="shield-check"></i></div>',
            '    <h2>Two-Step Verification</h2>',
            '    <p class="mx-auth-sub">We emailed a 6-digit code to<br><strong id="mx-otp-target">your inbox</strong></p>',
            '    <div class="mx-code-row" id="mx-otp-row">',
            '      <input class="mx-code-box" type="text" inputmode="numeric" maxlength="1" autocomplete="one-time-code">',
            '      <input class="mx-code-box" type="text" inputmode="numeric" maxlength="1">',
            '      <input class="mx-code-box" type="text" inputmode="numeric" maxlength="1">',
            '      <input class="mx-code-box" type="text" inputmode="numeric" maxlength="1">',
            '      <input class="mx-code-box" type="text" inputmode="numeric" maxlength="1">',
            '      <input class="mx-code-box" type="text" inputmode="numeric" maxlength="1">',
            '    </div>',
            '    <p class="mx-auth-hint" id="mx-otp-hint">Code expires in 10 minutes</p>',
            '    <div class="mx-auth-actions">',
            '      <button type="button" class="btn btn-primary btn-block glow-btn" id="mx-otp-verify">',
            '        <span>Verify &amp; Sign In</span> <i data-lucide="arrow-right"></i>',
            '      </button>',
            '    </div>',
            '    <div class="mx-auth-links">',
            '      <button type="button" class="mx-link" id="mx-otp-back">&larr; Back to login</button>',
            '      <button type="button" class="mx-link" id="mx-otp-resend">Resend code</button>',
            '    </div>',
            '  </div>',
            '</div>',

            // ---------- Forgot: request ----------
            '<div id="mx-forgot-overlay" class="mx-auth-overlay hidden">',
            '  <div class="mx-auth-card">',
            '    <div class="mx-auth-icon"><i data-lucide="key-round"></i></div>',
            '    <h2>Reset Your Password</h2>',
            '    <p class="mx-auth-sub">Enter your username or work email. We\'ll send a reset code to the address on file.</p>',
            '    <div class="mx-field">',
            '      <label for="mx-forgot-id">Username or Email</label>',
            '      <input type="text" id="mx-forgot-id" placeholder="e.g. vibha or vibha@medastrax.com" autocomplete="username">',
            '    </div>',
            '    <div class="mx-auth-actions">',
            '      <button type="button" class="btn btn-primary btn-block glow-btn" id="mx-forgot-send">',
            '        <span>Send Reset Code</span> <i data-lucide="send"></i>',
            '      </button>',
            '    </div>',
            '    <div class="mx-auth-links" style="justify-content:center;">',
            '      <button type="button" class="mx-link" id="mx-forgot-cancel">&larr; Back to login</button>',
            '    </div>',
            '  </div>',
            '</div>',

            // ---------- Forgot: set new password ----------
            '<div id="mx-reset-overlay" class="mx-auth-overlay hidden">',
            '  <div class="mx-auth-card">',
            '    <div class="mx-auth-icon"><i data-lucide="lock"></i></div>',
            '    <h2>Set a New Password</h2>',
            '    <p class="mx-auth-sub">Enter the code sent to<br><strong id="mx-reset-target">your inbox</strong></p>',
            '    <div class="mx-code-row" id="mx-reset-row">',
            '      <input class="mx-code-box" type="text" inputmode="numeric" maxlength="1" autocomplete="one-time-code">',
            '      <input class="mx-code-box" type="text" inputmode="numeric" maxlength="1">',
            '      <input class="mx-code-box" type="text" inputmode="numeric" maxlength="1">',
            '      <input class="mx-code-box" type="text" inputmode="numeric" maxlength="1">',
            '      <input class="mx-code-box" type="text" inputmode="numeric" maxlength="1">',
            '      <input class="mx-code-box" type="text" inputmode="numeric" maxlength="1">',
            '    </div>',
            '    <p class="mx-auth-hint">Code expires in 15 minutes</p>',
            '    <div class="mx-field">',
            '      <label for="mx-reset-new">New Password</label>',
            '      <input type="password" id="mx-reset-new" placeholder="At least 8 characters" autocomplete="new-password">',
            '    </div>',
            '    <div class="mx-field">',
            '      <label for="mx-reset-confirm">Confirm New Password</label>',
            '      <input type="password" id="mx-reset-confirm" placeholder="Re-enter password" autocomplete="new-password">',
            '    </div>',
            '    <div class="mx-auth-actions">',
            '      <button type="button" class="btn btn-primary btn-block glow-btn" id="mx-reset-submit">',
            '        <span>Update Password</span> <i data-lucide="check"></i>',
            '      </button>',
            '    </div>',
            '    <div class="mx-auth-links">',
            '      <button type="button" class="mx-link" id="mx-reset-cancel">&larr; Back to login</button>',
            '      <button type="button" class="mx-link" id="mx-reset-resend">Resend code</button>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join("");

        while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
        icons();
    }

    // ------------------------------------------------------------------------
    // 3. Code-box behaviour (auto-advance, backspace, paste)
    // ------------------------------------------------------------------------
    function wireCodeRow(rowId, onComplete) {
        var row = el(rowId);
        if (!row) return;
        var boxes = row.querySelectorAll(".mx-code-box");

        Array.prototype.forEach.call(boxes, function (box, i) {
            box.addEventListener("input", function () {
                box.value = box.value.replace(/\D/g, "").slice(0, 1);
                box.classList.toggle("filled", !!box.value);
                if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
                if (readCode(rowId).length === 6 && typeof onComplete === "function") onComplete();
            });

            box.addEventListener("keydown", function (e) {
                if (e.key === "Backspace" && !box.value && i > 0) {
                    boxes[i - 1].focus();
                    boxes[i - 1].value = "";
                    boxes[i - 1].classList.remove("filled");
                    e.preventDefault();
                } else if (e.key === "ArrowLeft" && i > 0) {
                    boxes[i - 1].focus(); e.preventDefault();
                } else if (e.key === "ArrowRight" && i < boxes.length - 1) {
                    boxes[i + 1].focus(); e.preventDefault();
                } else if (e.key === "Enter" && typeof onComplete === "function") {
                    onComplete();
                }
            });

            box.addEventListener("paste", function (e) {
                e.preventDefault();
                var text = (e.clipboardData || window.clipboardData).getData("text") || "";
                var digits = text.replace(/\D/g, "").slice(0, 6).split("");
                digits.forEach(function (d, k) {
                    if (boxes[k]) { boxes[k].value = d; boxes[k].classList.add("filled"); }
                });
                var next = Math.min(digits.length, boxes.length - 1);
                boxes[next].focus();
                if (digits.length === 6 && typeof onComplete === "function") onComplete();
            });
        });
    }

    function readCode(rowId) {
        var row = el(rowId);
        if (!row) return "";
        var out = "";
        Array.prototype.forEach.call(row.querySelectorAll(".mx-code-box"), function (b) { out += b.value; });
        return out;
    }

    function clearCode(rowId, shake) {
        var row = el(rowId);
        if (!row) return;
        Array.prototype.forEach.call(row.querySelectorAll(".mx-code-box"), function (b) {
            b.value = ""; b.classList.remove("filled");
        });
        if (shake) {
            row.classList.add("shake");
            setTimeout(function () { row.classList.remove("shake"); }, 420);
        }
    }

    function focusCode(rowId) {
        var row = el(rowId);
        if (!row) return;
        var first = row.querySelector(".mx-code-box");
        if (first) setTimeout(function () { first.focus(); }, 120);
    }

    // ------------------------------------------------------------------------
    // 4. Button busy state
    // ------------------------------------------------------------------------
    function busy(btn, isBusy, label) {
        if (!btn) return;
        if (isBusy) {
            btn.dataset.mxHtml = btn.innerHTML;
            btn.disabled = true;
            btn.style.opacity = "0.75";
            btn.innerHTML = '<span class="mx-spin"></span> <span>' + (label || "Please wait…") + "</span>";
        } else {
            btn.disabled = false;
            btn.style.opacity = "";
            if (btn.dataset.mxHtml) { btn.innerHTML = btn.dataset.mxHtml; delete btn.dataset.mxHtml; }
            icons();
        }
    }

    // ------------------------------------------------------------------------
    // 5. Overlay show/hide
    // ------------------------------------------------------------------------
    function show(id) {
        var o = el(id);
        if (o) { o.classList.remove("hidden"); icons(); }
    }
    function hide(id) {
        var o = el(id);
        if (o) o.classList.add("hidden");
    }
    function hideAll() {
        hide("mx-otp-overlay"); hide("mx-forgot-overlay"); hide("mx-reset-overlay");
        stopResendCooldown();
    }

    // ------------------------------------------------------------------------
    // 6. Resend cooldown
    // ------------------------------------------------------------------------
    function startResendCooldown(btnId, seconds) {
        var btn = el(btnId);
        if (!btn) return;
        stopResendCooldown();
        resendSeconds = seconds || 30;
        btn.disabled = true;
        btn.textContent = "Resend in " + resendSeconds + "s";
        resendTimer = setInterval(function () {
            resendSeconds--;
            if (resendSeconds <= 0) {
                stopResendCooldown();
                btn.disabled = false;
                btn.textContent = "Resend code";
            } else {
                btn.textContent = "Resend in " + resendSeconds + "s";
            }
        }, 1000);
    }
    function stopResendCooldown() {
        if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
    }

    // ==========================================================================
    // 7. LOGIN  —  step 1: credentials verified on the server
    // ==========================================================================
    async function mxHandleLogin(username, password) {
        var portalSel = el("login-portal-type");
        var portalType = portalSel ? portalSel.value : "admin";
        var rememberEl = el("remember-me");
        var rememberMe = rememberEl ? rememberEl.checked : false;

        var submitBtn = document.querySelector('#login-form button[type="submit"]');

        if (!username || !password) {
            toast("Please enter both username and password.", "error");
            return;
        }

        busy(submitBtn, true, "Verifying…");
        try {
            var r = await postJson("/api/auth/login", { username: username, password: password });

            if (!r.ok) {
                toast((r.data && r.data.error) || "Invalid username or password.", "error");
                return;
            }

            pendingLogin = {
                userId: r.data.userId,
                portalType: portalType,
                username: username,
                rememberMe: rememberMe,
                sentTo: r.data.sentTo
            };

            var target = el("mx-otp-target");
            if (target) target.textContent = r.data.sentTo || "your inbox";
            var hint = el("mx-otp-hint");
            if (hint) hint.textContent = "Code expires in " + (r.data.expiresInMinutes || 10) + " minutes";

            clearCode("mx-otp-row");
            show("mx-otp-overlay");
            focusCode("mx-otp-row");
            startResendCooldown("mx-otp-resend", 30);
            toast("Verification code sent to " + (r.data.sentTo || "your email"), "success");
        } catch (err) {
            console.error("[Auth] login error:", err);
            toast("Could not reach the server. Check your connection.", "error");
        } finally {
            busy(submitBtn, false);
        }
    }

    // ==========================================================================
    // 8. LOGIN  —  step 2: verify the emailed code
    // ==========================================================================
    async function verifyOtp() {
        if (!pendingLogin) { hideAll(); return; }

        var code = readCode("mx-otp-row");
        if (code.length !== 6) {
            clearCode("mx-otp-row", true);
            focusCode("mx-otp-row");
            toast("Please enter all 6 digits.", "error");
            return;
        }

        var btn = el("mx-otp-verify");
        busy(btn, true, "Verifying…");
        try {
            var r = await postJson("/api/auth/verify-otp", {
                userId: pendingLogin.userId,
                code: code
            });

            if (!r.ok) {
                clearCode("mx-otp-row", true);
                focusCode("mx-otp-row");
                toast((r.data && r.data.error) || "Verification failed.", "error");
                return;
            }

            var user = r.data.user;
            var portalType = pendingLogin.portalType;

            // ---- role gates (same rules as before) ----
            if (portalType === "admin" && user.role !== "Admin") {
                toast("Access Denied: This portal is reserved for Administrators.", "error");
                hideAll(); pendingLogin = null;
                return;
            }
            if (portalType === "staff" && user.role === "Admin") {
                toast("Access Denied: Administrators must use the Admin Portal.", "error");
                hideAll(); pendingLogin = null;
                return;
            }

            // ---- establish session ----
            currentUser = user;                                   // global from app.js
            sessionStorage.setItem("medastrax_current_user", JSON.stringify(user));

            if (pendingLogin.rememberMe) {
                localStorage.setItem("medastrax_remembered_user", JSON.stringify(user));
                localStorage.setItem("medastrax_remember_username_" + portalType, pendingLogin.username);
                localStorage.setItem("medastrax_remember_checkbox_" + portalType, "true");
            } else {
                localStorage.removeItem("medastrax_remembered_user");
                localStorage.removeItem("medastrax_remember_username_" + portalType);
                localStorage.removeItem("medastrax_remember_checkbox_" + portalType);
            }

            hideAll();
            pendingLogin = null;

            if (typeof db !== "undefined" && db.logActivity) {
                db.logActivity(user.fullname + " logged into the " + portalType + " portal.", "success");
            }
            if (typeof setupWorkspace === "function") setupWorkspace();
            toast("Welcome back, " + user.fullname + "!", "success");
        } catch (err) {
            console.error("[Auth] verify error:", err);
            toast("Could not reach the server. Please try again.", "error");
        } finally {
            busy(btn, false);
        }
    }

    async function resendOtp() {
        if (!pendingLogin) return;
        var btn = el("mx-otp-resend");
        if (btn) btn.disabled = true;
        try {
            var r = await postJson("/api/auth/resend-otp", { userId: pendingLogin.userId });
            if (r.ok) {
                clearCode("mx-otp-row");
                focusCode("mx-otp-row");
                toast("A new code was sent to " + (r.data.sentTo || "your email"), "success");
                startResendCooldown("mx-otp-resend", 30);
            } else {
                toast((r.data && r.data.error) || "Could not resend the code.", "error");
                if (btn) btn.disabled = false;
            }
        } catch (err) {
            toast("Could not reach the server.", "error");
            if (btn) btn.disabled = false;
        }
    }

    function backToLogin() {
        hideAll();
        pendingLogin = null;
        var p = el("password");
        if (p) { p.value = ""; p.focus(); }
    }

    // ==========================================================================
    // 9. FORGOT PASSWORD
    // ==========================================================================
    var resetIdentifier = "";

    function openForgot() {
        var input = el("mx-forgot-id");
        var loginUser = el("username");
        if (input) input.value = loginUser && loginUser.value ? loginUser.value.trim() : "";
        show("mx-forgot-overlay");
        setTimeout(function () { if (input) input.focus(); }, 120);
    }

    async function sendResetCode() {
        var input = el("mx-forgot-id");
        var identifier = input ? input.value.trim() : "";
        if (!identifier) {
            toast("Please enter your username or email.", "error");
            if (input) input.focus();
            return;
        }

        var btn = el("mx-forgot-send");
        busy(btn, true, "Sending…");
        try {
            var r = await postJson("/api/auth/forgot-password", { identifier: identifier });
            // Server always replies success — it never reveals whether the account exists.
            resetIdentifier = identifier;
            hide("mx-forgot-overlay");

            var target = el("mx-reset-target");
            if (target) target.textContent = "the email on file for " + identifier;

            clearCode("mx-reset-row");
            var np = el("mx-reset-new"); if (np) np.value = "";
            var cp = el("mx-reset-confirm"); if (cp) cp.value = "";

            show("mx-reset-overlay");
            focusCode("mx-reset-row");
            startResendCooldown("mx-reset-resend", 30);
            toast((r.data && r.data.message) || "If that account exists, a reset code has been emailed.", "info");
        } catch (err) {
            toast("Could not reach the server.", "error");
        } finally {
            busy(btn, false);
        }
    }

    async function submitReset() {
        var code = readCode("mx-reset-row");
        var np = el("mx-reset-new");
        var cp = el("mx-reset-confirm");
        var newPass = np ? np.value : "";
        var confirmPass = cp ? cp.value : "";

        if (code.length !== 6) {
            clearCode("mx-reset-row", true);
            focusCode("mx-reset-row");
            toast("Please enter all 6 digits of the reset code.", "error");
            return;
        }
        if (newPass.length < 8) {
            toast("Password must be at least 8 characters.", "error");
            if (np) np.focus();
            return;
        }
        if (newPass !== confirmPass) {
            toast("Passwords do not match.", "error");
            if (cp) { cp.value = ""; cp.focus(); }
            return;
        }

        var btn = el("mx-reset-submit");
        busy(btn, true, "Updating…");
        try {
            var r = await postJson("/api/auth/reset-password", {
                identifier: resetIdentifier,
                code: code,
                newPassword: newPass
            });

            if (!r.ok) {
                clearCode("mx-reset-row", true);
                focusCode("mx-reset-row");
                toast((r.data && r.data.error) || "Reset failed.", "error");
                return;
            }

            hideAll();
            resetIdentifier = "";
            toast("Password updated. You can sign in now.", "success");

            var u = el("username"), p = el("password");
            if (p) p.value = "";
            if (u && !u.value) u.focus(); else if (p) p.focus();
        } catch (err) {
            toast("Could not reach the server.", "error");
        } finally {
            busy(btn, false);
        }
    }

    async function resendReset() {
        if (!resetIdentifier) return;
        var btn = el("mx-reset-resend");
        if (btn) btn.disabled = true;
        try {
            await postJson("/api/auth/forgot-password", { identifier: resetIdentifier });
            clearCode("mx-reset-row");
            focusCode("mx-reset-row");
            toast("A new reset code has been emailed.", "success");
            startResendCooldown("mx-reset-resend", 30);
        } catch (err) {
            toast("Could not reach the server.", "error");
            if (btn) btn.disabled = false;
        }
    }

    // ==========================================================================
    // 10. Settings → Change Password (routed through the server + email receipt)
    // ==========================================================================
    function rewireChangePassword() {
        var oldForm = el("change-password-form");
        if (!oldForm || oldForm.dataset.mxWired === "1") return;

        // Cloning strips app.js's client-side listener without touching app.js.
        var form = oldForm.cloneNode(true);
        oldForm.parentNode.replaceChild(form, oldForm);
        form.dataset.mxWired = "1";

        form.addEventListener("submit", async function (e) {
            e.preventDefault();

            var curEl = el("settings-current-pass");
            var newEl = el("settings-new-pass");
            var conEl = el("settings-confirm-pass");
            var current = curEl ? curEl.value : "";
            var next = newEl ? newEl.value : "";
            var confirm = conEl ? conEl.value : "";

            if (!current || !next || !confirm) {
                toast("Please fill in all password fields.", "error");
                return;
            }
            if (next.length < 8) {
                toast("New password must be at least 8 characters.", "error");
                return;
            }
            if (next !== confirm) {
                toast("Confirm password does not match the new password.", "error");
                return;
            }
            if (next === current) {
                toast("New password must be different from the current one.", "error");
                return;
            }
            if (typeof currentUser === "undefined" || !currentUser) {
                toast("Session expired. Please sign in again.", "error");
                return;
            }

            var btn = form.querySelector('button[type="submit"]');
            busy(btn, true, "Updating…");
            try {
                var r = await postJson("/api/auth/change-password", {
                    userId: currentUser.id,
                    currentPassword: current,
                    newPassword: next
                });

                if (!r.ok) {
                    toast((r.data && r.data.error) || "Could not change the password.", "error");
                    return;
                }

                // Keep the cached session object in step with the server.
                currentUser.password = next;
                sessionStorage.setItem("medastrax_current_user", JSON.stringify(currentUser));
                if (localStorage.getItem("medastrax_remembered_user")) {
                    localStorage.setItem("medastrax_remembered_user", JSON.stringify(currentUser));
                }

                form.reset();
                toast("Password updated. A confirmation email has been sent.", "success");
                if (typeof db !== "undefined" && db.logActivity) {
                    db.logActivity(currentUser.fullname + " changed their workspace password.", "success");
                }
            } catch (err) {
                toast("Could not reach the server.", "error");
            } finally {
                busy(btn, false);
            }
        });
    }

    // ==========================================================================
    // 11. "Forgot password?" link on the login card
    // ==========================================================================
    function injectForgotLink() {
        if (el("mx-forgot-link")) return;
        var form = el("login-form");
        if (!form) return;
        var anchor = form.querySelector(".remember-me-group") ||
            form.querySelector('button[type="submit"]');
        if (!anchor) return;

        var wrap = document.createElement("div");
        wrap.className = "mx-forgot-wrap";
        wrap.innerHTML = '<button type="button" class="mx-link" id="mx-forgot-link">Forgot password?</button>';

        if (anchor.classList.contains("remember-me-group")) {
            anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
        } else {
            anchor.parentNode.insertBefore(wrap, anchor);
        }
        el("mx-forgot-link").addEventListener("click", openForgot);
    }

    // ==========================================================================
    // 12. Wire everything up
    // ==========================================================================
    function init() {
        injectStyles();
        injectMarkup();
        injectForgotLink();

        wireCodeRow("mx-otp-row", verifyOtp);
        wireCodeRow("mx-reset-row", null);

        var bind = function (id, fn) { var b = el(id); if (b) b.addEventListener("click", fn); };

        bind("mx-otp-verify", verifyOtp);
        bind("mx-otp-resend", resendOtp);
        bind("mx-otp-back", backToLogin);

        bind("mx-forgot-send", sendResetCode);
        bind("mx-forgot-cancel", function () { hide("mx-forgot-overlay"); });

        bind("mx-reset-submit", submitReset);
        bind("mx-reset-resend", resendReset);
        bind("mx-reset-cancel", function () { hideAll(); resetIdentifier = ""; });

        // Enter key inside the reset password fields
        ["mx-reset-new", "mx-reset-confirm"].forEach(function (id) {
            var f = el(id);
            if (f) f.addEventListener("keydown", function (e) {
                if (e.key === "Enter") { e.preventDefault(); submitReset(); }
            });
        });
        var fid = el("mx-forgot-id");
        if (fid) fid.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { e.preventDefault(); sendResetCode(); }
        });

        // Esc closes whichever overlay is open
        document.addEventListener("keydown", function (e) {
            if (e.key !== "Escape") return;
            if (el("mx-reset-overlay") && !el("mx-reset-overlay").classList.contains("hidden")) {
                hideAll(); resetIdentifier = "";
            } else if (el("mx-forgot-overlay") && !el("mx-forgot-overlay").classList.contains("hidden")) {
                hide("mx-forgot-overlay");
            } else if (el("mx-otp-overlay") && !el("mx-otp-overlay").classList.contains("hidden")) {
                backToLogin();
            }
        });

        // Take over login (app.js declared handleLogin as a global function).
        window.handleLogin = mxHandleLogin;

        // Settings tab markup exists on load, so this can run immediately.
        rewireChangePassword();

        console.log("%c[MedAstraX] Auth UI ready — OTP login + password reset active",
            "color:#00a896;font-weight:600");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    // Expose a few helpers for debugging / manual calls
    window.mxAuth = {
        login: mxHandleLogin,
        verifyOtp: verifyOtp,
        openForgotPassword: openForgot,
        closeAll: hideAll
    };
})();