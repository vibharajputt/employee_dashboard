/**
 * ==========================================================================
 * MEDASTRAX MEETING MEDIA LAYER
 * ==========================================================================
 * Load AFTER app.js and meeting-extras.js:
 *     <script src="app.js"></script>
 *     <script src="auth-ui.js"></script>
 *     <script src="meeting-extras.js"></script>
 *     <script src="meeting-webrtc.js"></script>
 *
 * WHAT WAS BROKEN
 * ---------------
 * 1. GLARE. When someone joined, the newcomer created an offer for every
 *    existing participant, and every existing participant ALSO created an offer
 *    for the newcomer. Two offers crossing on one connection puts both peers in
 *    "have-local-offer", so setRemoteDescription throws and the connection dies.
 *    That is why audio reached some people and not others, seemingly at random.
 *
 * 2. NO RENEGOTIATION. Tracks were attached with addTrack() only at the moment
 *    the connection was built. Turning the camera on later, or starting a screen
 *    share, added nothing to an existing connection and never renegotiated — so
 *    only the sender ever saw their own video.
 *
 * 3. NO SENDER WHEN MUTED. If you joined with the camera off there was no video
 *    sender at all, so replaceTrack() had nothing to swap and screen sharing
 *    silently went nowhere.
 *
 * THE FIX
 * -------
 * Perfect negotiation (the pattern from the WebRTC spec) plus pre-created
 * transceivers, so every connection always has one audio and one video slot
 * ready to be filled by replaceTrack() — no renegotiation needed to unmute,
 * enable the camera, or start sharing.
 * ==========================================================================
 */

