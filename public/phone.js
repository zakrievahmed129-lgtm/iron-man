// --- PROJET A.E.G.I.S : ÉMETTEUR CAMÉRA SMARTPHONE (REDMI A3 & TOUT SMARTPHONE) ---

const videoEl = document.getElementById('cameraPreview');
const statusBadge = document.getElementById('statusBadge');
const statusText = document.getElementById('statusText');
const btnSwitchCam = document.getElementById('btnSwitchCam');
const btnStreamToggle = document.getElementById('btnStreamToggle');
const streamBtnText = document.getElementById('streamBtnText');
const btnResToggle = document.getElementById('btnResToggle');
const resText = document.getElementById('resText');

const statResolution = document.getElementById('statResolution');
const statFps = document.getElementById('statFps');
const statLatency = document.getElementById('statLatency');

let localStream = null;
let peerConnection = null;
let ws = null;
let currentFacingMode = 'user';
let currentResolutionIndex = 0;
const RESOLUTIONS = [
    { label: '480p @ 60fps', width: 640, height: 480 },
    { label: '720p @ 60fps', width: 1280, height: 720 },
    { label: '360p @ 60fps', width: 480, height: 360 }
];

let wakeLock = null;
let isStreamingActive = true;
let phoneIceQueue = [];

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
};

// --- 1. GESTION DU STATUT UI ---
function setStatus(type, message) {
    statusBadge.className = `status-badge status-${type}`;
    statusText.textContent = message;
}

// --- 2. VERROUILLAGE DE L'ÉCRAN (WAKELOCK) ---
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('✅ Écran maintenu allumé sans mise en veille');
        }
    } catch (err) {
        console.warn('WakeLock:', err);
    }
}

// --- 3. DÉMARRAGE CAMÉRA HAUTE VITESSE 60 FPS ---
async function startCamera() {
    const res = RESOLUTIONS[currentResolutionIndex];
    setStatus('init', `DÉMARRAGE ${res.label}...`);

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
        audio: false,
        video: {
            facingMode: currentFacingMode,
            width: { ideal: res.width, max: res.width },
            height: { ideal: res.height, max: res.height },
            frameRate: { ideal: 60, min: 30 }
        }
    };

    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        const videoTrack = localStream.getVideoTracks()[0];

        // Optimisation WebRTC : Priorité au mouvement fluide
        if (videoTrack && 'contentHint' in videoTrack) {
            videoTrack.contentHint = 'motion';
        }

        videoEl.srcObject = localStream;

        if (currentFacingMode === 'user') {
            videoEl.style.transform = 'scaleX(-1)';
        } else {
            videoEl.style.transform = 'scaleX(1)';
        }

        videoEl.onloadedmetadata = () => {
            const actualWidth = videoEl.videoWidth;
            const actualHeight = videoEl.videoHeight;
            statResolution.textContent = `${actualWidth}x${actualHeight}`;
            console.log(`📹 Caméra 60 FPS prête : ${actualWidth}x${actualHeight}`);
            
            if (peerConnection) {
                const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender && videoTrack) {
                    sender.replaceTrack(videoTrack);
                    applySenderHighSpeedSettings(sender);
                }
            }
        };

        requestWakeLock();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            initWebSocket();
        }
    } catch (err) {
        console.error('Erreur accès caméra:', err);
        setStatus('error', 'CAMÉRA REFUSÉE');
        alert("Permission caméra refusée. Vérifie les paramètres du navigateur.");
    }
}

