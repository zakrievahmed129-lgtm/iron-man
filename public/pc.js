// --- PROJET A.E.G.I.S : MOTEUR SPATIAL 60 FPS, FILTRE 1€ ANTI-TREMBLEMENT & PERSISTANCE ARRIÈRE-PLAN ---

// 1. Éléments DOM
const remoteVideo = document.getElementById('remoteVideo');
const overlayCanvas = document.getElementById('overlayCanvas');
const ctx = overlayCanvas.getContext('2d');
const waitingOverlay = document.getElementById('waitingOverlay');

// Statuts En-tête
const serverDot = document.getElementById('serverDot');
const serverStatus = document.getElementById('serverStatus');
const mouseBridgeDot = document.getElementById('mouseBridgeDot');
const mouseBridgeStatus = document.getElementById('mouseBridgeStatus');
const streamDot = document.getElementById('streamDot');
const streamStatus = document.getElementById('streamStatus');

// Contrôles Souris
const chkMouseControl = document.getElementById('chkMouseControl');
const lblMouseControl = document.getElementById('lblMouseControl');
const mouseStatusCard = document.getElementById('mouseStatusCard');
const mouseStatusDot = document.getElementById('mouseStatusDot');
const mouseStatusTitle = document.getElementById('mouseStatusTitle');
const mouseStatusSub = document.getElementById('mouseStatusSub');
const mouseActionBadge = document.getElementById('mouseActionBadge');

// Jauge Défilement (Scroll)
const scrollMeterBox = document.getElementById('scrollMeterBox');
const scrollIcon = document.getElementById('scrollIcon');
const scrollTitle = document.getElementById('scrollTitle');
const scrollVal = document.getElementById('scrollVal');
const scrollThumb = document.getElementById('scrollThumb');

// Réglages Curseurs & Précision
const rangeSensitivity = document.getElementById('rangeSensitivity');
const valSensitivity = document.getElementById('valSensitivity');
const rangeSmoothing = document.getElementById('rangeSmoothing');
const valSmoothing = document.getElementById('valSmoothing');
const rangePinchThresh = document.getElementById('rangePinchThresh');
const valPinchThresh = document.getElementById('valPinchThresh');
const rangeScrollSpeed = document.getElementById('rangeScrollSpeed');
const valScrollSpeed = document.getElementById('valScrollSpeed');
const chkMirrorX = document.getElementById('chkMirrorX');
const chkAntiSlip = document.getElementById('chkAntiSlip');
const chkHoloReticle = document.getElementById('chkHoloReticle');

// Panneau Gestes & Coordonnées
const gestureIcon = document.getElementById('gestureIcon');
const gestureName = document.getElementById('gestureName');
const gestureDesc = document.getElementById('gestureDesc');
const pinchPercent = document.getElementById('pinchPercent');
const pinchFill = document.getElementById('pinchFill');

const cursorScreenX = document.getElementById('cursorScreenX');
const cursorScreenY = document.getElementById('cursorScreenY');
const coordZ = document.getElementById('coordZ');

// Télémétrie
const teleScreenRes = document.getElementById('teleScreenRes');
const teleRes = document.getElementById('teleRes');
const teleFpsVideo = document.getElementById('teleFpsVideo');
const teleFpsAI = document.getElementById('teleFpsAI');
const telePing = document.getElementById('telePing');
const chkAudioFeedback = document.getElementById('chkAudioFeedback');

// Variables Réseau & WebRTC
let ws = null;
let peerConnection = null;
let handsDetector = null;
let audioCtx = null;
let iceCandidateQueue = [];

// Configuration Écran Windows & Curseur
let screenWidth = window.screen.width || 1920;
let screenHeight = window.screen.height || 1080;
let smoothCursorX = screenWidth / 2;
let smoothCursorY = screenHeight / 2;
let targetCursorX = screenWidth / 2;
let targetCursorY = screenHeight / 2;
let isMouseBridgeReady = false;
let lastSentX = -1;
let lastSentY = -1;

// Anti-dérapage au clic
let lockedCursorX = null;
let lockedCursorY = null;
let isAnchorLocked = false;

// Variables Gestes & Pincement (Click & Scroll)
let smoothPinchPct = 0;
let isPinchedState = false;
let gestureHistory = [];
let stableGesture = 'OPEN';

let pinchStartTime = 0;
let pinchStartHandY = 0;
let pinchLastHandY = 0;
let pinchStartScreenY = 0;
let isScrollActive = false;
let scrollAccumulator = 0;
let lastClickTime = 0;

// Geste Peace (Clic Droit)
let peaceStartTime = 0;
let peaceTriggered = false;

// Effets visuels holographiques & Réticule
let shockwaves = [];
let reticleAngle = 0;
let latestLandmarks = null;
let latestHandedness = 'MAIN';

// Canvas Hors-Écran Dédié pour Inférence IA 60 FPS (320x240)
const offscreenCanvas = document.createElement('canvas');
offscreenCanvas.width = 320;
offscreenCanvas.height = 240;
const offCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

// Compteurs FPS
let renderFrameCount = 0;
let aiFrameCount = 0;
let lastFpsTime = performance.now();

