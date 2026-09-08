// --- PROJET A.E.G.I.S : RÉCEPTEUR PC & DÉTECTION GESTUELLE MEDIAPIPE ---

const remoteVideo = document.getElementById('remoteVideo');
const overlayCanvas = document.getElementById('overlayCanvas');
const ctx = overlayCanvas.getContext('2d');
const waitingOverlay = document.getElementById('waitingOverlay');

const serverDot = document.getElementById('serverDot');
const serverStatus = document.getElementById('serverStatus');
const streamDot = document.getElementById('streamDot');
const streamStatus = document.getElementById('streamStatus');

const gestureIcon = document.getElementById('gestureIcon');
const gestureName = document.getElementById('gestureName');
const gestureDesc = document.getElementById('gestureDesc');
const pinchPercent = document.getElementById('pinchPercent');
const pinchFill = document.getElementById('pinchFill');

const coordX = document.getElementById('coordX');
const coordY = document.getElementById('coordY');
const coordZ = document.getElementById('coordZ');

const teleRes = document.getElementById('teleRes');
const teleFpsVideo = document.getElementById('teleFpsVideo');
const teleFpsAI = document.getElementById('teleFpsAI');
const telePing = document.getElementById('telePing');
const chkAudioFeedback = document.getElementById('chkAudioFeedback');

let ws = null;
let peerConnection = null;
let handsDetector = null;
let isProcessingFrame = false;
let isLoopRunning = false;
let audioCtx = null;
let lastPinchState = false;
let iceCandidateQueue = [];

// Configuration WebRTC standard
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// --- 1. MOTEUR AUDIO SCI-FI (WEB AUDIO API) ---
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
        osc.frequency.exponentialRampToValueAtTime(freq * 1.5, audioCtx.currentTime + duration);

        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
        // Ignorer blocage autoplay
    }
}

// --- 2. WEBSOCKET SIGNALISATION & KEEP-ALIVE ---
function initWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        serverDot.className = 'dot connected';
        serverStatus.textContent = 'SIGNALISATION : CONNECTÉ';
        ws.send(JSON.stringify({ type: 'register', role: 'pc' }));
        console.log('✅ Connecté au serveur de signalisation');
        startKeepAlive();
    };

    ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'peer_status':
                    if (data.status === 'waiting_for_phone') {
                        streamDot.className = 'dot';
                        streamStatus.textContent = 'FLUX VIDÉO : EN ATTENTE DU TÉLÉPHONE...';
                    } else if (data.status === 'phone_ready') {
                        streamDot.className = 'dot';
                        streamStatus.textContent = 'TÉLÉPHONE DÉTECTÉ, EN ATTENTE DU FLUX...';
                    } else if (data.status === 'phone_disconnected') {
                        streamDot.className = 'dot disconnected';
                        streamStatus.textContent = 'TÉLÉPHONE DÉCONNECTÉ';
                        waitingOverlay.style.display = 'flex';
                        if (peerConnection) {
                            peerConnection.close();
                            peerConnection = null;
                        }
                        iceCandidateQueue = [];
                    }
                    break;

                case 'offer':
                    console.log('📥 Offre WebRTC reçue du téléphone');
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

// --- 3. GESTION DE L'OFFRE WEBRTC (RÉCEPTION FLUX SANS FREEZE) ---
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
        console.log('📹 Piste vidéo distante reçue !');
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.play().catch(() => {});
        streamDot.className = 'dot connected';
        streamStatus.textContent = 'FLUX VIDÉO : ACTIF (REDMI A3)';
        waitingOverlay.style.display = 'none';
        playSciFiTone(880, 0.15, 'sine');
    };

    peerConnection.onconnectionstatechange = () => {
        console.log('État WebRTC PC:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            streamDot.className = 'dot connected';
            streamStatus.textContent = 'FLUX VIDÉO : LIVE DIRECT';
        } else if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            streamDot.className = 'dot disconnected';
            streamStatus.textContent = 'FLUX INTERROMPU';
            waitingOverlay.style.display = 'flex';
        }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));

    // Vider les candidats en attente
    while (iceCandidateQueue.length > 0) {
        const candidate = iceCandidateQueue.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.warn('Erreur candidate:', e);
        }
    }

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'answer',
            sdp: peerConnection.localDescription
        }));
        console.log('📤 Réponse SDP (Answer) envoyée au téléphone');
    }
}

// --- 4. INITIALISATION MEDIAPIPE (OPTIMISÉ FAST LITE) ---
function initMediaPipe() {
    handsDetector = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    // modelComplexity: 0 (Lite) évite la surcharge mémoire et garantit 60 FPS constants
    handsDetector.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    handsDetector.onResults(onHandResults);
    console.log('🤖 MediaPipe Hands (Lite 60FPS) prêt');
}

// --- 5. BOUCLE D'ANALYSE D'IMAGES STABLE ---
let videoFrames = 0;
let aiFrames = 0;
let lastMetricTime = performance.now();

async function processVideoFrame() {
    if (remoteVideo.readyState >= 2 && !remoteVideo.paused && handsDetector) {
        // Aligner exactement la taille du canvas sur la vidéo reçue
        if (overlayCanvas.width !== remoteVideo.videoWidth || overlayCanvas.height !== remoteVideo.videoHeight) {
            overlayCanvas.width = remoteVideo.videoWidth || 640;
            overlayCanvas.height = remoteVideo.videoHeight || 480;
            teleRes.textContent = `${overlayCanvas.width}x${overlayCanvas.height}`;
        }

        if (!isProcessingFrame) {
            isProcessingFrame = true;
            videoFrames++;
            try {
                await handsDetector.send({ image: remoteVideo });
            } catch (e) {
                // Ignore micro-dropped frames
            }
            isProcessingFrame = false;
        }
    }

    requestAnimationFrame(processVideoFrame);
}

