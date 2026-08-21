/**
 * ==========================================================================
 * MEDASTRAX MEETING MEDIA & WEBRTC LAYER
 * ==========================================================================
 * Multi-user video meeting engine with Perfect Negotiation, candidate queueing,
 * dedicated audio elements for guaranteed sound playback, and real-time screen sharing.
 * ==========================================================================
 */

(function () {
    "use strict";

    // ------------------------------------------------------------------------
    // State & Config
    // ------------------------------------------------------------------------
    const senders = {};           // peerId -> { audio: RTCRtpSender, video: RTCRtpSender }
    const remoteStreams = {};     // peerId -> MediaStream
    const negotiation = {};       // peerId -> { makingOffer, ignoreOffer, polite }
    const pendingCandidates = {}; // peerId -> RTCIceCandidateInit[]

    const ICE_SERVERS = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
        { urls: "stun:stun.cloudflare.com:3478" },
        { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
    ];

    function el(id) {
        const pipDoc = window.mxDocPip && window.mxDocPip.doc;
        return (pipDoc && pipDoc.getElementById(id)) || document.getElementById(id);
    }

    function allVideos() {
        const out = [];
        const pipDoc = window.mxDocPip && window.mxDocPip.doc;
        [document, pipDoc].forEach((d) => {
            if (!d) return;
            d.querySelectorAll("#video-grid video, #meeting-pip-video-container video")
                .forEach((v) => out.push(v));
        });
        return out;
    }

    function me() {
        return (typeof currentUser !== "undefined" && currentUser) ? currentUser.id : "";
    }

    function log() {
        console.log.apply(console, ["[RTC]"].concat([].slice.call(arguments)));
    }

    // ------------------------------------------------------------------------
    // Dedicated Remote Audio Management (Guarantees sound is always heard)
    // ------------------------------------------------------------------------
    function playRemoteAudio(peerId, stream) {
        let audioEl = document.getElementById("remote-audio-" + peerId);
        if (!audioEl) {
            audioEl = document.createElement("audio");
            audioEl.id = "remote-audio-" + peerId;
            audioEl.autoplay = true;
            audioEl.playsInline = true;
            audioEl.style.display = "none";
            document.body.appendChild(audioEl);
        }

        if (audioEl.srcObject !== stream) {
            audioEl.srcObject = stream;
        }

        const tryPlay = () => {
            audioEl.play().catch(() => {
                const unlock = () => {
                    audioEl.play().catch(() => { });
                    document.removeEventListener("click", unlock);
                    document.removeEventListener("keydown", unlock);
                    document.removeEventListener("touchstart", unlock);
                };
                document.addEventListener("click", unlock, { once: true });
                document.addEventListener("keydown", unlock, { once: true });
                document.addEventListener("touchstart", unlock, { once: true });
            });
        };
        tryPlay();
    }

    function removeRemoteAudio(peerId) {
        const audioEl = document.getElementById("remote-audio-" + peerId);
        if (audioEl) {
            try { audioEl.pause(); } catch (e) { }
            audioEl.srcObject = null;
            audioEl.remove();
        }
    }

    // ------------------------------------------------------------------------
    // Peer Connection Management
    // ------------------------------------------------------------------------
    function buildPeerConnection(peerId) {
        if (!peerId) return null;
        if (typeof peerConnections === "undefined") window.peerConnections = {};

        if (peerConnections[peerId]) {
            try { peerConnections[peerId].close(); } catch (e) { }
        }

        const pc = new RTCPeerConnection({
            iceServers: ICE_SERVERS,
            iceCandidatePoolSize: 2
        });

        const myId = String(me() || "");
        const otherId = String(peerId || "");
        const isPolite = myId.localeCompare(otherId) > 0;

        negotiation[peerId] = {
            makingOffer: false,
            ignoreOffer: false,
            polite: isPolite
        };
        pendingCandidates[peerId] = [];

        // Pre-create transceivers so slots always exist for audio and video
        const audioTx = pc.addTransceiver("audio", { direction: "sendrecv" });
        const videoTx = pc.addTransceiver("video", { direction: "sendrecv" });
        senders[peerId] = { audio: audioTx.sender, video: videoTx.sender };

        // Attach local tracks directly to the senders
        attachLocalTracks(peerId, pc);

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                sendSignal(peerId, "ice-candidate", e.candidate);
            }
        };

        pc.ontrack = (e) => {
            log(peerId, "received remote track:", e.track.kind, "id:", e.track.id);

            let stream = e.streams && e.streams[0];
            if (!stream) {
                if (!remoteStreams[peerId]) remoteStreams[peerId] = new MediaStream();
                stream = remoteStreams[peerId];
                if (!stream.getTracks().some(t => t.id === e.track.id)) {
                    stream.addTrack(e.track);
                }
            } else {
                remoteStreams[peerId] = stream;
            }

            // If audio track, ensure dedicated audio element is playing
            if (e.track.kind === "audio") {
                playRemoteAudio(peerId, stream);
                watchSpeaking(peerId, stream);
            }

            // Render remote video / tile
            if (typeof addRemoteVideo === "function") {
                addRemoteVideo(peerId, stream);
            }
            updateRemoteTile(peerId, stream);

            e.track.onended = () => {
                try {
                    if (remoteStreams[peerId]) remoteStreams[peerId].removeTrack(e.track);
                } catch (err) { }
                updateRemoteTile(peerId, remoteStreams[peerId]);
            };

            e.track.onunmute = () => {
                if (e.track.kind === "audio") playRemoteAudio(peerId, stream);
                if (typeof addRemoteVideo === "function") addRemoteVideo(peerId, stream);
                updateRemoteTile(peerId, stream);
            };
        };

        pc.onnegotiationneeded = async () => {
            const state = negotiation[peerId];
            if (!state) return;
            try {
                state.makingOffer = true;
                await pc.setLocalDescription();
                sendSignal(peerId, "offer", pc.localDescription);
                log(peerId, "sent offer description");
            } catch (err) {
                console.error("[RTC] negotiation error for", peerId, err);
            } finally {
                state.makingOffer = false;
            }
        };

        pc.oniceconnectionstatechange = () => {
            log(peerId, "ice connection state:", pc.iceConnectionState);
            if (pc.iceConnectionState === "failed") {
                console.warn("[RTC] ICE failed for", peerId, "— attempting ICE restart");
                try { pc.restartIce(); } catch (err) { }
            }
        };

        pc.onconnectionstatechange = () => {
            log(peerId, "connection state:", pc.connectionState);
            if (pc.connectionState === "connected") {
                log(peerId, "connected successfully ✅");
                ensureRemoteMediaPlaying(peerId);
            }
        };

        peerConnections[peerId] = pc;
        return pc;
    }

    /** Attach current local audio and video tracks to the peer connection senders */
    function attachLocalTracks(peerId, targetPc) {
        const pc = targetPc || peerConnections[peerId];
        if (!pc) return;

        const stream = (typeof localStream !== "undefined") ? localStream : null;
        const audioTrack = stream ? stream.getAudioTracks()[0] : null;
        const videoTrack = (screenStream && screenStream.getVideoTracks()[0]) || (stream ? stream.getVideoTracks()[0] : null);

        const s = senders[peerId];
        if (s) {
            if (s.audio && audioTrack) {
                s.audio.replaceTrack(audioTrack).catch(() => { });
            }
            if (s.video) {
                s.video.replaceTrack(videoTrack || null).catch(() => { });
            }
        }
    }

    /** Broadcast track replacement across all active peer connections */
    function broadcastTrack(kind, track) {
        Object.keys(peerConnections).forEach((peerId) => {
            const pc = peerConnections[peerId];
            if (!pc) return;

            let sender = senders[peerId] && senders[peerId][kind];
            if (!sender) {
                const sendersList = pc.getSenders();
                sender = sendersList.find(s => (s.track && s.track.kind === kind) || (!s.track && kind === "video"));
            }

            if (sender) {
                sender.replaceTrack(track || null).catch((err) => {
                    console.warn("[RTC] replaceTrack", kind, peerId, err.message);
                });
            }
        });
        log("broadcast", kind, track ? "track active" : "null", "to", Object.keys(peerConnections).length, "peer(s)");
    }

    // ------------------------------------------------------------------------
    // Signalling with Perfect Negotiation & Candidate Queueing
    // ------------------------------------------------------------------------
    async function handleEvent(event) {
        if (!event) return;
        const type = event.type;
        const peerId = event.senderId || event.userId;
        const data = event.data;

        if (!peerId || peerId === me()) return;

        if (type === "user-joined") {
            log("user joined:", peerId, event.username || "");
            if (!peerConnections[peerId]) {
                buildPeerConnection(peerId);
            }
            chimeJoin();
            if (typeof showToast === "function") {
                showToast((event.username || "A colleague") + " joined the meeting", "info");
            }
            return;
        }

        if (type === "user-left") {
            log("user left:", peerId);
            cleanupPeer(peerId);
            chimeLeave();
            return;
        }

        let pc = peerConnections[peerId];
        if (!pc) pc = buildPeerConnection(peerId);
        const state = negotiation[peerId] || { polite: true, makingOffer: false, ignoreOffer: false };

        try {
            if (type === "offer" || type === "answer") {
                const description = new RTCSessionDescription(data);
                const isOffer = description.type === "offer";
                const collision = isOffer && (state.makingOffer || pc.signalingState !== "stable");

                state.ignoreOffer = !state.polite && collision;
                if (state.ignoreOffer) {
                    log("ignoring colliding offer from", peerId, "(impolite peer)");
                    return;
                }

                if (collision) {
                    await Promise.all([
                        pc.setLocalDescription({ type: "rollback" }).catch(() => { }),
                        pc.setRemoteDescription(description)
                    ]);
                } else {
                    await pc.setRemoteDescription(description);
                }

                // Flush any queued ICE candidates received before remote description
                await flushPendingCandidates(peerId, pc);

                if (isOffer) {
                    await pc.setLocalDescription();
                    sendSignal(peerId, "answer", pc.localDescription);
                    log(peerId, "sent answer description");
                }
                return;
            }

            if (type === "ice-candidate") {
                if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
                    if (!pendingCandidates[peerId]) pendingCandidates[peerId] = [];
                    pendingCandidates[peerId].push(data);
                    return;
                }

                try {
                    await pc.addIceCandidate(new RTCIceCandidate(data));
                } catch (err) {
                    if (!state.ignoreOffer) console.warn("[RTC] ICE candidate error:", err.message);
                }
            }
        } catch (err) {
            console.error("[RTC] signalling error from", peerId, err);
        }
    }

    async function flushPendingCandidates(peerId, pc) {
        const queue = pendingCandidates[peerId];
        if (!queue || !queue.length) return;
        pendingCandidates[peerId] = [];
        for (const candidateData of queue) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidateData));
            } catch (err) {
                console.warn("[RTC] queued candidate add error:", err.message);
            }
        }
    }

    function cleanupPeer(peerId) {
        const pc = peerConnections[peerId];
        if (pc) { try { pc.close(); } catch (e) { } }
        delete peerConnections[peerId];
        delete senders[peerId];
        delete negotiation[peerId];
        delete remoteStreams[peerId];
        delete pendingCandidates[peerId];
        stopSpeaking(peerId);
        removeRemoteAudio(peerId);

        const tile = el("video-container-" + peerId);
        if (tile) tile.remove();
        if (typeof meetingParticipantsList !== "undefined" && meetingParticipantsList[peerId]) {
            delete meetingParticipantsList[peerId];
        }
        if (typeof renderParticipantsList === "function") renderParticipantsList();
    }

    // ------------------------------------------------------------------------
    // Speaking indicator — shared AudioContext for low latency
    // ------------------------------------------------------------------------
    let sharedAudioCtx = null;
    const meters = {};   // id -> { source, analyser, raf }

    function getSharedAudioContext() {
        if (!sharedAudioCtx) {
            try {
                sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                return null;
            }
        }
        if (sharedAudioCtx.state === "suspended") {
            sharedAudioCtx.resume().catch(() => { });
        }
        return sharedAudioCtx;
    }

    function watchSpeaking(id, stream) {
        if (!stream || meters[id]) return;
        const audioTracks = stream.getAudioTracks();
        if (!audioTracks.length) return;

        const ctx = getSharedAudioContext();
        if (!ctx) return;

        let source = null;
        let analyser = null;
        try {
            source = ctx.createMediaStreamSource(new MediaStream([audioTracks[0]]));
            analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.4;
            source.connect(analyser);
        } catch (err) {
            return;
        }

        const buf = new Uint8Array(analyser.frequencyBinCount);
        let speaking = false;
        let quietFrames = 0;
        let loudFrames = 0;

        const tick = () => {
            const track = stream.getAudioTracks()[0];
            const audible = track && track.readyState === "live" && track.enabled &&
                (id !== "local" || (typeof isMicOn === "undefined" || isMicOn));

            if (!audible) {
                if (speaking) { speaking = false; paintSpeaking(id, false); }
                if (id === "local") paintMicLevel(0, 1);
                meters[id].raf = requestAnimationFrame(tick);
                return;
            }

            analyser.getByteFrequencyData(buf);
            let sum = 0;
            for (let i = 2; i < buf.length; i++) sum += buf[i];
            const level = (sum / (buf.length - 2)) / 255;

            if (id === "local") paintMicLevel(level, 0.08);

            if (level > 0.08) {
                quietFrames = 0;
                loudFrames++;
                if (!speaking && loudFrames > 2) { speaking = true; paintSpeaking(id, true); }
            } else {
                loudFrames = 0;
                quietFrames++;
                if (speaking && quietFrames > 12) { speaking = false; paintSpeaking(id, false); }
            }
            meters[id].raf = requestAnimationFrame(tick);
        };

        meters[id] = { source, analyser, raf: 0 };
        tick();
    }

    function stopSpeaking(id) {
        const m = meters[id];
        if (!m) return;
        cancelAnimationFrame(m.raf);
        try {
            if (m.source) m.source.disconnect();
        } catch (e) { }
        delete meters[id];
        paintSpeaking(id, false);
    }

    const MIC_BUTTONS = ["btn-active-toggle-mic", "mx-pip-mic", "mx-pj-mic"];

    function paintMicLevel(level, threshold) {
        const norm = Math.max(0, Math.min(1, (level - threshold * 0.5) / 0.25));
        MIC_BUTTONS.forEach((id) => {
            const b = el(id);
            if (!b) return;
            b.style.setProperty("--mx-level", norm.toFixed(3));
            b.classList.toggle("mx-mic-live", norm > 0.02);
        });
    }

    function paintSpeaking(id, on) {
        const tile = el("video-container-" + id) ||
            (id === "local" ? el("video-container-local") : null);
        if (tile) tile.classList.toggle("mx-speaking", on);

        const row = document.querySelector('[data-mx-participant="' + id + '"]');
        if (row) row.classList.toggle("mx-speaking-row", on);
    }

    function watchLocalSpeaking() {
        if (typeof localStream === "undefined" || !localStream) return;
        if (meters["local"]) return;
        watchSpeaking("local", localStream);
    }

    function updateRemoteTile(peerId, stream) {
        const tile = el("video-container-" + peerId);
        if (!tile) return;
        const video = tile.querySelector("video");
        const pState = (typeof meetingParticipantsList !== "undefined" && meetingParticipantsList[peerId]) || {};
        const isSharing = !!pState.isSharing;
        const peerCamOn = pState.isCamOn !== false;

        if (video) {
            if (video.srcObject !== stream) video.srcObject = stream;
            video.style.objectFit = isSharing ? "contain" : "cover";
            video.style.background = isSharing ? "#000" : "";
            if (video.paused) video.play().catch(() => { });
        }

        const avatar = el("video-avatar-" + peerId);
        if (avatar) {
            const hasVideo = stream && stream.getVideoTracks && stream.getVideoTracks().some(t => t.readyState === "live" && t.enabled);
            const showVideo = isSharing || (peerCamOn && hasVideo);
            avatar.classList.toggle("hidden", !!showVideo);
        }
    }

    function ensureRemoteMediaPlaying(peerId) {
        const stream = remoteStreams[peerId];
        if (stream) {
            playRemoteAudio(peerId, stream);
            updateRemoteTile(peerId, stream);
        }
    }

    // ------------------------------------------------------------------------
    // Audio Chimes
    // ------------------------------------------------------------------------
    let toneCtx = null;

    function audioCtx() {
        if (!toneCtx) {
            try { toneCtx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch (err) { return null; }
        }
        if (toneCtx.state === "suspended") toneCtx.resume().catch(() => { });
        return toneCtx;
    }

    ["click", "keydown", "touchstart"].forEach((evt) => {
        window.addEventListener(evt, function unlock() {
            audioCtx();
            getSharedAudioContext();
            ["click", "keydown", "touchstart"].forEach((e2) =>
                window.removeEventListener(e2, unlock));
        }, { once: false });
    });

    function playTone(steps) {
        const ctx = audioCtx();
        if (!ctx) return;
        try {
            let at = ctx.currentTime + 0.01;
            steps.forEach((s) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = s.type || "triangle";
                osc.frequency.setValueAtTime(s.f, at);
                if (s.to) osc.frequency.exponentialRampToValueAtTime(s.to, at + s.d);

                gain.gain.setValueAtTime(0.0001, at);
                gain.gain.exponentialRampToValueAtTime(s.v || 0.3, at + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, at + s.d);

                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(at);
                osc.stop(at + s.d + 0.03);
                at += (s.gap !== undefined ? s.gap : s.d * 0.55);
            });
        } catch (err) { }
    }

    const chimeJoin = () => playTone([
        { f: 659.25, d: 0.16, v: 0.32, gap: 0.11 },
        { f: 987.77, d: 0.34, v: 0.28 }
    ]);

    const chimeLeave = () => playTone([
        { f: 659.25, d: 0.16, v: 0.30, gap: 0.11 },
        { f: 392.00, d: 0.38, v: 0.28, to: 329.63 }
    ]);

    window.mxChime = { join: chimeJoin, leave: chimeLeave };

    // ------------------------------------------------------------------------
    // Camera, Mic & Screen Share Controls
    // ------------------------------------------------------------------------
    async function setCamera(on) {
        if (typeof localStream === "undefined" || !localStream) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
                });
            } catch (e) {
                return;
            }
        }

        if (!on) {
            localStream.getVideoTracks().forEach((t) => {
                try { t.stop(); } catch (e) { }
                localStream.removeTrack(t);
            });
            broadcastTrack("video", null);
            if (typeof isCamOn !== "undefined") isCamOn = false;
            const avatar = el("video-avatar-local");
            if (avatar) avatar.classList.remove("hidden");
            log("camera off — device released");
            emitStatus();
            return;
        }

        try {
            const fresh = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
            });
            const track = fresh.getVideoTracks()[0];
            localStream.getVideoTracks().forEach((t) => {
                try { t.stop(); } catch (e) { }
                localStream.removeTrack(t);
            });
            localStream.addTrack(track);
            broadcastTrack("video", track);
            if (typeof isCamOn !== "undefined") isCamOn = true;

            const v = el("local-video-element");
            if (v) { v.srcObject = localStream; v.play().catch(() => { }); }
            const avatar = el("video-avatar-local");
            if (avatar) avatar.classList.add("hidden");
            log("camera on — track active across all peers");
            emitStatus();
        } catch (err) {
            if (typeof showToast === "function") showToast("Camera unavailable: " + err.message, "error");
        }
    }

    function setMic(on) {
        if (typeof localStream === "undefined" || !localStream) return;
        localStream.getAudioTracks().forEach((t) => { t.enabled = on; });
        if (typeof isMicOn !== "undefined") isMicOn = on;
        paintSpeaking("local", false);
        log("mic", on ? "on" : "muted");
        emitStatus();
    }

    let screenStream = null;

    async function startShare() {
        if (screenStream) return;
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        } catch (err) {
            if (err.name !== "NotAllowedError" && typeof showToast === "function") {
                showToast("Could not share screen: " + err.message, "error");
            }
            return;
        }

        const track = screenStream.getVideoTracks()[0];
        broadcastTrack("video", track);
        if (typeof isScreenSharing !== "undefined") isScreenSharing = true;

        const v = el("local-video-element");
        if (v) {
            v.srcObject = screenStream;
            v.style.objectFit = "contain";
            v.style.background = "#000";
            v.play().catch(() => { });
        }
        const avatar = el("video-avatar-local");
        if (avatar) avatar.classList.add("hidden");

        track.onended = () => stopShare();
        emitStatus();
        if (typeof showToast === "function") showToast("Screen sharing started", "success");
        log("screen share started");
    }

    function stopShare(silent) {
        if (!screenStream) return;
        screenStream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { } });
        screenStream = null;
        if (typeof isScreenSharing !== "undefined") isScreenSharing = false;

        const cam = (typeof localStream !== "undefined" && localStream)
            ? localStream.getVideoTracks()[0] : null;
        broadcastTrack("video", cam || null);

        const v = el("local-video-element");
        if (v && typeof localStream !== "undefined") {
            v.srcObject = localStream;
            v.style.objectFit = "cover";
            v.style.background = "";
            v.play().catch(() => { });
        }
        const avatar = el("video-avatar-local");
        if (avatar && !(typeof isCamOn !== "undefined" && isCamOn)) avatar.classList.remove("hidden");

        emitStatus();
        if (!silent && typeof showToast === "function") showToast("Screen sharing stopped", "info");
        log("screen share stopped");
    }

    function intercept(id, handler) {
        const btn = el(id);
        if (!btn || btn.dataset.mxRtc === "1") return;
        btn.dataset.mxRtc = "1";
        btn.addEventListener("click", function (e) {
            e.stopImmediatePropagation();
            e.preventDefault();
            handler();
        }, true);
    }

    function emitStatus() {
        if (typeof socket === "undefined" || !socket || typeof currentRoom === "undefined" || !currentRoom) return;
        socket.emit("meeting-status-update", {
            room: currentRoom,
            userId: me(),
            fullname: currentUser ? (currentUser.fullname || "").replace(/\s*\(.*\)\s*/g, "") : "",
            isMicOn: (typeof isMicOn !== "undefined") ? isMicOn : true,
            isCamOn: (typeof isCamOn !== "undefined") ? isCamOn : true,
            isSharing: !!screenStream,
            isHandRaised: (typeof isHandRaised !== "undefined") ? isHandRaised : false
        });
    }

    function hookControls() {
        intercept("btn-toggle-cam", async () => {
            const on = (typeof isCamOn !== "undefined") ? isCamOn : true;
            await setCamera(!on);
            refreshLocalPreview();
            refreshLocalLabel();
            repaintMediaButtons();
            emitStatus();
            if (typeof renderParticipantsList === "function") renderParticipantsList();
        });

        intercept("btn-toggle-mic", () => {
            const on = (typeof isMicOn !== "undefined") ? isMicOn : true;
            setMic(!on);
            refreshLocalLabel();
            repaintMediaButtons();
            emitStatus();
            if (typeof renderParticipantsList === "function") renderParticipantsList();
        });

        intercept("btn-share-screen", async () => {
            if (screenStream) stopShare(); else await startShare();
            refreshLocalPreview();
            repaintMediaButtons();
        });
    }

    function repaintMediaButtons() {
        const camOn = (typeof isCamOn !== "undefined") ? isCamOn : true;
        const micOn = (typeof isMicOn !== "undefined") ? isMicOn : true;
        const sharing = !!screenStream;

        const paint = (id, on, onBg, offBg, onFg, offFg) => {
            const b = el(id);
            if (!b) return;
            b.style.backgroundColor = on ? onBg : offBg;
            b.style.color = on ? onFg : offFg;
        };

        paint("btn-active-toggle-cam", camOn, "var(--bg-primary)", "#ef4444", "var(--text-primary)", "#fff");
        paint("btn-active-toggle-mic", micOn, "var(--bg-primary)", "#ef4444", "var(--text-primary)", "#fff");
        paint("btn-active-share-screen", !sharing, "var(--bg-primary)", "#10b981", "var(--text-primary)", "#fff");

        paint("mx-pip-cam", camOn, "rgba(255,255,255,.12)", "#ef4444", "#fff", "#fff");
        paint("mx-pip-mic", micOn, "rgba(255,255,255,.12)", "#ef4444", "#fff", "#fff");
        paint("mx-pip-share", !sharing, "rgba(255,255,255,.12)", "#10b981", "#fff", "#fff");

        const swapIcon = (id, name) => {
            const b = el(id);
            if (!b) return;
            const i = b.querySelector("i");
            if (i) i.setAttribute("data-lucide", name);
        };
        swapIcon("btn-active-toggle-cam", camOn ? "video" : "video-off");
        swapIcon("btn-active-toggle-mic", micOn ? "mic" : "mic-off");
        swapIcon("mx-pip-cam", camOn ? "video" : "video-off");
        swapIcon("mx-pip-mic", micOn ? "mic" : "mic-off");
        if (typeof lucide !== "undefined") lucide.createIcons();
    }

    function refreshLocalPreview() {
        const v = el("local-video-element");
        if (!v) return;

        const wanted = screenStream ||
            ((typeof localStream !== "undefined") ? localStream : null);
        if (!wanted) return;

        const hasVideo = wanted.getVideoTracks && wanted.getVideoTracks().length > 0;
        if (v.srcObject !== wanted) v.srcObject = wanted;
        if (v.paused) v.play().catch(() => { });

        v.style.objectFit = screenStream ? "contain" : "cover";
        v.style.background = screenStream ? "#000" : "";

        const avatar = el("video-avatar-local");
        if (avatar) avatar.classList.toggle("hidden", hasVideo);

        allVideos().forEach((el2) => {
            if (el2.srcObject && el2.paused && el2.id !== "local-video-element") {
                el2.play().catch(() => { });
            }
        });
    }

    function refreshLocalLabel() {
        const tile = el("video-container-local");
        if (!tile) return;
        const label = tile.querySelector("div[style*='bottom']");
        if (!label) return;
        const micOn = (typeof isMicOn !== "undefined") ? isMicOn : true;
        const camOn = (typeof isCamOn !== "undefined") ? isCamOn : true;
        label.innerHTML =
            "<span>You</span>" +
            '<i data-lucide="' + (micOn ? "mic" : "mic-off") + '" style="width:11px;height:11px;color:' +
            (micOn ? "#10b981" : "#ef4444") + ';"></i>' +
            '<i data-lucide="' + (camOn ? "video" : "video-off") + '" style="width:11px;height:11px;color:' +
            (camOn ? "#10b981" : "#ef4444") + ';"></i>';
        if (typeof lucide !== "undefined") lucide.createIcons();
    }

    // ------------------------------------------------------------------------
    // Install & Hook
    // ------------------------------------------------------------------------
    function install() {
        window.createPeerConnection = function (peerId) {
            return (typeof peerConnections !== "undefined" && peerConnections[peerId]) || buildPeerConnection(peerId);
        };
        window.handleVideoSseEvent = handleEvent;
        window.stopScreenSharing = stopShare;

        window.mxMedia = {
            setCamera: setCamera,
            setMic: setMic,
            startShare: startShare,
            stopShare: stopShare,
            broadcastTrack: broadcastTrack,
            refreshPreview: refreshLocalPreview,
            isSharing: () => !!screenStream,
            localStream: () => (screenStream || (typeof localStream !== "undefined" ? localStream : null)),
            remoteStream: (peerId) => remoteStreams[peerId] || null,
            remoteStreams: () => remoteStreams,
            speakingIds: () => Object.keys(meters).filter((k) => {
                const node = document.querySelector('[data-mx-participant="' + k + '"]');
                return node && node.classList.contains("mx-speaking-row");
            }),
            repaintButtons: repaintMediaButtons,
            chimeJoin: chimeJoin,
            chimeLeave: chimeLeave,
            peers: () => (typeof peerConnections !== "undefined" ? Object.keys(peerConnections) : [])
        };

        hookControls();

        if (typeof window.joinMeetingRoom === "function" && !window.joinMeetingRoom.__mxChimed) {
            const origJoin = window.joinMeetingRoom;
            const wrappedJoin = async function () {
                const result = await origJoin.apply(this, arguments);
                chimeJoin();
                return result;
            };
            wrappedJoin.__mxChimed = true;
            window.joinMeetingRoom = wrappedJoin;
        }

        if (typeof window.leaveMeetingRoom === "function" && !window.leaveMeetingRoom.__mxChimed) {
            const origLeave = window.leaveMeetingRoom;
            const wrappedLeave = async function () {
                chimeLeave();
                Object.keys(meters).forEach(stopSpeaking);
                paintMicLevel(0, 1);
                return origLeave.apply(this, arguments);
            };
            wrappedLeave.__mxChimed = true;
            window.leaveMeetingRoom = wrappedLeave;
        }

        setInterval(() => {
            hookControls();
            watchLocalSpeaking();
            if (typeof currentRoom !== "undefined" && currentRoom) {
                refreshLocalPreview();
                repaintMediaButtons();
            }
            // Ensure any remote video with live stream is playing
            Object.keys(remoteStreams).forEach((peerId) => {
                const s = remoteStreams[peerId];
                if (s) {
                    playRemoteAudio(peerId, s);
                    updateRemoteTile(peerId, s);
                }
            });
        }, 1200);

        console.log("%c[MedAstraX] Meeting media layer ready — ultra-low latency & multi-user video active",
            "color:#00a896;font-weight:600");
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
    else install();
})();