// --- PROJET A.E.G.I.S : ÉMETTEUR CAMÉRA SMARTPHONE (REDMI A3) ---

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
let currentResolution = { width: 640, height: 480 };
let wakeLock = null;
let isStreamingActive = true;
let phoneIceQueue = [];

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
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
            console.log('✅ Écran maintenu allumé');
        }
    } catch (err) {
        console.warn('WakeLock:', err);
    }
}

// --- 3. DÉMARRAGE CAMÉRA ---
async function startCamera() {
    setStatus('init', 'DÉMARRAGE CAMÉRA...');

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
        audio: false,
        video: {
            facingMode: currentFacingMode,
            width: { ideal: currentResolution.width },
            height: { ideal: currentResolution.height },
            frameRate: { ideal: 30, max: 30 }
        }
    };

    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoEl.srcObject = localStream;

        if (currentFacingMode === 'user') {
            videoEl.style.transform = 'scaleX(-1)';
        } else {
            videoEl.style.transform = 'scaleX(1)';
        }

        videoEl.onloadedmetadata = () => {
            statResolution.textContent = `${videoEl.videoWidth}x${videoEl.videoHeight}`;
            console.log(`📹 Caméra prête : ${videoEl.videoWidth}x${videoEl.videoHeight}`);
            
            if (peerConnection) {
                const videoTrack = localStream.getVideoTracks()[0];
                const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) {
                    sender.replaceTrack(videoTrack);
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
        alert("Permission caméra refusée. Vérifie les paramètres de Chrome.");
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

                        // Vider la file d'attente ICE
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

// --- 5. CRÉATION OFFRE WEBRTC ---
async function createWebRTCOffer() {
    if (peerConnection) {
        peerConnection.close();
    }

    phoneIceQueue = [];
    peerConnection = new RTCPeerConnection(rtcConfig);

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
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
            setStatus('live', 'LIVE STREAMING');
        } else if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            setStatus('waiting', 'CONNEXION PERDUE');
        }
    };

    try {
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: false,
            offerToReceiveVideo: false
        });
        await peerConnection.setLocalDescription(offer);

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'offer',
                sdp: peerConnection.localDescription
            }));
            console.log('📤 Offre WebRTC envoyée au PC');
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
    if (currentResolution.width === 640) {
        currentResolution = { width: 1280, height: 720 };
        resText.textContent = '720p';
    } else {
        currentResolution = { width: 640, height: 480 };
        resText.textContent = '480p';
    }
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

window.addEventListener('DOMContentLoaded', startCamera);