// Configuration WebRTC standard
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ============================================================================
// --- 2. FILTRE 1€ (ONE EURO FILTER) : DOUCEUR & ZÉRO TREMBLEMENT ---
// ============================================================================

class LowPassFilter {
    constructor(alpha, initVal = 0) {
        this.s = initVal;
        this.setAlpha(alpha);
        this.initialized = false;
    }
    setAlpha(alpha) {
        this.alpha = Math.max(0, Math.min(1, alpha));
    }
    filter(val) {
        if (!this.initialized) {
            this.s = val;
            this.initialized = true;
            return val;
        }
        this.s = this.alpha * val + (1.0 - this.alpha) * this.s;
        return this.s;
    }
    last() { return this.s; }
}

class OneEuroFilter {
    constructor(freq = 60, minCutoff = 0.5, beta = 0.015, dCutoff = 1.0) {
        this.freq = freq;
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
        this.xFilter = new LowPassFilter(this.alpha(this.minCutoff));
        this.dxFilter = new LowPassFilter(this.alpha(this.dCutoff));
        this.lastTime = null;
    }
    alpha(cutoff) {
        const te = 1.0 / this.freq;
        const tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / te);
    }
    setCutoffs(minCutoff, beta) {
        this.minCutoff = minCutoff;
        this.beta = beta;
    }
    filter(val, timestamp = performance.now()) {
        if (this.lastTime !== null && timestamp > this.lastTime) {
            this.freq = Math.max(1, 1000.0 / (timestamp - this.lastTime));
        }
        this.lastTime = timestamp;
        const prevX = this.xFilter.last();
        const dx = this.xFilter.initialized ? (val - prevX) * this.freq : 0;
        const edx = this.dxFilter.filter(dx);
        const cutoff = this.minCutoff + this.beta * Math.abs(edx);
        this.xFilter.setAlpha(this.alpha(cutoff));
        return this.xFilter.filter(val);
    }
}

// Filtres 1€ pour X et Y
const filterX = new OneEuroFilter(60, 0.5, 0.015);
const filterY = new OneEuroFilter(60, 0.5, 0.015);

// Mise à jour des coefficients selon le curseur de lissage
const SMOOTH_PRESETS = [
    { label: 'RÉACTIF', minCutoff: 1.2, beta: 0.04, ease: 0.80 },
    { label: 'FLUIDE', minCutoff: 0.75, beta: 0.025, ease: 0.55 },
    { label: 'TRÈS DOUX', minCutoff: 0.45, beta: 0.015, ease: 0.38 },
    { label: 'ANTI-TREMBLEUR', minCutoff: 0.30, beta: 0.008, ease: 0.26 },
    { label: 'ULTRA SOYEUX', minCutoff: 0.18, beta: 0.004, ease: 0.18 }
];

function updateSmoothingProfile() {
    const level = parseInt(rangeSmoothing.value) || 3;
    const preset = SMOOTH_PRESETS[level - 1] || SMOOTH_PRESETS[2];
    valSmoothing.textContent = preset.label;
    filterX.setCutoffs(preset.minCutoff, preset.beta);
    filterY.setCutoffs(preset.minCutoff, preset.beta);
}

// ============================================================================
// --- 3. PERSISTANCE EN ARRIÈRE-PLAN (MÊME RÉDUIT !) ---
// ============================================================================

// A. Maintien actif de l'AudioContext pour empêcher Chromium de décharger l'onglet
let bgKeepAliveAudio = null;
function initBackgroundAudio() {
    try {
        bgKeepAliveAudio = new (window.AudioContext || window.webkitAudioContext)();
        const osc = bgKeepAliveAudio.createOscillator();
        const gain = bgKeepAliveAudio.createGain();
        gain.gain.value = 0.00001; // Inaudible
        osc.connect(gain);
        gain.connect(bgKeepAliveAudio.destination);
        osc.start();
        console.log('⚡ Keep-Alive Audio actif (empêche la mise en veille de la fenêtre)');
    } catch(e) {}
}

// B. Heartbeat Web Worker 60 Hz : continue de tourner quand la fenêtre est minimisée !
const workerBlob = new Blob([`
    let timer = null;
    self.onmessage = function(e) {
        if (e.data === 'start') {
            if (!timer) {
                timer = setInterval(function() {
                    self.postMessage('tick');
                }, 1000 / 60);
            }
        } else if (e.data === 'stop') {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        }
    };
`], { type: 'application/javascript' });

const bgWorker = new Worker(URL.createObjectURL(workerBlob));
bgWorker.onmessage = function() {
    // Si la fenêtre est masquée ou réduite, le Worker prend le relais à 60 Hz !
    if (document.hidden) {
        processBackgroundCycle();
    }
};
bgWorker.postMessage('start');

