/**
 * ==========================================================================
 * MEDASTRAX MEETING EXTRAS  —  Screen recording + Recordings library
 * ==========================================================================
 * Load AFTER app.js:
 *     <script src="app.js?v=2.5"></script>
 *     <script src="auth-ui.js?v=1.1"></script>
 *     <script src="meeting-extras.js?v=1.0"></script>
 *
 * WHERE RECORDINGS LIVE
 * ---------------------
 * The video blob is stored in this browser's IndexedDB; only lightweight
 * metadata (title, room, duration, size) goes to Postgres.
 *
 * Why: a 10-minute 720p capture is roughly 60-120 MB. Neon's free tier is
 * 512 MB total, so a handful of recordings would fill the whole database.
 * Render's disk is ephemeral, so writing files there loses them on redeploy.
 *
 * Consequence to be aware of: a recording plays back on the machine that
 * made it. Other people see the entry in the Recordings tab but cannot
 * stream it — they are prompted to ask the recorder for the file. Use the
 * Download button and share it, or wire up object storage (S3 / Cloudflare
 * R2 / Backblaze B2) later for true shared playback.
 * ==========================================================================
 */

(function () {
    "use strict";

    // ------------------------------------------------------------------------
    // IndexedDB — local blob store
    // ------------------------------------------------------------------------
    const DB_NAME = "medastrax_recordings";
    const STORE = "blobs";
    let idbPromise = null;

    function openDb() {
        if (idbPromise) return idbPromise;
        idbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return idbPromise;
    }

    async function idbPut(id, blob, meta) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readwrite");
            // Keep the metadata with the blob: if the API write fails (server not yet
            // redeployed, offline, 500) the recording must still appear in the list.
            tx.objectStore(STORE).put({ blob: blob, meta: meta || null }, id);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    async function idbGetAll() {
        const db = await openDb();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE, "readonly");
            const store = tx.objectStore(STORE);
            const keysReq = store.getAllKeys();
            const valsReq = store.getAll();
            tx.oncomplete = () => {
                const out = [];
                (keysReq.result || []).forEach((k, i) => {
                    const v = (valsReq.result || [])[i];
                    if (!v) return;
                    out.push({ id: k, blob: v.blob || v, meta: v.meta || null });
                });
                resolve(out);
            };
            tx.onerror = () => resolve([]);
        });
    }

    async function idbGet(id) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, "readonly");
            const r = tx.objectStore(STORE).get(id);
            r.onsuccess = () => {
                const v = r.result;
                if (!v) return resolve(null);
                resolve(v.blob || v);   // tolerate entries written by the older format
            };
            r.onerror = () => reject(r.error);
        });
    }

    async function idbDelete(id) {
        const db = await openDb();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).delete(id);
            tx.oncomplete = resolve;
            tx.onerror = resolve;
        });
    }

    async function idbKeys() {
        const db = await openDb();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE, "readonly");
            const r = tx.objectStore(STORE).getAllKeys();
            r.onsuccess = () => resolve(r.result || []);
            r.onerror = () => resolve([]);
        });
    }

    // ------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------
    function el(id) { return document.getElementById(id); }

    function toast(msg, type) {
        if (typeof showToast === "function") showToast(msg, type || "info");
        else console.log("[Recording]", msg);
    }

    function icons() {
        if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons();
    }

    function fmtBytes(b) {
        if (!b) return "—";
        if (b < 1024 * 1024) return (b / 1024).toFixed(0) + " KB";
        if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + " MB";
        return (b / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    }

    function fmtDuration(sec) {
        const s = Math.max(1, parseInt(sec) || 0);
        const m = Math.floor(s / 60);
        const r = s % 60;
        if (m === 0) return `${r}s`;
        if (r === 0) return `${m}min`;
        return `${m}min ${r}s`;
    }

    function pickMimeType() {
        const candidates = [
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp8,opus",
            "video/webm",
            "video/mp4"
        ];
        for (const c of candidates) {
            if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
        }
        return "";
    }

    // ------------------------------------------------------------------------
    // Recording state
    // ------------------------------------------------------------------------
    let recorder = null;
    let chunks = [];
    let recStream = null;      // combined stream handed to MediaRecorder
    let displayStream = null;  // raw screen capture (kept so we can stop tracks)
    let micStream = null;
    let audioCtx = null;
    let startedAt = 0;
    let timerInterval = null;
    let recordingRoom = null;
    let recordingTitle = "";

    function isRecording() {
        return !!recorder && recorder.state === "recording";
    }

    /**
     * Mixes the screen's own audio (if the user shared a tab with sound) together
     * with the microphone, so the recording captures both sides of the call.
     */
    function buildMixedStream(display, mic) {
        const videoTrack = display.getVideoTracks()[0];
        const displayAudio = display.getAudioTracks();
        const micAudio = mic ? mic.getAudioTracks() : [];

        if (displayAudio.length === 0 && micAudio.length === 0) {
            return new MediaStream([videoTrack]);
        }
        if (displayAudio.length === 0) {
            return new MediaStream([videoTrack, micAudio[0]]);
        }
        if (micAudio.length === 0) {
            return new MediaStream([videoTrack, displayAudio[0]]);
        }

        // Both present: mix through a Web Audio graph.
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const dest = audioCtx.createMediaStreamDestination();
        audioCtx.createMediaStreamSource(new MediaStream([displayAudio[0]])).connect(dest);
        audioCtx.createMediaStreamSource(new MediaStream([micAudio[0]])).connect(dest);
        return new MediaStream([videoTrack, dest.stream.getAudioTracks()[0]]);
    }

    function updateRecordButton() {
        const btn = el("btn-active-record");
        if (!btn) return;
        if (isRecording()) {
            const secs = Math.round((Date.now() - startedAt) / 1000);
            btn.style.backgroundColor = "#ef4444";
            btn.style.color = "#fff";
            btn.title = "Stop recording";
            btn.innerHTML =
                `<span style="display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;">` +
                `<span style="width:8px;height:8px;border-radius:50%;background:#fff;"></span>` +
                `${fmtDuration(secs)}</span>`;
        } else {
            btn.style.backgroundColor = "var(--bg-primary)";
            btn.style.color = "var(--text-primary)";
            btn.title = "Record meeting";
            btn.innerHTML = `<i data-lucide="circle-dot" style="width:18px;height:18px;"></i>`;
            icons();
        }
    }

    async function startRecording() {
        if (isRecording()) return;

        if (!window.MediaRecorder) {
            toast("This browser cannot record. Try Chrome or Edge.", "error");
            return;
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            toast("Screen capture is unavailable in this browser.", "error");
            return;
        }

        try {
            // Capturing the screen (rather than individual peer streams) records
            // everyone's tiles exactly as they appear, without canvas compositing.
            displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: { frameRate: 30 },
                audio: true
            });
        } catch (err) {
            if (err && err.name === "NotAllowedError") {
                toast("Recording cancelled.", "info");
            } else {
                toast("Could not start screen capture: " + err.message, "error");
            }
            return;
        }

        // Microphone is best-effort: reuse the call's stream if we already have it.
        try {
            if (typeof localStream !== "undefined" && localStream && localStream.getAudioTracks().length) {
                micStream = new MediaStream([localStream.getAudioTracks()[0]]);
            } else {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
        } catch (err) {
            micStream = null;
            console.warn("[Recording] microphone unavailable:", err.message);
        }

        recStream = buildMixedStream(displayStream, micStream);

        const mimeType = pickMimeType();
        try {
            recorder = new MediaRecorder(recStream, mimeType ? { mimeType } : undefined);
        } catch (err) {
            toast("Recorder could not start: " + err.message, "error");
            cleanupStreams();
            return;
        }

        chunks = [];
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.onerror = (e) => {
            console.error("[Recording] recorder error:", e.error);
            toast("Recording error: " + (e.error && e.error.message), "error");
        };
        recorder.onstop = finalizeRecording;

        // If the user hits the browser's own "Stop sharing" bar, end cleanly.
        displayStream.getVideoTracks()[0].onended = () => {
            if (isRecording()) stopRecording();
        };

        recorder.start(1000); // 1s chunks so a crash still leaves usable data
        startedAt = Date.now();
        recordingRoom = (typeof currentRoom !== "undefined" && currentRoom) || "room";
        recordingTitle = (typeof currentMeetingTitle !== "undefined" && currentMeetingTitle) || "Meeting";

        timerInterval = setInterval(updateRecordButton, 1000);
        updateRecordButton();
        toast("Recording started.", "success");
    }

    function stopRecording() {
        if (!recorder) return;
        if (recorder.state !== "inactive") recorder.stop();
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    }

    function cleanupStreams() {
        [displayStream, micStream].forEach((s) => {
            if (s) s.getTracks().forEach((t) => {
                // Never kill the live call's microphone track.
                const isCallTrack = typeof localStream !== "undefined" && localStream &&
                    localStream.getTracks().indexOf(t) !== -1;
                if (!isCallTrack) t.stop();
            });
        });
        displayStream = null;
        micStream = null;
        recStream = null;
        if (audioCtx) { try { audioCtx.close(); } catch (e) { } audioCtx = null; }
    }

    async function finalizeRecording() {
        const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const type = (recorder && recorder.mimeType) || "video/webm";
        const blob = new Blob(chunks, { type });
        chunks = [];
        recorder = null;
        cleanupStreams();
        updateRecordButton();

        if (!blob.size) {
            toast("Recording was empty — nothing saved.", "error");
            return;
        }

        const now = new Date();
        const id = "rec-" + Date.now();
        const meta = {
            id: id,
            userId: (typeof currentUser !== "undefined" && currentUser) ? currentUser.id : "unknown",
            recordedBy: (typeof currentUser !== "undefined" && currentUser)
                ? (currentUser.fullname || currentUser.username).replace(/\s*\(.*\)\s*/g, "")
                : "Unknown",
            title: recordingTitle,
            roomCode: recordingRoom,
            date: now.toISOString().split("T")[0],
            time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            durationSec: durationSec,
            sizeBytes: blob.size,
            mimeType: type,
            timestamp: now.toISOString()
        };

        try {
            await idbPut(id, blob, meta);
        } catch (err) {
            console.error("[Recording] IndexedDB write failed:", err);
            // Storage failed, so at least hand the file to the user directly.
            downloadBlob(blob, `${meta.title}-${meta.date}.webm`);
            toast("Could not store locally — file downloaded instead.", "warning");
            return;
        }

        try {
            await fetch("/api/recordings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(meta)
            });
        } catch (err) {
            console.warn("[Recording] metadata save failed (entry still stored locally):", err.message);
        }

        toast(`Recording saved (${fmtDuration(durationSec)}, ${fmtBytes(blob.size)}). See the Recordings tab.`, "success");

        // Jump straight to the Recordings tab so the new entry is visible.
        const recBtn = el("filter-recordings-meetings");
        if (recBtn) recBtn.click();
        else if (typeof renderScheduledMeetings === "function") renderScheduledMeetings();
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    // ------------------------------------------------------------------------
    // Recordings tab
    // ------------------------------------------------------------------------
    async function renderRecordingsList(container) {
        if (!container) return;
        container.innerHTML =
            `<div class="meetings-empty-sidebar"><p>Loading recordings…</p></div>`;

        let list = [];
        try {
            const res = await fetch("/api/recordings?_=" + Date.now());
            if (res.ok) list = await res.json();
            else console.warn("[Recording] API returned", res.status);
        } catch (err) {
            console.warn("[Recording] fetch failed:", err.message);
        }

        // Merge in locally-stored recordings the server never heard about.
        const localEntries = await idbGetAll();
        const seen = {};
        list.forEach(r => { seen[r.id] = true; });
        localEntries.forEach(e => {
            if (!seen[e.id] && e.meta) { list.push(e.meta); seen[e.id] = true; }
        });
        list.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

        const localIds = localEntries.map(e => e.id);
        console.log(`[Recording] ${list.length} entr(ies): ${localIds.length} playable on this device`);

        if (!list.length) {
            container.innerHTML = `
        <div class="meetings-empty-sidebar">
          <i data-lucide="video"></i>
          <p>No meeting recordings yet.</p>
          <span style="font-size:11px;color:var(--text-muted);">
            Start a call and press the record button in the controls bar.
          </span>
        </div>`;
            icons();
            return;
        }

        container.innerHTML = "";
        const wrap = document.createElement("div");
        wrap.className = "history-timeline-container";

        list.forEach((r) => {
            const hasBlob = localIds.indexOf(r.id) !== -1;
            const card = document.createElement("div");
            card.className = "history-meeting-card";
            card.innerHTML = `
        <div class="history-card-time">${r.time || ""} &middot; ${r.date || ""}</div>
        <h4 class="history-card-title">${r.title || "Meeting"}</h4>
        <div class="history-card-footer">
          <span>By <strong>${r.recordedBy || "—"}</strong></span>
          <span class="history-duration-badge">
            <i data-lucide="clock" style="width:12px;height:12px;"></i>
            ${fmtDuration(r.durationSec)} &middot; ${fmtBytes(r.sizeBytes)}
          </span>
        </div>
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
          ${hasBlob ? `
            <button type="button" class="btn btn-primary rec-play" data-id="${r.id}"
              style="padding:4px 10px;font-size:11px;">
              <i data-lucide="play" style="width:11px;height:11px;"></i> Play
            </button>
            <button type="button" class="btn btn-secondary rec-dl" data-id="${r.id}" data-title="${r.title || 'meeting'}"
              style="padding:4px 10px;font-size:11px;">
              <i data-lucide="download" style="width:11px;height:11px;"></i> Save
            </button>
            <button type="button" class="btn btn-danger rec-del" data-id="${r.id}"
              style="padding:4px 10px;font-size:11px;">
              <i data-lucide="trash-2" style="width:11px;height:11px;"></i>
            </button>
          ` : `
            <span style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:4px;">
              <i data-lucide="hard-drive" style="width:12px;height:12px;"></i>
              Stored on ${r.recordedBy || "another"}'s device
            </span>
          `}
        </div>`;
            wrap.appendChild(card);
        });

        container.appendChild(wrap);
        icons();

        container.querySelectorAll(".rec-play").forEach((b) => {
            b.onclick = () => playRecording(b.getAttribute("data-id"));
        });
        container.querySelectorAll(".rec-dl").forEach((b) => {
            b.onclick = async () => {
                const blob = await idbGet(b.getAttribute("data-id"));
                if (blob) downloadBlob(blob, `${b.getAttribute("data-title")}.webm`);
                else toast("File not found on this device.", "error");
            };
        });
        container.querySelectorAll(".rec-del").forEach((b) => {
            b.onclick = async () => {
                if (!confirm("Delete this recording from this device and the list?")) return;
                const id = b.getAttribute("data-id");
                await idbDelete(id);
                try { await fetch(`/api/recordings/${id}`, { method: "DELETE" }); } catch (e) { }
                toast("Recording deleted.", "info");
                renderRecordingsList(container);
            };
        });
    }

    async function playRecording(id) {
        const blob = await idbGet(id);
        if (!blob) { toast("File not found on this device.", "error"); return; }

        const url = URL.createObjectURL(blob);
        const overlay = document.createElement("div");
        overlay.style.cssText =
            "position:fixed;inset:0;background:rgba(15,23,42,.9);backdrop-filter:blur(6px);" +
            "z-index:100000;display:flex;align-items:center;justify-content:center;padding:24px;";
        overlay.innerHTML = `
      <div style="width:100%;max-width:900px;background:#0f172a;border:1px solid #334155;
                  border-radius:12px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.6);">
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:12px 16px;border-bottom:1px solid #334155;">
          <strong style="color:#fff;font-size:14px;">Meeting recording</strong>
          <button type="button" style="background:none;border:none;color:#94a3b8;
                  font-size:24px;cursor:pointer;line-height:1;">&times;</button>
        </div>
        <video controls autoplay style="width:100%;max-height:70vh;background:#000;display:block;"></video>
      </div>`;
        overlay.querySelector("video").src = url;

        const close = () => {
            URL.revokeObjectURL(url);
            overlay.remove();
            document.removeEventListener("keydown", onKey);
        };
        const onKey = (e) => { if (e.key === "Escape") close(); };

        overlay.querySelector("button").onclick = close;
        overlay.onclick = (e) => { if (e.target === overlay) close(); };
        document.addEventListener("keydown", onKey);
        document.body.appendChild(overlay);
    }

    // ------------------------------------------------------------------------
    // Wiring
    // ------------------------------------------------------------------------
    function injectControls() {
        if (el("btn-active-record")) return;

        // The share-screen handler existed in app.js but its button was never in the
        // markup, so screen sharing was unreachable. Add both buttons here.
        const raiseHand = el("btn-active-raise-hand");
        if (!raiseHand || !raiseHand.parentNode) return;

        const style =
            "background-color: var(--bg-primary); border-radius: 4px; " +
            "border: 1px solid var(--border-color); color: var(--text-primary); " +
            "min-width: 38px; height: 38px; display: flex; align-items: center; " +
            "justify-content: center; cursor: pointer; padding: 0 8px;";

        const share = document.createElement("button");
        share.type = "button";
        share.id = "btn-active-share-screen";
        share.className = "btn-icon";
        share.title = "Share screen";
        share.setAttribute("style", style);
        share.innerHTML = `<i data-lucide="monitor-up" style="width:18px;height:18px;"></i>`;

        const rec = document.createElement("button");
        rec.type = "button";
        rec.id = "btn-active-record";
        rec.className = "btn-icon";
        rec.title = "Record meeting";
        rec.setAttribute("style", style);
        rec.innerHTML = `<i data-lucide="circle-dot" style="width:18px;height:18px;"></i>`;

        raiseHand.parentNode.insertBefore(share, raiseHand);
        raiseHand.parentNode.insertBefore(rec, raiseHand);

        // app.js binds btn-active-share-screen inside renderMeetingsTab; if that
        // already ran, wire it up now so the first click works.
        if (!share.onclick) {
            share.onclick = () => {
                const hidden = el("btn-share-screen");
                if (hidden) hidden.click();
                const sharing = (typeof isScreenSharing !== "undefined") && isScreenSharing;
                share.style.backgroundColor = sharing ? "#10b981" : "var(--bg-primary)";
                share.style.color = sharing ? "#fff" : "var(--text-primary)";
            };
        }

        rec.onclick = () => { isRecording() ? stopRecording() : startRecording(); };

        icons();
    }

    function bindRecordingsTab() {
        const btn = el("filter-recordings-meetings");
        if (!btn || btn.dataset.mxBound === "1") return;
        btn.dataset.mxBound = "1";
        btn.onclick = () => {
            document.querySelectorAll(".meetings-filter-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            if (typeof activeMeetingFilterTab !== "undefined") activeMeetingFilterTab = "recordings";
            window.mxRecordings.render();
        };
    }

    function init() {
        bindRecordingsTab();

        // The meetings tab is rendered lazily, so watch for the controls bar appearing.
        const obs = new MutationObserver(() => { injectControls(); bindRecordingsTab(); });
        obs.observe(document.body, { childList: true, subtree: true });
        injectControls();

        // Warn before navigating away mid-recording.
        window.addEventListener("beforeunload", (e) => {
            if (isRecording()) {
                e.preventDefault();
                e.returnValue = "A recording is still running. Leave anyway?";
                return e.returnValue;
            }
        });

        console.log("%c[MedAstraX] Meeting extras ready — screen share + recording",
            "color:#00a896;font-weight:600");
    }

    window.mxRecordings = {
        render: function () {
            const container = el("meetings-sidebar-list");
            return renderRecordingsList(container);
        },
        start: startRecording,
        stop: stopRecording,
        isRecording: isRecording
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();

/**
 * ==========================================================================
 * PRE-JOIN PREVIEW  +  DRAGGABLE PICTURE-IN-PICTURE
 * ==========================================================================
 * Every join path in app.js funnels through the hidden #btn-join-meeting, so a
 * single capture-phase listener on that button is enough to insert a Google
 * Meet style "ready to join?" step in front of all of them.
 * ==========================================================================
 */
(function () {
    "use strict";

    function el(id) { return document.getElementById(id); }
    function icons() { if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons(); }
    function toast(m, t) { if (typeof showToast === "function") showToast(m, t || "info"); }

    let previewStream = null;
    let wantCam = true;
    let wantMic = true;
    let confirmed = false;   // set just before we re-dispatch the real click

    // ------------------------------------------------------------------ panel
    function buildPanel() {
        if (el("mx-prejoin")) return el("mx-prejoin");

        const host = document.querySelector(".meetings-main-content");
        if (!host) return null;

        const panel = document.createElement("div");
        panel.id = "mx-prejoin";
        panel.className = "hidden";
        panel.style.cssText =
            "position:absolute;inset:0;z-index:60;background:var(--bg-primary);" +
            "display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto;";

        panel.innerHTML = `
      <div style="width:100%;max-width:640px;display:flex;flex-direction:column;gap:18px;">
        <div style="text-align:center;">
          <h2 style="margin:0 0 4px;font-size:1.4rem;color:var(--text-primary);">Ready to join?</h2>
          <p style="margin:0;font-size:.9rem;color:var(--text-secondary);">
            Room <strong id="mx-pj-room" style="color:var(--accent-color);"></strong>
          </p>
        </div>

        <div style="position:relative;width:100%;aspect-ratio:16/9;background:#0f172a;
                    border:1px solid var(--border-color);border-radius:12px;overflow:hidden;">
          <video id="mx-pj-video" autoplay playsinline muted
                 style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1);"></video>

          <div id="mx-pj-avatar" class="hidden"
               style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                      background:#1e293b;">
            <div id="mx-pj-initial"
                 style="width:96px;height:96px;border-radius:50%;display:flex;align-items:center;
                        justify-content:center;font-size:2.2rem;font-weight:700;color:#fff;
                        background:linear-gradient(135deg,var(--accent-secondary),var(--accent-color));"></div>
          </div>

          <div id="mx-pj-error" class="hidden"
               style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
                      justify-content:center;background:#1e293b;color:#94a3b8;text-align:center;padding:20px;">
            <i data-lucide="video-off" style="width:30px;height:30px;color:#ef4444;margin-bottom:10px;"></i>
            <p style="margin:0;color:#fff;font-weight:600;font-size:14px;">Camera unavailable</p>
            <p style="margin:4px 0 0;font-size:12px;">You can still join with audio only.</p>
          </div>

          <div style="position:absolute;bottom:14px;left:50%;transform:translateX(-50%);
                      display:flex;gap:12px;">
            <button type="button" id="mx-pj-mic" title="Toggle microphone"
              style="width:46px;height:46px;border-radius:50%;border:none;cursor:pointer;
                     display:flex;align-items:center;justify-content:center;
                     background:rgba(15,23,42,.85);color:#fff;">
              <i data-lucide="mic" style="width:19px;height:19px;"></i>
            </button>
            <button type="button" id="mx-pj-cam" title="Toggle camera"
              style="width:46px;height:46px;border-radius:50%;border:none;cursor:pointer;
                     display:flex;align-items:center;justify-content:center;
                     background:rgba(15,23,42,.85);color:#fff;">
              <i data-lucide="video" style="width:19px;height:19px;"></i>
            </button>
          </div>
        </div>

        <div style="display:flex;gap:12px;justify-content:center;">
          <button type="button" id="mx-pj-cancel" class="btn btn-secondary" style="min-width:120px;">Cancel</button>
          <button type="button" id="mx-pj-join" class="btn btn-primary glow-btn" style="min-width:160px;">
            <i data-lucide="video"></i> Join now
          </button>
        </div>
      </div>`;

        if (getComputedStyle(host).position === "static") host.style.position = "relative";
        host.appendChild(panel);

        el("mx-pj-mic").onclick = () => { wantMic = !wantMic; applyToggles(); };
        el("mx-pj-cam").onclick = () => { wantCam = !wantCam; applyToggles(); };
        el("mx-pj-cancel").onclick = closePanel;
        el("mx-pj-join").onclick = confirmJoin;

        icons();
        return panel;
    }

    async function applyToggles() {
        const mic = el("mx-pj-mic"), cam = el("mx-pj-cam"), avatar = el("mx-pj-avatar");

        if (previewStream) {
            previewStream.getAudioTracks().forEach(t => t.enabled = wantMic);

            // enabled = false only blanks the frames; the capture device stays open and
            // the camera indicator light stays on. Stop the track to release hardware.
            if (!wantCam) {
                previewStream.getVideoTracks().forEach(tr => {
                    try { tr.stop(); } catch (e) { }
                    previewStream.removeTrack(tr);
                });
            } else if (previewStream.getVideoTracks().length === 0) {
                try {
                    const fresh = await navigator.mediaDevices.getUserMedia({ video: true });
                    previewStream.addTrack(fresh.getVideoTracks()[0]);
                    const v = el("mx-pj-video");
                    if (v) { v.srcObject = previewStream; v.play().catch(() => { }); }
                } catch (err) {
                    console.warn("[PreJoin] camera could not be re-opened:", err.message);
                }
            }
        }
        if (mic) {
            mic.style.background = wantMic ? "rgba(15,23,42,.85)" : "#ef4444";
            mic.innerHTML = `<i data-lucide="${wantMic ? "mic" : "mic-off"}" style="width:19px;height:19px;"></i>`;
        }
        if (cam) {
            cam.style.background = wantCam ? "rgba(15,23,42,.85)" : "#ef4444";
            cam.innerHTML = `<i data-lucide="${wantCam ? "video" : "video-off"}" style="width:19px;height:19px;"></i>`;
        }
        if (avatar) avatar.classList.toggle("hidden", wantCam);
        icons();
    }

    async function openPanel(room) {
        const panel = buildPanel();
        if (!panel) return false;

        el("mx-pj-room").textContent = room || "—";
        const name = (typeof currentUser !== "undefined" && currentUser)
            ? (currentUser.fullname || currentUser.username) : "U";
        el("mx-pj-initial").textContent = name.replace(/\s*\(.*\)\s*/g, "").trim().charAt(0).toUpperCase();

        el("mx-pj-error").classList.add("hidden");
        panel.classList.remove("hidden");

        // Reuse the call stream if one already exists (e.g. arriving from the lobby).
        if (typeof localStream !== "undefined" && localStream && localStream.getTracks().length) {
            previewStream = localStream;
        } else {
            try {
                previewStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            } catch (err) {
                console.warn("[PreJoin] camera/mic unavailable:", err.message);
                previewStream = null;
                el("mx-pj-error").classList.remove("hidden");
            }
        }

        const v = el("mx-pj-video");
        if (v && previewStream) {
            v.srcObject = previewStream;
            v.play().catch(() => { });
        }
        applyToggles();
        return true;
    }

    function closePanel() {
        const panel = el("mx-prejoin");
        if (panel) panel.classList.add("hidden");

        const v = el("mx-pj-video");
        if (v) v.srcObject = null;

        // Only tear the stream down if it is not already the live call's stream.
        const isCallStream = typeof localStream !== "undefined" && localStream === previewStream;
        if (previewStream && !isCallStream) {
            previewStream.getTracks().forEach(t => { try { t.stop(); } catch (e) { } });
        }
        previewStream = null;
    }

    function confirmJoin() {
        // Hand the already-open camera to the call so the device is not re-acquired.
        if (previewStream) {
            if (typeof localStream !== "undefined") localStream = previewStream;
            if (typeof isCamOn !== "undefined") isCamOn = wantCam;
            if (typeof isMicOn !== "undefined") isMicOn = wantMic;
            previewStream.getVideoTracks().forEach(t => t.enabled = wantCam);
            previewStream.getAudioTracks().forEach(t => t.enabled = wantMic);
        }
        previewStream = null;               // ownership transferred to the call
        const panel = el("mx-prejoin");
        if (panel) panel.classList.add("hidden");

        confirmed = true;
        const btn = el("btn-join-meeting");
        if (btn) btn.click();
        setTimeout(() => { confirmed = false; }, 1500);
    }

    // -------------------------------------------------------------- intercept
    function installInterceptor() {
        const btn = el("btn-join-meeting");
        if (!btn || btn.dataset.mxPrejoin === "1") return;
        btn.dataset.mxPrejoin = "1";

        // Registered before app.js assigns its onclick, so this listener runs first
        // and can cancel the direct join.
        btn.addEventListener("click", function (e) {
            if (confirmed) return;                       // second pass: let it through
            if (window.__mxSkipPrejoin) return;          // lobby already handled setup

            // Never react to a join that fires while nobody is signed in, or while the
            // login screen is up — that is how the preview used to appear on its own.
            if (typeof currentUser === "undefined" || !currentUser) return;
            const loginVisible = el("login-container") && !el("login-container").classList.contains("hidden");
            if (loginVisible) return;

            const roomInput = el("meeting-room-input");
            const room = roomInput ? roomInput.value.trim() : "";
            if (!room) return;                           // app.js will show its own error
            if (typeof currentRoom !== "undefined" && currentRoom) return;  // already in a call

            e.preventDefault();
            e.stopImmediatePropagation();
            openPanel(room);
        }, true);
    }

    // -------------------------------------------------------- draggable PiP
    function makePipDraggable() {
        const pip = el("meeting-pip-widget");
        if (!pip || pip.dataset.mxDrag === "1") return;
        pip.dataset.mxDrag = "1";

        const header = pip.querySelector("div");
        if (!header) return;
        header.style.cursor = "move";
        header.title = "Drag to move";

        let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;

        const down = (e) => {
            if (e.target.closest("button")) return;      // let the icon buttons work
            const p = e.touches ? e.touches[0] : e;
            const r = pip.getBoundingClientRect();
            // Switch from bottom/right anchoring to absolute left/top before moving.
            pip.style.left = r.left + "px";
            pip.style.top = r.top + "px";
            pip.style.right = "auto";
            pip.style.bottom = "auto";
            dragging = true; sx = p.clientX; sy = p.clientY; sl = r.left; st = r.top;
            document.body.style.userSelect = "none";
            e.preventDefault();
        };

        const move = (e) => {
            if (!dragging) return;
            const p = e.touches ? e.touches[0] : e;
            const w = pip.offsetWidth, h = pip.offsetHeight;
            let L = sl + (p.clientX - sx);
            let T = st + (p.clientY - sy);
            L = Math.max(4, Math.min(window.innerWidth - w - 4, L));
            T = Math.max(4, Math.min(window.innerHeight - h - 4, T));
            pip.style.left = L + "px";
            pip.style.top = T + "px";
        };

        const up = () => { dragging = false; document.body.style.userSelect = ""; };

        header.addEventListener("mousedown", down);
        header.addEventListener("touchstart", down, { passive: false });
        document.addEventListener("mousemove", move);
        document.addEventListener("touchmove", move, { passive: false });
        document.addEventListener("mouseup", up);
        document.addEventListener("touchend", up);

        // Add an explicit "leave call" control to the mini window.
        const btnRow = header.querySelector("div:last-child");
        if (btnRow && !el("btn-pip-close")) {
            const close = document.createElement("button");
            close.type = "button";
            close.id = "btn-pip-close";
            close.title = "Leave meeting";
            close.style.cssText =
                "background:none;border:none;color:#ef4444;cursor:pointer;padding:2px;width:20px;" +
                "height:20px;display:flex;align-items:center;justify-content:center;";
            close.innerHTML = `<i data-lucide="phone-off" style="width:13px;height:13px;"></i>`;
            close.onclick = (e) => {
                e.stopPropagation();
                if (!confirm("Leave the meeting?")) return;
                const leave = el("btn-leave-meeting");
                if (leave) leave.click();
            };
            btnRow.appendChild(close);
            icons();
        }
    }

    /** The panel is absolutely positioned over the meetings pane, so it must be
     *  dismissed on logout or when navigating elsewhere — otherwise it reappears
     *  the next time the Meetings tab is opened. */
    function autoDismissPanel() {
        const panel = el("mx-prejoin");
        if (!panel || panel.classList.contains("hidden")) return;

        const loggedOut = (typeof currentUser === "undefined" || !currentUser);
        const loginVisible = el("login-container") && !el("login-container").classList.contains("hidden");
        const onMeetings = document.querySelector('.nav-link.active[data-tab="meetings"]');
        const inCall = (typeof currentRoom !== "undefined") && currentRoom;

        if (loggedOut || loginVisible || !onMeetings || inCall) closePanel();
    }

    function init() {
        installInterceptor();
        makePipDraggable();
        setInterval(autoDismissPanel, 1000);
        const obs = new MutationObserver(() => { installInterceptor(); makePipDraggable(); });
        obs.observe(document.body, { childList: true, subtree: true });
        console.log("%c[MedAstraX] Pre-join preview + draggable PiP ready", "color:#00a896;font-weight:600");
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();

/**
 * ==========================================================================
 * PiP CONTROLS  +  STOP RECORDING WHEN THE CALL ENDS
 * ==========================================================================
 */
(function () {
    "use strict";

    function el(id) { return document.getElementById(id); }
    function icons() { if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons(); }

    // ------------------------------------------------------------------------
    // 1. Leaving a meeting must also finish the recording.
    //    Previously the MediaRecorder kept running after the call ended, so the
    //    only way to stop it was to rejoin and press record again.
    // ------------------------------------------------------------------------
    function wrapLeave() {
        if (typeof window.leaveMeetingRoom !== "function" || window.leaveMeetingRoom.__mxWrapped) return;

        const original = window.leaveMeetingRoom;
        const wrapped = async function () {
            try {
                if (window.mxRecordings && window.mxRecordings.isRecording()) {
                    console.log("[Recording] call ending — stopping recording first");
                    window.mxRecordings.stop();
                    // Give MediaRecorder.onstop time to flush the final chunks and save.
                    await new Promise((r) => setTimeout(r, 800));
                }
            } catch (err) {
                console.warn("[Recording] stop-on-leave failed:", err.message);
            }
            return original.apply(this, arguments);
        };
        wrapped.__mxWrapped = true;
        window.leaveMeetingRoom = wrapped;
        console.log("[MedAstraX] recording will auto-stop when the meeting ends");
    }

    // ------------------------------------------------------------------------
    // 2. Full control strip inside the picture-in-picture window.
    // ------------------------------------------------------------------------
    function syncPipButtons() {
        const micOn = (typeof isMicOn !== "undefined") ? isMicOn : true;
        const camOn = (typeof isCamOn !== "undefined") ? isCamOn : true;
        const sharing = (typeof isScreenSharing !== "undefined") ? isScreenSharing : false;
        const recording = window.mxRecordings ? window.mxRecordings.isRecording() : false;

        const set = (id, on, iconOn, iconOff, onColor) => {
            const b = el(id);
            if (!b) return;
            b.style.background = on ? (onColor || "rgba(255,255,255,.12)") : "#ef4444";
            b.innerHTML = `<i data-lucide="${on ? iconOn : iconOff}" style="width:14px;height:14px;"></i>`;
        };

        set("mx-pip-mic", micOn, "mic", "mic-off");
        set("mx-pip-cam", camOn, "video", "video-off");

        const share = el("mx-pip-share");
        if (share) {
            share.style.background = sharing ? "#10b981" : "rgba(255,255,255,.12)";
            share.title = sharing ? "Stop sharing" : "Share screen";
            share.innerHTML = `<i data-lucide="${sharing ? "monitor-x" : "monitor-up"}" style="width:14px;height:14px;"></i>`;
        }

        const rec = el("mx-pip-rec");
        if (rec) {
            rec.style.background = recording ? "#ef4444" : "rgba(255,255,255,.12)";
            rec.title = recording ? "Stop recording" : "Record";
            rec.innerHTML = `<i data-lucide="circle-dot" style="width:14px;height:14px;"></i>`;
        }

        icons();
    }

    function buildPipControls() {
        const pip = el("meeting-pip-widget");
        if (!pip || el("mx-pip-controls")) return;

        const bar = document.createElement("div");
        bar.id = "mx-pip-controls";
        bar.style.cssText =
            "display:flex;align-items:center;justify-content:center;gap:6px;padding:6px;" +
            "background:#0f172a;border-top:1px solid var(--border-color);flex-shrink:0;";

        const mk = (id, title, danger) => {
            const b = document.createElement("button");
            b.type = "button";
            b.id = id;
            b.title = title;
            b.style.cssText =
                "width:28px;height:28px;border-radius:50%;border:none;cursor:pointer;color:#fff;" +
                "display:flex;align-items:center;justify-content:center;flex-shrink:0;" +
                (danger ? "background:#ef4444;" : "background:rgba(255,255,255,.12);");
            return b;
        };

        const mic = mk("mx-pip-mic", "Toggle microphone");
        const cam = mk("mx-pip-cam", "Toggle camera");
        const share = mk("mx-pip-share", "Share screen");
        const rec = mk("mx-pip-rec", "Record");
        // Pop-out is automatic now, so no manual button here.
        const leave = mk("mx-pip-leave", "Leave meeting", true);


        leave.innerHTML = `<i data-lucide="phone-off" style="width:14px;height:14px;"></i>`;

        // Proxy to the hidden buttons app.js already wires up, so all the existing
        // peer-connection / socket logic runs unchanged.
        const proxy = (hiddenId) => () => { const h = el(hiddenId); if (h) h.click(); setTimeout(syncPipButtons, 120); };
        mic.onclick = proxy("btn-toggle-mic");
        cam.onclick = proxy("btn-toggle-cam");
        share.onclick = proxy("btn-share-screen");
        rec.onclick = () => {
            if (!window.mxRecordings) return;
            window.mxRecordings.isRecording() ? window.mxRecordings.stop() : window.mxRecordings.start();
            setTimeout(syncPipButtons, 400);
        };
        // Overridden later by the Document PiP module when the browser supports it.
        window.mxNativePipFallback = () => enterNativePip(true);
        leave.onclick = () => {
            if (!confirm("Leave the meeting?")) return;
            const h = el("btn-leave-meeting");
            if (h) h.click();
        };

        [mic, cam, share, rec, leave].forEach((b) => bar.appendChild(b));
        pip.appendChild(bar);

        // The widget is only 180px tall by default; make room for the strip.
        if (parseInt(pip.style.height) < 220) pip.style.height = "224px";

        syncPipButtons();
        setInterval(syncPipButtons, 1500);
    }

    // ------------------------------------------------------------------------
    // 3. Float the call over OTHER applications, not just other tabs.
    //    The in-page widget is still inside the browser tab, so it disappears the
    //    moment another window is focused. The native Picture-in-Picture window is
    //    an OS-level window and stays on top.
    // ------------------------------------------------------------------------
    // ------------------------------------------------------------------------
    // Choosing what to show in the floating window.
    // Picture-in-Picture renders whatever frames the <video> is decoding. A tile
    // whose camera is muted (or a call with nobody else in it) produces no frames
    // at all, which is why the window came up completely black.
    // ------------------------------------------------------------------------
    function hasLiveVideo(v) {
        if (!v || !v.srcObject || !v.srcObject.getVideoTracks) return false;
        const track = v.srcObject.getVideoTracks()[0];
        return !!track && track.readyState === "live" && track.enabled;
    }

    let placeholderVideo = null;
    let placeholderTimer = null;

    /** Paints the user's initial onto a canvas and streams it, so the floating
     *  window always has real frames even when every camera is off. */
    function buildPlaceholderVideo() {
        if (placeholderVideo && placeholderVideo.srcObject) return placeholderVideo;

        const canvas = document.createElement("canvas");
        canvas.width = 480;
        canvas.height = 270;
        const ctx = canvas.getContext("2d");

        const name = (typeof currentUser !== "undefined" && currentUser)
            ? (currentUser.fullname || currentUser.username).replace(/\s*\(.*\)\s*/g, "").trim()
            : "MedAstraX";
        const initial = (name.charAt(0) || "M").toUpperCase();

        const draw = () => {
            ctx.fillStyle = "#0f172a";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const cx = canvas.width / 2, cy = canvas.height / 2 - 14;
            const grad = ctx.createLinearGradient(cx - 44, cy - 44, cx + 44, cy + 44);
            grad.addColorStop(0, "#052f5f");
            grad.addColorStop(1, "#00a896");
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, 44, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 40px Inter, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(initial, cx, cy + 2);

            ctx.font = "600 15px Inter, sans-serif";
            ctx.fillStyle = "#e2e8f0";
            ctx.fillText(name.split(" ")[0] || "In a meeting", cx, cy + 74);

            ctx.font = "12px Inter, sans-serif";
            ctx.fillStyle = "#94a3b8";
            const recording = window.mxRecordings && window.mxRecordings.isRecording();
            const micOn = (typeof isMicOn !== "undefined") ? isMicOn : true;
            ctx.fillText(
                (recording ? "● Recording  ·  " : "") + (micOn ? "Mic on" : "Mic muted"),
                cx, cy + 96
            );
        };

        draw();
        if (placeholderTimer) clearInterval(placeholderTimer);
        placeholderTimer = setInterval(draw, 1000);   // keeps frames flowing

        const stream = canvas.captureStream(2);
        placeholderVideo = document.createElement("video");
        placeholderVideo.muted = true;
        placeholderVideo.playsInline = true;
        placeholderVideo.autoplay = true;
        placeholderVideo.srcObject = stream;
        placeholderVideo.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;";
        document.body.appendChild(placeholderVideo);
        placeholderVideo.play().catch(() => { });

        placeholderVideo.addEventListener("leavepictureinpicture", () => {
            if (placeholderTimer) { clearInterval(placeholderTimer); placeholderTimer = null; }
        });

        return placeholderVideo;
    }

    function pickPipSource() {
        const vids = Array.from(
            document.querySelectorAll("#video-grid video, #meeting-pip-video-container video")
        );

        // 1. A remote participant who is actually sending frames.
        const remote = vids.find((v) => v.id !== "local-video-element" && hasLiveVideo(v));
        if (remote) return remote;

        // 2. Our own camera, if it is on.
        const local = vids.find((v) => v.id === "local-video-element" && hasLiveVideo(v));
        if (local) return local;

        // 3. Nothing is producing frames — show a painted placeholder instead of black.
        const inCall = (typeof currentRoom !== "undefined") && currentRoom;
        return inCall ? buildPlaceholderVideo() : null;
    }

    async function enterNativePip(fromUserClick) {
        if (!document.pictureInPictureEnabled) {
            if (fromUserClick && typeof showToast === "function") {
                showToast("This browser does not support floating video windows.", "error");
            }
            return;
        }
        if (document.pictureInPictureElement) return;

        const target = pickPipSource();
        if (!target) {
            if (fromUserClick && typeof showToast === "function") {
                showToast("Nothing to show yet — turn on your camera or wait for someone to join.", "info");
            }
            return;
        }

        try {
            await target.requestPictureInPicture();
        } catch (err) {
            // Without a user gesture Chrome rejects this unless the site has the
            // "auto picture-in-picture" permission — expected, not an error.
            console.log("[PiP] native window not opened:", err.message);
            if (fromUserClick && typeof showToast === "function") {
                showToast("Could not open the floating window: " + err.message, "error");
            }
        }
    }

    let hintShown = false;

    /**
     * Chrome will only auto-open a floating window if the page registers the
     * Media Session "enterpictureinpicture" action. That is the documented path
     * for video-conferencing sites; a bare requestPictureInPicture() call from a
     * visibilitychange handler is rejected because there is no user gesture.
     */
    function registerAutoPip() {
        if (!("mediaSession" in navigator)) return;
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: (typeof currentMeetingTitle !== "undefined" && currentMeetingTitle) || "MedAstraX meeting",
                artist: "MedAstraX Workspace"
            });
            // Chrome fires this when the user switches away from a tab that is
            // capturing camera/mic, and treats the callback as user-activated — which
            // is the only way to open Document PiP without a button.
            navigator.mediaSession.setActionHandler("enterpictureinpicture", async () => {
                if (window.mxDocPip && window.mxDocPip.supported) {
                    const ok = await window.mxDocPip.open();
                    if (ok) return;
                }
                enterNativePip(true);
            });
            console.log("[PiP] auto picture-in-picture handler registered");
        } catch (err) {
            console.log("[PiP] media session unavailable:", err.message);
        }
    }

    function clearAutoPip() {
        if (!("mediaSession" in navigator)) return;
        try { navigator.mediaSession.setActionHandler("enterpictureinpicture", null); } catch (e) { }
    }

    function watchVisibility() {
        if (window.__mxPipWatch) return;
        window.__mxPipWatch = true;

        const goFloating = () => {
            const inCall = (typeof currentRoom !== "undefined") && currentRoom;
            if (!inCall || document.pictureInPictureElement) return;
            // A Document PiP window is already floating — nothing more to do.
            if (window.mxDocPip && window.mxDocPip.isOpen && window.mxDocPip.isOpen()) return;

            // Document PiP carries the whole widget (tiles + controls) and is the
            // preferred route, but it needs a click. Only fall back to the video-only
            // window on browsers that cannot do Document PiP at all.
            // Handled by the automatic pop-out module.
            return;
        };

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) goFloating();
            else if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => { });
        });

        // If the placeholder is on screen and a real camera comes to life, upgrade.
        setInterval(async () => {
            const pipEl = document.pictureInPictureElement;
            if (!pipEl || pipEl !== placeholderVideo) return;
            const better = Array.from(
                document.querySelectorAll("#video-grid video, #meeting-pip-video-container video")
            ).find(hasLiveVideo);
            if (better) {
                try {
                    await better.requestPictureInPicture();
                    console.log("[PiP] switched from placeholder to a live camera");
                } catch (e) { }
            }
        }, 3000);

        // Switching to another application fires blur without hiding the document.
        window.addEventListener("blur", () => {
            setTimeout(() => { if (!document.hasFocus()) goFloating(); }, 250);
        });

        // Keep the handler in step with call state.
        setInterval(() => {
            const inCall = (typeof currentRoom !== "undefined") && currentRoom;
            if (inCall && !window.__mxPipRegistered) { registerAutoPip(); window.__mxPipRegistered = true; }
            if (!inCall && window.__mxPipRegistered) {
                clearAutoPip();
                window.__mxPipRegistered = false;
                hintShown = false;
                if (placeholderTimer) { clearInterval(placeholderTimer); placeholderTimer = null; }
                if (placeholderVideo) {
                    const s = placeholderVideo.srcObject;
                    if (s && s.getTracks) s.getTracks().forEach((tr) => { try { tr.stop(); } catch (e) { } });
                    placeholderVideo.remove();
                    placeholderVideo = null;
                }
                if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => { });
            }
        }, 2000);
    }

    function init() {
        wrapLeave();
        buildPipControls();
        watchVisibility();
        const obs = new MutationObserver(() => { wrapLeave(); buildPipControls(); });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();

/**
 * ==========================================================================
 * DOCUMENT PICTURE-IN-PICTURE
 * ==========================================================================
 * The regular video PiP can only paint a single <video>, which is why the
 * floating window showed just a tile (or a placeholder) with no controls.
 *
 * Document Picture-in-Picture (Chrome/Edge 116+) opens a real always-on-top
 * window that we can move actual DOM into — so the floating call looks and
 * behaves exactly like the in-page "Active Call" widget: same tiles, same
 * mic / camera / share / record / leave buttons.
 * ==========================================================================
 */
(function () {
    "use strict";

    function el(id) { return document.getElementById(id); }
    function icons() { if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons(); }
    function toast(m, t) { if (typeof showToast === "function") showToast(m, t || "info"); }

    const supported = ("documentPictureInPicture" in window);
    let pipWindow = null;
    let homeParent = null;
    let homeNext = null;

    /** Clone the page's CSS into the PiP document — it starts with no styles. */
    function copyStyles(win) {
        Array.from(document.styleSheets).forEach((sheet) => {
            try {
                const rules = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
                const style = win.document.createElement("style");
                style.textContent = rules;
                win.document.head.appendChild(style);
            } catch (err) {
                // Cross-origin sheet (Google Fonts): re-link it instead of reading it.
                if (sheet.href) {
                    const link = win.document.createElement("link");
                    link.rel = "stylesheet";
                    link.href = sheet.href;
                    win.document.head.appendChild(link);
                }
            }
        });

        const own = win.document.createElement("style");
        own.textContent = `
      html, body {
        margin: 0; padding: 0; height: 100%; overflow: hidden;
        background: #0f172a; font-family: 'Inter', sans-serif;
      }
      #meeting-pip-widget {
        position: static !important;
        width: 100% !important;
        height: 100% !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        display: flex !important;
        left: auto !important; top: auto !important;
        right: auto !important; bottom: auto !important;
      }
      /* Dragging and expanding are meaningless in a real OS window */
      #btn-pip-minimize, #btn-pip-expand, #mx-pip-popout { display: none !important; }
      #meeting-pip-video-container { flex: 1; }
    `;
        win.document.head.appendChild(own);
    }

    function restoreWidget() {
        const widget = el("meeting-pip-widget") ||
            (pipWindow && pipWindow.document.getElementById("meeting-pip-widget"));
        if (widget && homeParent) {
            if (homeNext && homeNext.parentNode === homeParent) homeParent.insertBefore(widget, homeNext);
            else homeParent.appendChild(widget);

            // Put back the inline positioning the in-page widget relies on.
            widget.style.position = "fixed";
            widget.style.width = "280px";
            widget.style.height = "224px";
            widget.style.right = "24px";
            widget.style.bottom = "24px";
            widget.style.left = "auto";
            widget.style.top = "auto";

            const inCall = (typeof currentRoom !== "undefined") && currentRoom;
            const onMeetings = document.querySelector('.nav-link.active[data-tab="meetings"]');
            if (!inCall || onMeetings) widget.classList.add("hidden");
        }
        homeParent = null;
        homeNext = null;
        pipWindow = null;

        // Hand the tiles back to the main grid if we are looking at the meetings tab.
        if (typeof syncMeetingPipWidget === "function") {
            const active = document.querySelector(".nav-link.active");
            syncMeetingPipWidget(active ? active.getAttribute("data-tab") : "overview");
        }
        icons();
    }

    async function openDocumentPip() {
        if (!supported) return false;
        if (pipWindow) { try { pipWindow.focus(); } catch (e) { } return true; }

        const widget = el("meeting-pip-widget");
        if (!widget) return false;

        // Make sure the tiles are inside the widget before it travels.
        if (typeof syncMeetingPipWidget === "function") syncMeetingPipWidget("overview");
        widget.classList.remove("hidden");

        try {
            pipWindow = await documentPictureInPicture.requestWindow({
                width: 320,
                height: 260,
                disallowReturnToOpener: false
            });
        } catch (err) {
            console.warn("[DocPiP] could not open window:", err.message);
            pipWindow = null;
            return false;
        }

        copyStyles(pipWindow);

        homeParent = widget.parentNode;
        homeNext = widget.nextSibling;
        pipWindow.document.body.appendChild(widget);

        // Lucide icons are drawn into the original document; redraw inside the PiP.
        try {
            if (typeof lucide !== "undefined") {
                const s = pipWindow.document.createElement("script");
                s.src = "https://unpkg.com/lucide@latest";
                s.onload = () => { try { pipWindow.lucide.createIcons(); } catch (e) { } };
                pipWindow.document.head.appendChild(s);
            }
        } catch (e) { }

        // Videos sometimes need a nudge to resume after being adopted.
        pipWindow.document.querySelectorAll("video").forEach((v) => v.play().catch(() => { }));

        pipWindow.addEventListener("pagehide", restoreWidget);
        console.log("[DocPiP] active call moved into a floating window");
        return true;
    }

    function closeDocumentPip() {
        if (pipWindow) { try { pipWindow.close(); } catch (e) { } restoreWidget(); }
    }

    function hookPopout() { /* pop-out button removed — auto-PiP handles this */ }

    // Leaving the call must also close the floating window.
    function hookLeave() {
        if (window.__mxDocPipLeaveHooked) return;
        if (typeof window.leaveMeetingRoom !== "function") return;
        window.__mxDocPipLeaveHooked = true;

        const original = window.leaveMeetingRoom;
        window.leaveMeetingRoom = async function () {
            closeDocumentPip();
            return original.apply(this, arguments);
        };
    }

    function init() {
        hookPopout();
        hookLeave();
        const obs = new MutationObserver(() => { hookPopout(); hookLeave(); });
        obs.observe(document.body, { childList: true, subtree: true });

        window.addEventListener("pagehide", closeDocumentPip);

        // The floating window is redundant once the user is looking at the call
        // again, so close it as soon as the Meetings tab is focused.
        const closeIfBackOnCall = () => {
            if (!pipWindow) return;
            if (document.hidden) return;
            const onMeetings = document.querySelector('.nav-link.active[data-tab="meetings"]');
            if (onMeetings) closeDocumentPip();
        };

        window.addEventListener("focus", () => setTimeout(closeIfBackOnCall, 120));
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) setTimeout(closeIfBackOnCall, 120);
        });

        // Also handle clicking the Meetings link while the window is already focused.
        document.addEventListener("click", (e) => {
            const link = e.target.closest && e.target.closest('.nav-link[data-tab="meetings"]');
            if (link) setTimeout(closeIfBackOnCall, 200);
        }, true);

        console.log(supported
            ? "%c[MedAstraX] Document Picture-in-Picture available — full call window supported"
            : "%c[MedAstraX] Document PiP unsupported; falling back to video-only PiP",
            "color:#00a896;font-weight:600");
    }

    window.mxDocPip = {
        open: openDocumentPip,
        close: closeDocumentPip,
        supported: supported,
        isOpen: () => !!pipWindow
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();

/**
 * ==========================================================================
 * POP-OUT FROM THE MEETING SCREEN  +  FLOAT ON BROWSER-TAB SWITCH
 * ==========================================================================
 * Two gaps this closes:
 *
 * 1. The mini "Active Call" widget only appears when you move between portal
 *    tabs (Overview, Chat…). Switching to a different BROWSER tab while sitting
 *    on the Meetings screen left nothing on screen — and therefore no pop-out
 *    button to press.
 *
 * 2. Document Picture-in-Picture needs a user gesture, so it can never be
 *    opened from a visibilitychange handler. The control has to live where the
 *    user is before they switch away: the meeting controls bar.
 * ==========================================================================
 */
(function () {
    "use strict";

    function el(id) { return document.getElementById(id); }
    function icons() { if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons(); }

    // Pop-out is fully automatic now: Chrome's Media Session auto-PiP opens the
    // Document PiP window the moment the user switches tab or application.

    // ---- 2. Show the mini widget when the browser tab loses focus -------------
    function forceShowMiniWidget() {
        const inCall = (typeof currentRoom !== "undefined") && currentRoom;
        if (!inCall) return;
        if (window.mxDocPip && window.mxDocPip.isOpen && window.mxDocPip.isOpen()) return;

        // syncMeetingPipWidget decides purely from the portal tab; pass a non-meetings
        // value so the tiles move into the mini widget and it becomes visible.
        if (typeof syncMeetingPipWidget === "function") syncMeetingPipWidget("__hidden__");
    }

    function restoreFromMiniWidget() {
        if (window.mxDocPip && window.mxDocPip.isOpen && window.mxDocPip.isOpen()) return;
        if (typeof syncMeetingPipWidget !== "function") return;
        const active = document.querySelector(".nav-link.active");
        syncMeetingPipWidget(active ? active.getAttribute("data-tab") : "overview");
    }

    function watchTabSwitch() {
        if (window.__mxTabWatch) return;
        window.__mxTabWatch = true;

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) forceShowMiniWidget();
            else restoreFromMiniWidget();
        });

        window.addEventListener("blur", () => {
            setTimeout(() => { if (!document.hasFocus()) forceShowMiniWidget(); }, 200);
        });
        window.addEventListener("focus", restoreFromMiniWidget);
    }

    function init() {
        watchTabSwitch();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();

/**
 * ==========================================================================
 * AUTOMATIC POP-OUT  +  REAL CAMERA RELEASE
 * ==========================================================================
 */
(function () {
    "use strict";

    function el(id) { return document.getElementById(id); }
    function icons() { if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons(); }

    // ------------------------------------------------------------------------
    // A. Turning the camera "off" only disabled the track, which leaves the
    //    hardware open and the indicator light burning for the whole call.
    //    Stop the track outright and re-acquire it when the camera is switched
    //    back on, swapping it into every peer connection.
    // ------------------------------------------------------------------------
    async function releaseCamera() {
        if (typeof localStream === "undefined" || !localStream) return;
        if (typeof isScreenSharing !== "undefined" && isScreenSharing) return; // sharing owns the sender

        localStream.getVideoTracks().forEach((track) => {
            try { track.stop(); } catch (e) { }
            try { localStream.removeTrack(track); } catch (e) { }
        });

        if (typeof peerConnections !== "undefined") {
            Object.values(peerConnections).forEach((pc) => {
                const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
                if (sender) sender.replaceTrack(null).catch(() => { });
            });
        }

        // Remove the stopped track so the stream no longer advertises a video source.
        localStream.getVideoTracks().forEach((tr) => {
            if (tr.readyState !== "live") {
                try { localStream.removeTrack(tr); } catch (e) { }
            }
        });

        const v = el("local-video-element");
        if (v) v.srcObject = localStream;

        // Show the avatar tile in place of the dead video.
        const avatar = el("video-avatar-local");
        if (avatar) avatar.classList.remove("hidden");

        console.log("[Video] camera hardware released — indicator light off");
    }

    async function reacquireCamera() {
        if (typeof localStream === "undefined" || !localStream) return;
        if (localStream.getVideoTracks().some((t) => t.readyState === "live")) return;

        let fresh;
        try {
            fresh = await navigator.mediaDevices.getUserMedia({ video: true });
        } catch (err) {
            console.warn("[Video] could not re-open the camera:", err.message);
            if (typeof showToast === "function") showToast("Camera unavailable: " + err.message, "error");
            return;
        }

        const track = fresh.getVideoTracks()[0];
        localStream.addTrack(track);

        if (typeof peerConnections !== "undefined") {
            Object.values(peerConnections).forEach((pc) => {
                const sender = pc.getSenders().find((s) => !s.track || s.track.kind === "video");
                if (sender) sender.replaceTrack(track).catch(() => { });
            });
        }

        const v = el("local-video-element");
        if (v) { v.srcObject = localStream; v.play().catch(() => { }); }

        const avatar = el("video-avatar-local");
        if (avatar) avatar.classList.add("hidden");

        console.log("[Video] camera re-opened");
    }

    /**
     * Catch every path that can leave the camera running: joining with video
     * already off, toggling from the mini window, host-forced camera off, etc.
     * Cheap enough to run on a timer and far more reliable than hooking each one.
     */
    function reconcileCamera() {
        const inCall = (typeof currentRoom !== "undefined") && currentRoom;
        if (!inCall) return;
        if (typeof isScreenSharing !== "undefined" && isScreenSharing) return;  // that track is the screen
        if (typeof localStream === "undefined" || !localStream) return;

        const camOn = (typeof isCamOn !== "undefined") ? isCamOn : true;
        const live = localStream.getVideoTracks().filter(tr => tr.readyState === "live");

        if (!camOn && live.length) {
            releaseCamera();
        } else if (camOn && live.length === 0) {
            reacquireCamera();
        }
    }

    function hookCameraToggle() {
        const btn = el("btn-toggle-cam");
        if (!btn || btn.dataset.mxCamHook === "1") return;
        btn.dataset.mxCamHook = "1";

        // Registered after app.js assigns its onclick, so isCamOn is already updated
        // by the time this runs and we simply follow it with the hardware change.
        btn.addEventListener("click", () => {
            setTimeout(() => {
                const on = (typeof isCamOn !== "undefined") ? isCamOn : true;
                if (on) reacquireCamera(); else releaseCamera();
            }, 60);
        });
    }

    // ------------------------------------------------------------------------
    // B. Automatic pop-out.
    //    Document PiP normally needs a click, but Chrome exposes an official
    //    automatic route for video-conferencing pages: register the Media Session
    //    "enterpictureinpicture" action and the browser calls it for you when the
    //    user switches away. Calls made from inside that handler count as
    //    user-activated, so the full call window can open on its own.
    // ------------------------------------------------------------------------
    let autoRegistered = false;

    function registerAutoDocPip() {
        if (autoRegistered || !("mediaSession" in navigator)) return;
        try {
            navigator.mediaSession.setActionHandler("enterpictureinpicture", async () => {
                if (window.mxDocPip && window.mxDocPip.supported) {
                    const ok = await window.mxDocPip.open();
                    if (ok) return;
                }
                if (window.mxNativePipFallback) window.mxNativePipFallback();
            });
            autoRegistered = true;
            console.log("[PiP] automatic pop-out registered with the browser");
        } catch (err) {
            console.log("[PiP] automatic pop-out unavailable:", err.message);
        }
    }

    function unregisterAutoDocPip() {
        if (!autoRegistered || !("mediaSession" in navigator)) return;
        try { navigator.mediaSession.setActionHandler("enterpictureinpicture", null); } catch (e) { }
        autoRegistered = false;
    }

    async function autoFloat() {
        const inCall = (typeof currentRoom !== "undefined") && currentRoom;
        if (!inCall) return;
        if (window.mxDocPip && window.mxDocPip.isOpen && window.mxDocPip.isOpen()) return;
        if (document.pictureInPictureElement) return;

        // Try the full window first; it may be refused without the permission.
        if (window.mxDocPip && window.mxDocPip.supported) {
            const ok = await window.mxDocPip.open();
            if (ok) return;
        }
        // Otherwise at least float the video so something stays visible.
        if (window.mxNativePipFallback) window.mxNativePipFallback();
    }

    function watchAway() {
        if (window.__mxAutoFloat) return;
        window.__mxAutoFloat = true;

        document.addEventListener("visibilitychange", () => {
            if (document.hidden) autoFloat();
        });
        window.addEventListener("blur", () => {
            setTimeout(() => { if (!document.hasFocus()) autoFloat(); }, 200);
        });

        setInterval(() => {
            const inCall = (typeof currentRoom !== "undefined") && currentRoom;
            if (inCall) registerAutoDocPip(); else unregisterAutoDocPip();
        }, 2000);
    }

    // ------------------------------------------------------------------------
    // C. The manual pop-out buttons are no longer needed.
    // ------------------------------------------------------------------------
    function removePopoutButtons() {
        ["mx-call-popout", "mx-pip-popout"].forEach((id) => {
            const b = el(id);
            if (b) b.remove();
        });
    }

    function init() {
        hookCameraToggle();
        watchAway();
        removePopoutButtons();
        setInterval(reconcileCamera, 2000);
        const obs = new MutationObserver(() => { hookCameraToggle(); removePopoutButtons(); });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();