(function () {
    "use strict";

    // ------------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------------
    const senders = {};        // peerId -> { audio: RTCRtpSender, video: RTCRtpSender }
    const remoteStreams = {};  // peerId -> MediaStream
    const negotiation = {};    // peerId -> { makingOffer, ignoreOffer, polite }

    const ICE_SERVERS = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        // STUN alone cannot punch through symmetric NAT (typical home router or
        // mobile data). A TURN relay is required for those peers to connect at all.
        { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
        { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
    ];

    function el(id) { return document.getElementById(id); }
    function me() { return (typeof currentUser !== "undefined" && currentUser) ? currentUser.id : ""; }
    function log() { console.log.apply(console, ["[RTC]"].concat([].slice.call(arguments))); }

    // ------------------------------------------------------------------------
    // Peer connection
    // ------------------------------------------------------------------------
    function buildPeerConnection(peerId) {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 });

        // Deterministic roles: the peer with the larger id is "polite" and yields
        // when two offers collide. Both sides compute the same answer.
        negotiation[peerId] = {
            makingOffer: false,
            ignoreOffer: false,
            polite: me() > peerId
        };

        // Reserve one slot per media kind up front. With these in place, turning the
        // camera on or starting a screen share is a replaceTrack() on an existing
        // sender instead of a structural change that needs renegotiating.
        const audioTx = pc.addTransceiver("audio", { direction: "sendrecv" });
        const videoTx = pc.addTransceiver("video", { direction: "sendrecv" });
        senders[peerId] = { audio: audioTx.sender, video: videoTx.sender };

        attachLocalTracks(peerId);

        pc.onicecandidate = (e) => {
            if (e.candidate) sendSignal(peerId, "ice-candidate", e.candidate);
        };

        pc.ontrack = (e) => {
            if (!remoteStreams[peerId]) remoteStreams[peerId] = new MediaStream();
            const stream = remoteStreams[peerId];
            if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);

            // The <video> element keeps the same MediaStream object, so tracks added
            // later (camera switched on mid-call) appear without re-attaching.
            addRemoteVideo(peerId, stream);
            watchSpeaking(peerId, stream);

            e.track.onended = () => {
                try { stream.removeTrack(e.track); } catch (err) { }
            };
        };

        pc.onnegotiationneeded = async () => {
            const state = negotiation[peerId];
            try {
                state.makingOffer = true;
                await pc.setLocalDescription();
                sendSignal(peerId, "offer", pc.localDescription);
            } catch (err) {
                console.error("[RTC] negotiation failed for", peerId, err);
            } finally {
                state.makingOffer = false;
            }
        };

        pc.oniceconnectionstatechange = () => {
            log(peerId, "ice:", pc.iceConnectionState);
            if (pc.iceConnectionState === "failed") {
                console.warn("[RTC] no network path to", peerId, "— restarting ICE");
                try { pc.restartIce(); } catch (err) { }
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "connected") log(peerId, "connected ✅");
        };

        peerConnections[peerId] = pc;
        return pc;
    }

    /** Push whatever local tracks exist right now into this peer's slots. */
    function attachLocalTracks(peerId) {
        const s = senders[peerId];
        if (!s) return;
        const stream = (typeof localStream !== "undefined") ? localStream : null;
        const audio = stream ? stream.getAudioTracks()[0] : null;
        const video = stream ? stream.getVideoTracks()[0] : null;
        if (s.audio) s.audio.replaceTrack(audio || null).catch(() => { });
        if (s.video) s.video.replaceTrack(video || null).catch(() => { });
    }

    /** Broadcast a track change (camera on/off, screen share) to everyone. */
    function broadcastTrack(kind, track) {
        Object.keys(senders).forEach((peerId) => {
            const s = senders[peerId];
            if (s && s[kind]) {
                s[kind].replaceTrack(track || null)
                    .catch((err) => console.warn("[RTC] replaceTrack", kind, peerId, err.message));
            }
        });
        log("broadcast", kind, track ? "track" : "null", "to", Object.keys(senders).length, "peer(s)");
    }

    // ------------------------------------------------------------------------
    // Signalling — perfect negotiation
    // ------------------------------------------------------------------------
    async function handleEvent(event) {
        const type = event.type;
        const peerId = event.senderId;
        const data = event.data;

        if (type === "user-joined") {
            // Build the connection but do NOT force an offer: adding transceivers
            // fires negotiationneeded on both sides and the polite/impolite rules
            // below settle any collision. Forcing offers here was the original glare.
            if (!peerConnections[peerId]) buildPeerConnection(peerId);
            if (typeof showToast === "function") {
                showToast((event.username || "Someone") + " joined the meeting", "info");
            }
            return;
        }

        if (type === "user-left") {
            cleanupPeer(peerId);
            return;
        }

        let pc = peerConnections[peerId];
        if (!pc) pc = buildPeerConnection(peerId);
        const state = negotiation[peerId] || { polite: true };

        try {
            if (type === "offer" || type === "answer") {
                const description = new RTCSessionDescription(data);
                const collision = description.type === "offer" &&
                    (state.makingOffer || pc.signalingState !== "stable");

                state.ignoreOffer = !state.polite && collision;
                if (state.ignoreOffer) {
                    log("ignoring colliding offer from", peerId, "(impolite peer)");
                    return;
                }

                if (collision) {
                    // Polite peer rolls back its own offer and accepts theirs.
                    await Promise.all([
                        pc.setLocalDescription({ type: "rollback" }).catch(() => { }),
                        pc.setRemoteDescription(description)
                    ]);
                } else {
                    await pc.setRemoteDescription(description);
                }

                if (description.type === "offer") {
                    await pc.setLocalDescription();
                    sendSignal(peerId, "answer", pc.localDescription);
                }
                return;
            }

            if (type === "ice-candidate") {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(data));
                } catch (err) {
                    // Candidates that arrive while an offer was ignored are expected.
                    if (!state.ignoreOffer) console.warn("[RTC] ICE candidate rejected:", err.message);
                }
            }
        } catch (err) {
            console.error("[RTC] signalling error from", peerId, err);
        }
    }

    function cleanupPeer(peerId) {
        const pc = peerConnections[peerId];
        if (pc) { try { pc.close(); } catch (e) { } }
        delete peerConnections[peerId];
        delete senders[peerId];
        delete negotiation[peerId];
        delete remoteStreams[peerId];
        stopSpeaking(peerId);
        const tile = el("video-container-" + peerId);
        if (tile) tile.remove();
    }

    // ------------------------------------------------------------------------
    // Speaking indicator — the animated mic, like Meet
    // ------------------------------------------------------------------------
    const meters = {};   // id -> { ctx, raf }

    function watchSpeaking(id, stream) {
        if (!stream || meters[id]) return;
        const audio = stream.getAudioTracks();
        if (!audio.length) return;

        let ctx;
        try {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (err) { return; }

        const source = ctx.createMediaStreamSource(new MediaStream([audio[0]]));
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);

        const buf = new Uint8Array(analyser.frequencyBinCount);
        let speaking = false;
        let quietFrames = 0;
        let noiseFloor = 0.02;      // adapts to the room's background hum
        let loudFrames = 0;

        // Speech lives roughly in 85 Hz - 3 kHz. Measuring only that band keeps fan
        // noise, keyboard clatter and hiss from lighting up the indicator.
        const nyquist = ctx.sampleRate / 2;
        const binHz = nyquist / analyser.frequencyBinCount;
        const lowBin = Math.max(1, Math.floor(85 / binHz));
        const highBin = Math.min(analyser.frequencyBinCount - 1, Math.ceil(3000 / binHz));

        const tick = () => {
            // A muted or stopped track must never animate, whatever the analyser says.
            const track = stream.getAudioTracks()[0];
            const audible = track && track.readyState === "live" && track.enabled &&
                (id !== "local" || (typeof isMicOn === "undefined" || isMicOn));

            if (!audible) {
                if (speaking) { speaking = false; paintSpeaking(id, false); }
                meters[id].raf = requestAnimationFrame(tick);
                return;
            }

            analyser.getByteFrequencyData(buf);
            let sum = 0;
            for (let i = lowBin; i <= highBin; i++) sum += buf[i] * buf[i];
            const level = Math.sqrt(sum / (highBin - lowBin + 1)) / 255;   // 0..1

            // Track the quiet baseline slowly so the threshold follows the room.
            if (!speaking && level < noiseFloor * 1.5) {
                noiseFloor = noiseFloor * 0.95 + level * 0.05;
            }
            const threshold = Math.max(0.075, noiseFloor * 3.2);

            if (level > threshold) {
                quietFrames = 0;
                loudFrames++;
                // Require a few consecutive frames so a single click cannot trigger it.
                if (!speaking && loudFrames > 3) { speaking = true; paintSpeaking(id, true); }
            } else {
                loudFrames = 0;
                quietFrames++;
                // Hold briefly so ordinary pauses between words do not flicker.
                if (speaking && quietFrames > 14) { speaking = false; paintSpeaking(id, false); }
            }
            meters[id].raf = requestAnimationFrame(tick);
        };

        meters[id] = { ctx: ctx, raf: 0 };
        tick();
    }

    function stopSpeaking(id) {
        const m = meters[id];
        if (!m) return;
        cancelAnimationFrame(m.raf);
        try { m.ctx.close(); } catch (e) { }
        delete meters[id];
        paintSpeaking(id, false);
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

    // ------------------------------------------------------------------------
    // Camera / mic / screen share, routed through the sender slots
    // ------------------------------------------------------------------------
    async function setCamera(on) {
        if (typeof localStream === "undefined" || !localStream) return;

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
            return;
        }

        try {
            const fresh = await navigator.mediaDevices.getUserMedia({ video: true });
            const track = fresh.getVideoTracks()[0];
            localStream.getVideoTracks().forEach((t) => { try { t.stop(); } catch (e) { } localStream.removeTrack(t); });
            localStream.addTrack(track);
            broadcastTrack("video", track);
            if (typeof isCamOn !== "undefined") isCamOn = true;

            const v = el("local-video-element");
            if (v) { v.srcObject = localStream; v.play().catch(() => { }); }
            const avatar = el("video-avatar-local");
            if (avatar) avatar.classList.add("hidden");
            log("camera on — track sent to all peers");
        } catch (err) {
            if (typeof showToast === "function") showToast("Camera unavailable: " + err.message, "error");
        }
    }

    function setMic(on) {
        if (typeof localStream === "undefined" || !localStream) return;
        // Audio stays enabled/disabled rather than stopped: re-acquiring a mic adds
        // a noticeable gap, and there is no privacy light to worry about.
        localStream.getAudioTracks().forEach((t) => { t.enabled = on; });
        if (typeof isMicOn !== "undefined") isMicOn = on;
        paintSpeaking("local", false);   // clear immediately either way
        log("mic", on ? "on" : "muted");
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
        broadcastTrack("video", track);          // every peer sees the screen
        if (typeof isScreenSharing !== "undefined") isScreenSharing = true;

        const v = el("local-video-element");
        if (v) { v.srcObject = screenStream; v.play().catch(() => { }); }
        const avatar = el("video-avatar-local");
        if (avatar) avatar.classList.add("hidden");

        track.onended = () => stopShare();          // browser's own "Stop sharing"
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
        if (v && typeof localStream !== "undefined") { v.srcObject = localStream; v.play().catch(() => { }); }
        const avatar = el("video-avatar-local");
        if (avatar && !(typeof isCamOn !== "undefined" && isCamOn)) avatar.classList.remove("hidden");

        if (!silent && typeof showToast === "function") showToast("Screen sharing stopped", "info");
        log("screen share stopped");
    }

    // ------------------------------------------------------------------------
    // Take over the existing control buttons
    // ------------------------------------------------------------------------
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
            isHandRaised: (typeof isHandRaised !== "undefined") ? isHandRaised : false
        });
    }

    function hookControls() {
        intercept("btn-toggle-cam", async () => {
            const on = (typeof isCamOn !== "undefined") ? isCamOn : true;
            await setCamera(!on);
            refreshLocalLabel();
            emitStatus();
            if (typeof renderParticipantsList === "function") renderParticipantsList();
        });

        intercept("btn-toggle-mic", () => {
            const on = (typeof isMicOn !== "undefined") ? isMicOn : true;
            setMic(!on);
            refreshLocalLabel();
            emitStatus();
            if (typeof renderParticipantsList === "function") renderParticipantsList();
        });

        intercept("btn-share-screen", () => {
            if (screenStream) stopShare(); else startShare();
        });
    }

    /** Keep the "You 🎤 📹" chips on the local tile in step. */
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
    // Install
    // ------------------------------------------------------------------------
    function install() {
        // app.js calls these as bare identifiers, which resolve to window
        // properties — so replacing them here replaces them everywhere.
        window.createPeerConnection = function (peerId) {
            return peerConnections[peerId] || buildPeerConnection(peerId);
        };
        window.handleVideoSseEvent = handleEvent;
        window.stopScreenSharing = stopShare;

        window.mxMedia = {
            setCamera: setCamera,
            setMic: setMic,
            startShare: startShare,
            stopShare: stopShare,
            broadcastTrack: broadcastTrack,
            peers: () => Object.keys(peerConnections)
        };

        hookControls();
        setInterval(() => {
            hookControls();
            watchLocalSpeaking();
            // Re-sync senders if the local stream was swapped out from under us.
            Object.keys(senders).forEach((peerId) => {
                const s = senders[peerId];
                if (!s || !s.audio) return;
                const want = (typeof localStream !== "undefined" && localStream)
                    ? localStream.getAudioTracks()[0] : null;
                if (want && s.audio.track !== want) s.audio.replaceTrack(want).catch(() => { });
            });
        }, 1500);

        console.log("%c[MedAstraX] Meeting media layer ready — perfect negotiation active",
            "color:#00a896;font-weight:600");
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
    else install();
})();