function processBackgroundCycle() {
    // 1. Inférence IA en tâche de fond si disponible
    if (!isAiProcessing && remoteVideo.readyState >= 2 && !remoteVideo.paused && handsDetector) {
        isAiProcessing = true;
        try {
            offCtx.drawImage(remoteVideo, 0, 0, 320, 240);
            handsDetector.send({ image: offscreenCanvas }).then(() => {
                isAiProcessing = false;
            }).catch(() => {
                isAiProcessing = false;
            });
            aiFrameCount++;
        } catch(e) {
            isAiProcessing = false;
        }
    }

    // 2. Traitement continu du curseur et transmission souris
    if (latestLandmarks) {
        updateCursorAndGestures(latestLandmarks, latestHandedness);
    }
}

// ============================================================================
// --- 4. MOTEUR AUDIO SCI-FI HAPTIQUE ---
// ============================================================================

function playSciFiTone(freq, duration, type = 'sine') {
    if (!chkAudioFeedback.checked) return;
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.3, audioCtx.currentTime + duration);

        gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
}

function playClickSound() { playSciFiTone(1400, 0.05, 'triangle'); }
function playDoubleClickSound() {
    playSciFiTone(1300, 0.04, 'triangle');
    setTimeout(() => playSciFiTone(1700, 0.05, 'triangle'), 60);
}
function playRightClickSound() {
    playSciFiTone(800, 0.08, 'sine');
    setTimeout(() => playSciFiTone(1100, 0.08, 'sine'), 40);
}
let lastScrollSoundTime = 0;
function playScrollTickSound() {
    const now = performance.now();
    if (now - lastScrollSoundTime > 75) {
        lastScrollSoundTime = now;
        playSciFiTone(350, 0.03, 'sine');
    }
}

// ============================================================================
// --- 5. WEBSOCKET SIGNALISATION & CONTRÔLE SOURIS ---
// ============================================================================

function initWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        serverDot.className = 'dot connected';
        serverStatus.textContent = 'SIGNALISATION : CONNECTÉ';
        ws.send(JSON.stringify({ type: 'register', role: 'pc' }));
        console.log('✅ Connecté au serveur A.E.G.I.S');
        startKeepAlive();
    };

    ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'system_info':
                    if (data.screenWidth && data.screenHeight) {
                        screenWidth = data.screenWidth;
                        screenHeight = data.screenHeight;
                        teleScreenRes.textContent = `${screenWidth}x${screenHeight}`;
                        console.log(`🖥️ Écran Windows synchronisé : ${screenWidth}x${screenHeight}`);
                    }
                    if (data.bridgeReady) {
                        isMouseBridgeReady = true;
                        mouseBridgeDot.className = 'dot connected';
                        mouseBridgeStatus.textContent = 'SOURIS NATIVE : PRÊTE';
                    }
                    break;

                case 'peer_status':
                    if (data.status === 'waiting_for_phone') {
                        streamDot.className = 'dot';
                        streamStatus.textContent = 'FLUX VIDÉO : EN ATTENTE DU TÉLÉPHONE...';
                    } else if (data.status === 'phone_ready') {
                        streamDot.className = 'dot';
                        streamStatus.textContent = 'SMARTPHONE DÉTECTÉ, EN ATTENTE DU FLUX...';
                    } else if (data.status === 'phone_disconnected') {
                        streamDot.className = 'dot disconnected';
                        streamStatus.textContent = 'TÉLÉPHONE DÉCONNECTÉ';
                        waitingOverlay.style.display = 'flex';
                        if (peerConnection) {
                            peerConnection.close();
                            peerConnection = null;
                        }
                        iceCandidateQueue = [];
                        latestLandmarks = null;
                    }
                    break;

                case 'offer':
                    console.log('📥 Offre WebRTC 60 FPS reçue du smartphone');
                    await handleWebRTCOffer(data.sdp);
                    break;

                case 'candidate':
                    if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                    } else {
                        iceCandidateQueue.push(data.candidate);
                    }
                    break;
            }
        } catch (err) {
            console.error('Erreur WS message:', err);
        }
    };

    ws.onclose = () => {
        serverDot.className = 'dot disconnected';
        serverStatus.textContent = 'SIGNALISATION : DÉCONNECTÉ (RECONNEXION...)';
        mouseBridgeDot.className = 'dot disconnected';
        mouseBridgeStatus.textContent = 'SOURIS NATIVE : EN ATTENTE';
        setTimeout(initWebSocket, 2000);
    };
}

function startKeepAlive() {
    setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        }
    }, 5000);
}

function sendMouseMove(x, y) {
    if (!chkMouseControl.checked || !ws || ws.readyState !== WebSocket.OPEN) return;
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx === lastSentX && ry === lastSentY) return;
    lastSentX = rx;
    lastSentY = ry;
    ws.send(JSON.stringify({ type: 'mouse_move', x: rx, y: ry }));
}

function sendMouseClick(button = 'left') {
    if (!chkMouseControl.checked || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'mouse_click', button }));
}

function sendMouseScroll(delta) {
    if (!chkMouseControl.checked || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'mouse_scroll', delta }));
}

// ============================================================================
// --- 6. WEBRTC ZERO-LATENCY RECEIVER ---
// ============================================================================