function startVideoLoop() {
    if (!isLoopRunning) {
        isLoopRunning = true;
        requestAnimationFrame(processVideoFrame);
    }
}

// Métriques FPS
setInterval(() => {
    const now = performance.now();
    const elapsed = (now - lastMetricTime) / 1000;
    teleFpsVideo.textContent = Math.round(videoFrames / elapsed);
    teleFpsAI.textContent = Math.round(aiFrames / elapsed);
    videoFrames = 0;
    aiFrames = 0;
    lastMetricTime = now;
}, 1000);

// --- 6. DESSIN HOLOGRAPHIQUE SUR CANVAS ---
function onHandResults(results) {
    aiFrames++;
    // La vidéo tourne en direct sur GPU en arrière-plan via #remoteVideo,
    // donc le canvas ne dessine QUE le squelette néon ! Zéro copie CPU, ultra-fluide !
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        gestureIcon.textContent = '🖐️';
        gestureName.textContent = 'AUCUNE MAIN';
        gestureDesc.textContent = 'Place ta main devant la caméra';
        pinchPercent.textContent = '0%';
        pinchFill.style.width = '0%';
        lastPinchState = false;
        return;
    }

    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i] ? results.multiHandedness[i].label : 'Main';

        drawHolographicHand(landmarks);
        analyzeGestures(landmarks, handedness);
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

    ctx.lineWidth = 3;
    ctx.strokeStyle = '#00f2fe';
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 10;

    for (const [start, end] of CONNECTIONS) {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        ctx.beginPath();
        ctx.moveTo(p1.x * w, p1.y * h);
        ctx.lineTo(p2.x * w, p2.y * h);
        ctx.stroke();
    }

    ctx.shadowBlur = 12;
    for (let j = 0; j < landmarks.length; j++) {
        const pt = landmarks[j];
        const px = pt.x * w;
        const py = pt.y * h;

        ctx.beginPath();
        if (j === 4 || j === 8) {
            ctx.arc(px, py, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#ff0077';
            ctx.shadowColor = '#ff0077';
        } else {
            ctx.arc(px, py, 4, 0, 2 * Math.PI);
            ctx.fillStyle = '#00ff88';
            ctx.shadowColor = '#00ff88';
        }
        ctx.fill();
    }
    ctx.shadowBlur = 0;
}

// --- 7. CLASSIFICATEUR DE GESTES ---
function analyzeGestures(landmarks, handedness) {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const wrist = landmarks[0];

    coordX.textContent = wrist.x.toFixed(3);
    coordY.textContent = wrist.y.toFixed(3);
    coordZ.textContent = wrist.z.toFixed(3);

    const dx = thumbTip.x - indexTip.x;
    const dy = thumbTip.y - indexTip.y;
    const dz = thumbTip.z - indexTip.z;
    const pinchDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const pinchProgress = Math.max(0, Math.min(1, (0.16 - pinchDist) / 0.11));
    const pinchPct = Math.round(pinchProgress * 100);

    pinchPercent.textContent = `${pinchPct}%`;
    pinchFill.style.width = `${pinchPct}%`;

    const isPinched = pinchPct >= 75;

    const isIndexExtended = indexTip.y < landmarks[6].y;
    const isMiddleExtended = middleTip.y < landmarks[10].y;
    const isRingExtended = ringTip.y < landmarks[14].y;
    const isPinkyExtended = pinkyTip.y < landmarks[18].y;

    if (isPinched) {
        gestureIcon.textContent = '🤏';
        gestureName.textContent = `PINCEMENT (${handedness.toUpperCase()})`;
        gestureDesc.textContent = 'Action de saisie / clic déclenchée !';
        gestureName.style.color = '#ff0077';

        if (!lastPinchState) {
            playSciFiTone(1200, 0.08, 'triangle');
            lastPinchState = true;
        }
    } else {
        lastPinchState = false;
        if (isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
            gestureIcon.textContent = '☝️';
            gestureName.textContent = 'POINTAGE (INDEX)';
            gestureDesc.textContent = 'Curseur spatial directionnel actif';
            gestureName.style.color = '#00f2fe';
        } else if (isIndexExtended && isMiddleExtended && !isRingExtended && !isPinkyExtended) {
            gestureIcon.textContent = '✌️';
            gestureName.textContent = 'VICTOIRE / DEUX DOIGTS';
            gestureDesc.textContent = 'Geste de sélection secondaire';
            gestureName.style.color = '#00ff88';
        } else if (!isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended) {
            gestureIcon.textContent = '✊';
            gestureName.textContent = 'POING FERMÉ';
            gestureDesc.textContent = 'Verrouillage ou arrêt de mouvement';
            gestureName.style.color = '#ffb703';
        } else {
            gestureIcon.textContent = '🖐️';
            gestureName.textContent = 'MAIN OUVERTE';
            gestureDesc.textContent = 'Mode navigation spatiale libre';
            gestureName.style.color = '#ffffff';
        }
    }
}

// Initialisation
window.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    initMediaPipe();
    startVideoLoop();
});