// --- 4. SIGNALISATION WEBSOCKET ---
function initWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;

    setStatus('waiting', 'CONNEXION SERVEUR...');
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('🔗 WebSocket connecté');
        ws.send(JSON.stringify({ type: 'register', role: 'phone' }));
        startPingLoop();
    };

    ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'peer_status':
                    if (data.status === 'waiting_for_pc') {
                        setStatus('waiting', 'EN ATTENTE DU PC...');
                    } else if (data.status === 'pc_ready') {
                        setStatus('waiting', 'PC DÉTECTÉ, CONNEXION...');
                        createWebRTCOffer();
                    } else if (data.status === 'pc_disconnected') {
                        setStatus('waiting', 'PC DÉCONNECTÉ');
                        if (peerConnection) {
                            peerConnection.close();
                            peerConnection = null;
                        }
                        phoneIceQueue = [];
                    }
                    break;

                case 'answer':
                    if (peerConnection) {
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
                        console.log('✅ Answer SDP appliquée');

                        while (phoneIceQueue.length > 0) {
                            const cand = phoneIceQueue.shift();
                            try {
                                await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
                            } catch(e) {}
                        }
                    }
                    break;

                case 'candidate':
                    if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                    } else {
                        phoneIceQueue.push(data.candidate);
                    }
                    break;

                case 'pong':
                    const latency = Date.now() - data.timestamp;
                    statLatency.textContent = `${latency} ms`;
                    break;
            }
        } catch (err) {
            console.error('Erreur message WS:', err);
        }
    };

    ws.onclose = () => {
        console.warn('⚠️ WebSocket fermé. Reconnexion...');
        setStatus('error', 'SERVEUR DÉCONNECTÉ');
        setTimeout(initWebSocket, 2000);
    };
}

// Boost de débit binaire pour zéro saccade et fluidité maximale
function boostSdpBitrate(sdp) {
    const lines = sdp.split('\r\n');
    const newLines = [];
    for (const line of lines) {
        newLines.push(line);
        if (line.startsWith('m=video')) {
            newLines.push('b=AS:4500');
            newLines.push('b=TIAS:4500000');
        }
    }
    return newLines.join('\r\n');
}

function applySenderHighSpeedSettings(sender) {
    try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = 4500000; // 4.5 Mbps
        params.encodings[0].maxFramerate = 60;
        params.encodings[0].priority = 'high';
        params.encodings[0].networkPriority = 'high';
        sender.setParameters(params).catch(() => {});
    } catch (e) {}
}

// --- 5. CRÉATION OFFRE WEBRTC OPTIMISÉE 60 FPS ---
async function createWebRTCOffer() {
    if (peerConnection) {
        peerConnection.close();
    }

    phoneIceQueue = [];
    peerConnection = new RTCPeerConnection(rtcConfig);

    if (localStream) {
        localStream.getTracks().forEach(track => {
            const sender = peerConnection.addTrack(track, localStream);
            applySenderHighSpeedSettings(sender);
        });
    }

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'candidate',
                candidate: event.candidate
            }));
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log('État WebRTC Phone:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            setStatus('live', 'LIVE 60 FPS ULTRA-FLUIDE');
        } else if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            setStatus('waiting', 'CONNEXION PERDUE');
        }
    };

    try {
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: false,
            offerToReceiveVideo: false
        });

        // Application du boost de débit vidéo
        offer.sdp = boostSdpBitrate(offer.sdp);
        await peerConnection.setLocalDescription(offer);

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'offer',
                sdp: peerConnection.localDescription
            }));
            console.log('📤 Offre WebRTC 60 FPS transmise au PC');
        }
    } catch (err) {
        console.error('Erreur création offre:', err);
    }
}

// --- 6. FPS ET PING ---
let lastFrameTime = performance.now();
let frameCount = 0;
function updateFps() {
    frameCount++;
    const now = performance.now();
    if (now - lastFrameTime >= 1000) {
        statFps.textContent = frameCount;
        frameCount = 0;
        lastFrameTime = now;
    }
    requestAnimationFrame(updateFps);
}
requestAnimationFrame(updateFps);

function startPingLoop() {
    setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        }
    }, 3000);
}

// --- 7. BOUTONS ---
btnSwitchCam.addEventListener('click', () => {
    currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
    console.log('Switch caméra:', currentFacingMode);
    startCamera();
});

btnResToggle.addEventListener('click', () => {
    currentResolutionIndex = (currentResolutionIndex + 1) % RESOLUTIONS.length;
    resText.textContent = RESOLUTIONS[currentResolutionIndex].label.split(' ')[0];
    startCamera();
});

btnStreamToggle.addEventListener('click', () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            isStreamingActive = videoTrack.enabled;
            streamBtnText.textContent = isStreamingActive ? 'COUPER FLUX' : 'ACTIVER FLUX';
            btnStreamToggle.classList.toggle('primary', isStreamingActive);
        }
    }
});

window.addEventListener('DOMContentLoaded', () => {
    resText.textContent = RESOLUTIONS[currentResolutionIndex].label.split(' ')[0];
    startCamera();
});