async function handleWebRTCOffer(sdp) {
    if (peerConnection) {
        peerConnection.close();
    }

    iceCandidateQueue = [];
    peerConnection = new RTCPeerConnection(rtcConfig);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'candidate',
                candidate: event.candidate
            }));
        }
    };

    peerConnection.ontrack = (event) => {
        console.log('📹 Flux vidéo distant direct reçu du smartphone !');
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.play().catch(() => {});

        // Zéro délai tampon WebRTC
        try {
            const receivers = peerConnection.getReceivers();
            for (const r of receivers) {
                if (r.track && r.track.kind === 'video') {
                    if ('playoutDelayHint' in r) {
                        r.playoutDelayHint = 0;
                    }
                }
            }
        } catch (e) {}

        streamDot.className = 'dot connected';
        streamStatus.textContent = 'FLUX VIDÉO : DIRECT 60 FPS';
        waitingOverlay.style.display = 'none';
        playSciFiTone(880, 0.15, 'sine');
    };

    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'connected') {
            streamDot.className = 'dot connected';
            streamStatus.textContent = 'FLUX VIDÉO : DIRECT 60 FPS';
        } else if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            streamDot.className = 'dot disconnected';
            streamStatus.textContent = 'FLUX INTERROMPU';
            waitingOverlay.style.display = 'flex';
        }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));

    while (iceCandidateQueue.length > 0) {
        const candidate = iceCandidateQueue.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {}
    }

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'answer',
            sdp: peerConnection.localDescription
        }));
        console.log('📤 Réponse SDP envoyée au smartphone');
    }
}

// ============================================================================
// --- 7. INITIALISATION MEDIAPIPE HANDS OPTIMISÉ ---
// ============================================================================

function initMediaPipe() {
    handsDetector = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    handsDetector.setOptions({
        maxNumHands: 1,
        modelComplexity: 0,
        minDetectionConfidence: 0.55,
        minTrackingConfidence: 0.60
    });

    handsDetector.onResults(onHandResults);
    console.log('🤖 MediaPipe Hands 60 FPS initialisé');
}

// ============================================================================
// --- 8. BOUCLE DÉCOUPLÉE 60 FPS (RENDU & IA INDÉPENDANTS) ---
// ============================================================================

let isAiProcessing = false;

// Boucle IA en arrière-plan
async function runAiInference() {
    if (!document.hidden && !isAiProcessing && remoteVideo.readyState >= 2 && !remoteVideo.paused && handsDetector) {
        isAiProcessing = true;
        try {
            offCtx.drawImage(remoteVideo, 0, 0, 320, 240);
            await handsDetector.send({ image: offscreenCanvas });
            aiFrameCount++;
        } catch (e) {}
        isAiProcessing = false;
    }

    if (!document.hidden) {
        if ('requestVideoFrameCallback' in remoteVideo) {
            remoteVideo.requestVideoFrameCallback(runAiInference);
        } else {
            setTimeout(runAiInference, 12);
        }
    }
}

// Reprise de l'inférence dès que la fenêtre redevient visible
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        runAiInference();
    }
});

// Boucle Rendu & Mouvement Souris (60 - 120 FPS continus)
function renderLoop() {
    renderFrameCount++;

    if (!document.hidden) {
        if (remoteVideo.readyState >= 2) {
            if (overlayCanvas.width !== remoteVideo.videoWidth || overlayCanvas.height !== remoteVideo.videoHeight) {
                overlayCanvas.width = remoteVideo.videoWidth || 640;
                overlayCanvas.height = remoteVideo.videoHeight || 480;
                teleRes.textContent = `${overlayCanvas.width}x${overlayCanvas.height}`;
            }
        }

        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        drawActiveZoneGuide();
        drawShockwaves();

        if (latestLandmarks) {
            drawHolographicHand(latestLandmarks);
            updateCursorAndGestures(latestLandmarks, latestHandedness);
        } else {
            updateMouseCardState('pause', 'EN ATTENTE DE MAIN', 'Place ta main devant la caméra');
        }
    }

    requestAnimationFrame(renderLoop);
}

// Télémétrie 1s
setInterval(() => {
    const now = performance.now();
    const elapsed = (now - lastFpsTime) / 1000;
    teleFpsVideo.textContent = Math.round(renderFrameCount / elapsed);
    teleFpsAI.textContent = Math.round(aiFrameCount / elapsed);
    renderFrameCount = 0;
    aiFrameCount = 0;
    lastFpsTime = now;
}, 1000);

// ============================================================================
// --- 9. RÉSULTATS MEDIAPIPE & BIOMÉTRIE 3D ---
// ============================================================================

function dist3d(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = (p1.z || 0) - (p2.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function onHandResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        latestLandmarks = null;
        gestureIcon.textContent = '🖐️';
        gestureName.textContent = 'AUCUNE MAIN';
        gestureDesc.textContent = 'Place ta main devant la caméra du téléphone';
        gestureName.style.color = '#ffffff';
        pinchPercent.textContent = '0%';
        pinchFill.style.width = '0%';
        smoothPinchPct = 0;
        isPinchedState = false;
        isScrollActive = false;
        isAnchorLocked = false;
        gestureHistory = [];
        return;
    }

    latestLandmarks = results.multiHandLandmarks[0];
    latestHandedness = results.multiHandedness && results.multiHandedness[0] ? results.multiHandedness[0].label : 'Main';
}

// ============================================================================
// --- 10. GESTES & CONTRÔLE SOURIS AVEC FILTRE 1€ ET ZÉRO TREMBLEMENT ---
// ============================================================================

function updateCursorAndGestures(landmarks, handedness) {
    const wrist = landmarks[0];
    const thumbTip = landmarks[4];
    const indexMcp = landmarks[5];
    const indexPip = landmarks[6];
    const indexTip = landmarks[8];
    const middleMcp = landmarks[9];
    const middlePip = landmarks[10];
    const middleTip = landmarks[12];
    const ringMcp = landmarks[13];
    const ringPip = landmarks[14];
    const ringTip = landmarks[16];
    const pinkyMcp = landmarks[17];
    const pinkyPip = landmarks[18];
    const pinkyTip = landmarks[20];

    coordZ.textContent = wrist.z ? wrist.z.toFixed(3) : '0.000';

    // 1. Échelle de paume hybride 3D
    const palmWidth = dist3d(indexMcp, pinkyMcp);
    const palmHeight = dist3d(wrist, middleMcp);
    const palmScale = Math.max(0.045, (palmWidth * 1.1 + palmHeight) / 2);

    // 2. Extension des doigts
    const isIndexExtended = dist3d(indexTip, indexMcp) > dist3d(indexPip, indexMcp) * 1.20;
    const isMiddleExtended = dist3d(middleTip, middleMcp) > dist3d(middlePip, middleMcp) * 1.20;
    const isRingExtended = dist3d(ringTip, ringMcp) > dist3d(ringPip, ringMcp) * 1.20;
    const isPinkyExtended = dist3d(pinkyTip, pinkyMcp) > dist3d(pinkyPip, pinkyMcp) * 1.20;

    // 3. Calcul du Pincement Normalisé
    const rawPinchRatio = dist3d(thumbTip, indexTip) / palmScale;
    const targetPinchPct = Math.max(0, Math.min(100, Math.round((0.68 - rawPinchRatio) / 0.44 * 100)));
    smoothPinchPct = Math.round(smoothPinchPct * 0.45 + targetPinchPct * 0.55);

    pinchPercent.textContent = `${smoothPinchPct}%`;
    pinchFill.style.width = `${smoothPinchPct}%`;

    const pinchTriggerThresh = parseInt(rangePinchThresh.value) || 68;
    const pinchReleaseThresh = Math.max(35, pinchTriggerThresh - 24);

    const wasPinched = isPinchedState;
    if (!isPinchedState && smoothPinchPct >= pinchTriggerThresh) {
        isPinchedState = true;
    } else if (isPinchedState && smoothPinchPct <= pinchReleaseThresh) {
        isPinchedState = false;
    }

    // 4. Détermination gestuelle
    let detectedRawGesture = 'OPEN';
    if (isPinchedState) {
        detectedRawGesture = 'PINCH';
    } else if (!isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
        detectedRawGesture = 'FIST';
    } else if (isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
        detectedRawGesture = 'POINT';
    } else if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended) {
        detectedRawGesture = 'PEACE';
    } else {
        detectedRawGesture = 'OPEN';
    }

    gestureHistory.push(detectedRawGesture);
    if (gestureHistory.length > 3) gestureHistory.shift();

    const counts = {};
    for (const g of gestureHistory) counts[g] = (counts[g] || 0) + 1;
    let dominant = detectedRawGesture;
    let maxC = 0;
    for (const [g, count] of Object.entries(counts)) {
        if (count > maxC) {
            maxC = count;
            dominant = g;
        }
    }
    if (maxC >= 2) stableGesture = dominant;

    // --- TRACKING CURSEUR SOURIS & FILTRAGE 1€ SOYEUX ---
    const rawX = isPinchedState ? (thumbTip.x + indexTip.x) / 2 : indexTip.x;
    const rawY = isPinchedState ? (thumbTip.y + indexTip.y) / 2 : indexTip.y;

    const normX = chkMirrorX.checked ? (1.0 - rawX) : rawX;
    const normY = rawY;

    // Zone active calibrée (marges de 12%)
    const minX = 0.12, maxX = 0.88;
    const minY = 0.12, maxY = 0.88;
    const clampedX = Math.max(minX, Math.min(maxX, normX));
    const clampedY = Math.max(minY, Math.min(maxY, normY));
    const boxX = (clampedX - minX) / (maxX - minX);
    const boxY = (clampedY - minY) / (maxY - minY);

    const sens = parseFloat(rangeSensitivity.value) || 1.4;
    const rawScreenX = Math.max(0, Math.min(screenWidth, ((boxX - 0.5) * sens + 0.5) * screenWidth));
    const rawScreenY = Math.max(0, Math.min(screenHeight, ((boxY - 0.5) * sens + 0.5) * screenHeight));

    // Application du filtre 1€ : filtre adaptatif haute précision
    const now = performance.now();
    targetCursorX = filterX.filter(rawScreenX, now);
    targetCursorY = filterY.filter(rawScreenY, now);

    // Système Anti-Dérapage au Clic : fige la position au moment exact du pincement
    if (chkAntiSlip.checked && isPinchedState && !isScrollActive) {
        if (!isAnchorLocked) {
            lockedCursorX = smoothCursorX;
            lockedCursorY = smoothCursorY;
            isAnchorLocked = true;
        }
    } else {
        isAnchorLocked = false;
    }

    if (isAnchorLocked) {
        smoothCursorX = lockedCursorX;
        smoothCursorY = lockedCursorY;
    } else {
        // Lissage doux exponentiel vers la cible filtrée
        const dx = targetCursorX - smoothCursorX;
        const dy = targetCursorY - smoothCursorY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Deadzone anti-tremblement : si micro-vibration < 1.8 px, le curseur ne bouge pas
        if (dist >= 1.8) {
            const level = parseInt(rangeSmoothing.value) || 3;
            const preset = SMOOTH_PRESETS[level - 1] || SMOOTH_PRESETS[2];
            const velocityBoost = Math.min(0.45, dist / 200);
            const ease = Math.min(0.95, preset.ease + velocityBoost);

            smoothCursorX += dx * ease;
            smoothCursorY += dy * ease;
        }
    }

    cursorScreenX.textContent = `${Math.round(smoothCursorX)} px`;
    cursorScreenY.textContent = `${Math.round(smoothCursorY)} px`;

    if (!document.hidden && chkHoloReticle.checked) {
        drawHoloReticle(rawX * overlayCanvas.width, rawY * overlayCanvas.height, isPinchedState, isScrollActive);
    }

    // --- LOGIQUE PINCEMENT : CLIC & SCROLL ---
    if (!wasPinched && isPinchedState) {
        pinchStartTime = performance.now();
        pinchStartHandY = normY;
        pinchLastHandY = normY;
        pinchStartScreenY = smoothCursorY;
        isScrollActive = false;
        scrollAccumulator = 0;
        playClickSound();
        spawnShockwave(rawX * overlayCanvas.width, rawY * overlayCanvas.height, '#ff0077');
    }

    if (isPinchedState) {
        const deltaScreenY = smoothCursorY - pinchStartScreenY;
        const deltaHandY = normY - pinchStartHandY;

        // Détection de défilement : pincement maintenu + mouvement vertical
        if (!isScrollActive && (Math.abs(deltaScreenY) > 22 || Math.abs(deltaHandY) > 0.04)) {
            isScrollActive = true;
            isAnchorLocked = false;
            scrollMeterBox.classList.add('active');
        }

        if (isScrollActive) {
            const frameDeltaY = normY - pinchLastHandY;
            const scrollMultiplier = parseFloat(rangeScrollSpeed.value) || 2.0;

            const scrollDelta = -frameDeltaY * 2600 * scrollMultiplier;
            scrollAccumulator += scrollDelta;

            if (Math.abs(scrollAccumulator) >= 18) {
                sendMouseScroll(scrollAccumulator);
                playScrollTickSound();

                const direction = scrollAccumulator > 0 ? 'HAUT' : 'BAS';
                scrollIcon.textContent = scrollAccumulator > 0 ? '⬆️' : '⬇️';
                scrollTitle.textContent = `DÉFILEMENT ${direction}`;
                scrollVal.textContent = `${Math.round(Math.abs(scrollAccumulator))} px`;
                const thumbPos = Math.max(10, Math.min(90, 50 - (scrollAccumulator / 150) * 40));
                scrollThumb.style.left = `${thumbPos}%`;

                scrollAccumulator = 0;
            }

            pinchLastHandY = normY;
            updateMouseCardState('scroll', 'DÉFILEMENT (SCROLL)', 'Glissez la main en haut ou en bas pour scroller');
        } else {
            updateMouseCardState('click', 'PINCEMENT MAINTENU', 'Relâchez rapidement pour cliquer');
        }
    }

    if (wasPinched && !isPinchedState) {
        const pinchDuration = performance.now() - pinchStartTime;
        scrollMeterBox.classList.remove('active');

        if (isScrollActive) {
            isScrollActive = false;
        } else if (pinchDuration < 380) {
            const clickNow = performance.now();
            if (clickNow - lastClickTime < 320) {
                sendMouseClick('double');
                playDoubleClickSound();
                spawnShockwave(rawX * overlayCanvas.width, rawY * overlayCanvas.height, '#00ff88');
                updateMouseCardState('click', 'DOUBLE CLIC DÉTECTÉ', 'Deux clics rapides envoyés');
            } else {
                sendMouseClick('left');
                playClickSound();
                spawnShockwave(rawX * overlayCanvas.width, rawY * overlayCanvas.height, '#ff0077');
                updateMouseCardState('click', 'CLIC GAUCHE DÉCLENCHÉ', 'Clic précis envoyé');
            }
            lastClickTime = clickNow;
        }
        isScrollActive = false;
        isAnchorLocked = false;
    }

    // Clic Droit (Geste Peace)
    if (stableGesture === 'PEACE' && !isPinchedState) {
        if (peaceStartTime === 0) {
            peaceStartTime = performance.now();
            peaceTriggered = false;
        } else if (!peaceTriggered && (performance.now() - peaceStartTime > 340)) {
            sendMouseClick('right');
            playRightClickSound();
            spawnShockwave(rawX * overlayCanvas.width, rawY * overlayCanvas.height, '#00f2fe');
            peaceTriggered = true;
            updateMouseCardState('click', 'CLIC DROIT DÉCLENCHÉ', 'Menu contextuel ouvert');
        }
    } else {
        peaceStartTime = 0;
        peaceTriggered = false;
    }

    // Transmission mouvement souris Windows à 60 Hz
    if (chkMouseControl.checked) {
        if (stableGesture === 'FIST') {
            updateMouseCardState('pause', 'CURSEUR EN PAUSE (POING)', 'Ouvrez la main ou pointez l\'index');
        } else if (isScrollActive) {
            // Mode scroll : curseur fixe
        } else if (!isPinchedState || (performance.now() - pinchStartTime < 200)) {
            sendMouseMove(smoothCursorX, smoothCursorY);
            if (!isPinchedState && stableGesture !== 'PEACE') {
                updateMouseCardState('nav', 'NAVIGATION SOURIS', 'Curseur doux synchronisé avec l\'index');
            }
        }
    } else {
        updateMouseCardState('disabled', 'CONTRÔLE SOURIS DÉSACTIVÉ', 'Appuyez sur [ESPACE] pour activer');
    }

    updateGestureUI(stableGesture, handedness);
}

function updateMouseCardState(state, title, sub) {
    mouseStatusCard.className = `mouse-status-card state-${state}`;
    mouseStatusTitle.textContent = title;
    mouseStatusSub.textContent = sub;

    switch (state) {
        case 'nav':
            mouseActionBadge.textContent = 'ACTIF';
            mouseActionBadge.style.color = 'var(--cyan)';
            mouseActionBadge.style.borderColor = 'var(--cyan)';
            break;
        case 'click':
            mouseActionBadge.textContent = 'CLIC';
            mouseActionBadge.style.color = '#ff0077';
            mouseActionBadge.style.borderColor = '#ff0077';
            break;
        case 'scroll':
            mouseActionBadge.textContent = 'SCROLL';
            mouseActionBadge.style.color = 'var(--yellow)';
            mouseActionBadge.style.borderColor = 'var(--yellow)';
            break;
        case 'pause':
            mouseActionBadge.textContent = 'PAUSE';
            mouseActionBadge.style.color = '#ff8800';
            mouseActionBadge.style.borderColor = '#ff8800';
            break;
        case 'disabled':
            mouseActionBadge.textContent = 'OFF';
            mouseActionBadge.style.color = '#888888';
            mouseActionBadge.style.borderColor = '#888888';
            break;
    }
}

// ============================================================================
// --- 11. RENDU HOLOGRAPHIQUE GPU (ZÉRO SHADOWBLUR CPU) ---
// ============================================================================

function drawActiveZoneGuide() {
    const w = overlayCanvas.width;
    const h = overlayCanvas.height;
    const minX = 0.12 * w;
    const maxX = 0.88 * w;
    const minY = 0.12 * h;
    const maxY = 0.88 * h;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);

    const cornerSize = 14;
    ctx.setLineDash([]);
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(minX, minY + cornerSize); ctx.lineTo(minX, minY); ctx.lineTo(minX + cornerSize, minY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(maxX - cornerSize, minY); ctx.lineTo(maxX, minY); ctx.lineTo(maxX, minY + cornerSize);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(minX, maxY - cornerSize); ctx.lineTo(minX, maxY); ctx.lineTo(minX + cornerSize, maxY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(maxX - cornerSize, maxY); ctx.lineTo(maxX, maxY); ctx.lineTo(maxX, maxY - cornerSize);
    ctx.stroke();

    ctx.restore();
}

function drawHoloReticle(x, y, isPinched, isScrolling) {
    reticleAngle += 0.04;
    ctx.save();
    ctx.translate(x, y);

    const mainColor = isPinched ? '#ff0077' : (isScrolling ? '#ffb703' : '#00f2fe');

    ctx.beginPath();
    ctx.arc(0, 0, isPinched ? 10 : 16, 0, 2 * Math.PI);
    ctx.strokeStyle = isPinched ? 'rgba(255, 0, 119, 0.3)' : 'rgba(0, 242, 254, 0.3)';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, isPinched ? 10 : 16, 0, 2 * Math.PI);
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, 2 * Math.PI);
    ctx.fillStyle = mainColor;
    ctx.fill();

    ctx.rotate(reticleAngle);
    const radius = 24;
    for (let a = 0; a < 4; a++) {
        ctx.beginPath();
        ctx.arc(0, 0, radius, a * Math.PI / 2 + 0.15, (a + 1) * Math.PI / 2 - 0.15);
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    ctx.restore();
}

function spawnShockwave(x, y, color) {
    shockwaves.push({
        x,
        y,
        radius: 8,
        maxRadius: 45,
        alpha: 0.9,
        color
    });
}

function drawShockwaves() {
    for (let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.radius += 3.0;
        sw.alpha -= 0.055;

        if (sw.alpha <= 0 || sw.radius >= sw.maxRadius) {
            shockwaves.splice(i, 1);
            continue;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, 2 * Math.PI);
        ctx.strokeStyle = sw.color;
        ctx.globalAlpha = Math.max(0, sw.alpha);
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
    }
}

function drawHolographicHand(landmarks) {
    const w = overlayCanvas.width;
    const h = overlayCanvas.height;

    const CONNECTIONS = [
        [0,1],[1,2],[2,3],[3,4],
        [0,5],[5,6],[6,7],[7,8],
        [0,9],[9,10],[10,11],[11,12],
        [0,13],[13,14],[14,15],[15,16],
        [0,17],[17,18],[18,19],[19,20],
        [5,9],[9,13],[13,17]
    ];

    // Lueur double-stroke GPU
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.25)';
    ctx.beginPath();
    for (const [start, end] of CONNECTIONS) {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        ctx.moveTo(p1.x * w, p1.y * h);
        ctx.lineTo(p2.x * w, p2.y * h);
    }
    ctx.stroke();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#00f2fe';
    ctx.beginPath();
    for (const [start, end] of CONNECTIONS) {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        ctx.moveTo(p1.x * w, p1.y * h);
        ctx.lineTo(p2.x * w, p2.y * h);
    }
    ctx.stroke();

    for (let j = 0; j < landmarks.length; j++) {
        const pt = landmarks[j];
        const px = pt.x * w;
        const py = pt.y * h;

        ctx.beginPath();
        if (j === 4 || j === 8) {
            ctx.arc(px, py, 5, 0, 2 * Math.PI);
            ctx.fillStyle = '#ff0077';
        } else {
            ctx.arc(px, py, 3.5, 0, 2 * Math.PI);
            ctx.fillStyle = '#00ff88';
        }
        ctx.fill();
    }
}

function updateGestureUI(gesture, handedness) {
    const handLabel = handedness ? handedness.toUpperCase() : 'MAIN';

    switch (gesture) {
        case 'PINCH':
            gestureIcon.textContent = '🤏';
            gestureName.textContent = `PINCEMENT (${handLabel})`;
            gestureDesc.textContent = isScrollActive ? 'Défilement (Scroll) actif' : 'Action clic validée';
            gestureName.style.color = '#ff0077';
            break;

        case 'FIST':
            gestureIcon.textContent = '✊';
            gestureName.textContent = `POING FERMÉ (${handLabel})`;
            gestureDesc.textContent = 'Verrouillage / Curseur en pause';
            gestureName.style.color = '#ffb703';
            break;

        case 'POINT':
            gestureIcon.textContent = '☝️';
            gestureName.textContent = `POINTAGE (${handLabel})`;
            gestureDesc.textContent = 'Curseur spatial laser directionnel';
            gestureName.style.color = '#00f2fe';
            break;

        case 'PEACE':
            gestureIcon.textContent = '✌️';
            gestureName.textContent = `VICTOIRE / 2 DOIGTS (${handLabel})`;
            gestureDesc.textContent = 'Déclencheur de clic droit';
            gestureName.style.color = '#00ff88';
            break;

        case 'OPEN':
        default:
            gestureIcon.textContent = '🖐️';
            gestureName.textContent = `MAIN OUVERTE (${handLabel})`;
            gestureDesc.textContent = 'Mode navigation spatiale libre';
            gestureName.style.color = '#ffffff';
            break;
    }
}

// ============================================================================
// --- 12. ÉCOUTEURS D'ÉVÉNEMENTS & RACCOURCIS ---
// ============================================================================

function setupEventListeners() {
    chkMouseControl.addEventListener('change', () => {
        lblMouseControl.textContent = chkMouseControl.checked ? 'CONTRÔLE SOURIS ACTIF' : 'CONTRÔLE SOURIS EN PAUSE';
        playSciFiTone(chkMouseControl.checked ? 800 : 400, 0.1, 'sine');
    });

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'KeyM') {
            if (e.target.tagName !== 'INPUT') {
                e.preventDefault();
                chkMouseControl.checked = !chkMouseControl.checked;
                chkMouseControl.dispatchEvent(new Event('change'));
            }
        }
    });

    rangeSensitivity.addEventListener('input', () => {
        valSensitivity.textContent = `${rangeSensitivity.value}x`;
    });

    rangeSmoothing.addEventListener('input', () => {
        updateSmoothingProfile();
    });

    rangePinchThresh.addEventListener('input', () => {
        valPinchThresh.textContent = `${rangePinchThresh.value}%`;
    });

    rangeScrollSpeed.addEventListener('input', () => {
        valScrollSpeed.textContent = `${parseFloat(rangeScrollSpeed.value).toFixed(1)}x`;
    });
}

// --- 13. DÉMARRAGE INITIAL ---
window.addEventListener('DOMContentLoaded', () => {
    updateSmoothingProfile();
    setupEventListeners();
    initWebSocket();
    initMediaPipe();
    initBackgroundAudio();

    // Boucle de rendu premier-plan 60 FPS
    requestAnimationFrame(renderLoop);

    // Démarrage inférence IA
    runAiInference();
});
