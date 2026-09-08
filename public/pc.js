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

// Variables de stabilisation et lissage gestuel (Anti-hésitation)
let smoothPinchPct = 0;
let isPinchedState = false;
let gestureHistory = [];
let stableGesture = 'OPEN';

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

// --- 3. GESTION DE L'OFFRE WEBRTC ---
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
        streamStatus.textContent = 'FLUX VIDÉO : LIVE DIRECT';
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
        console.log('📤 Réponse SDP envoyée au téléphone');
    }
}

// --- 4. INITIALISATION MEDIAPIPE ---
function initMediaPipe() {
    handsDetector = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    handsDetector.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    handsDetector.onResults(onHandResults);
    console.log('🤖 MediaPipe Hands (Lite 60FPS) prêt');
}

// --- 5. BOUCLE D'ANALYSE D'IMAGES ---
let videoFrames = 0;
let aiFrames = 0;
let lastMetricTime = performance.now();

async function processVideoFrame() {
    if (remoteVideo.readyState >= 2 && !remoteVideo.paused && handsDetector) {
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

setInterval(() => {
    const now = performance.now();
    const elapsed = (now - lastMetricTime) / 1000;
    teleFpsVideo.textContent = Math.round(videoFrames / elapsed);
    teleFpsAI.textContent = Math.round(aiFrames / elapsed);
    videoFrames = 0;
    aiFrames = 0;
    lastMetricTime = now;
}, 1000);

// --- 6. DESSIN DU SQUELETTE HOLOGRAPHIQUE ---
function onHandResults(results) {
    aiFrames++;
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        gestureIcon.textContent = '🖐️';
        gestureName.textContent = 'AUCUNE MAIN';
        gestureDesc.textContent = 'Place ta main devant la caméra';
        gestureName.style.color = '#ffffff';
        pinchPercent.textContent = '0%';
        pinchFill.style.width = '0%';
        smoothPinchPct = 0;
        isPinchedState = false;
        lastPinchState = false;
        gestureHistory = [];
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

// --- 7. CLASSIFICATEUR DE GESTES MATHÉMATIQUE INVARIANT (ANTI-HÉSITATION) ---
function dist3d(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = (p1.z || 0) - (p2.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function analyzeGestures(landmarks, handedness) {
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

    // Téléportation coordonnées 3D
    coordX.textContent = wrist.x.toFixed(3);
    coordY.textContent = wrist.y.toFixed(3);
    coordZ.textContent = wrist.z.toFixed(3);

    // 1. Échelle de la main (Distance Poignet ➔ Base du majeur)
    // Permet de normaliser toutes les distances peu importe si la main est près ou loin !
    const palmScale = Math.max(0.04, dist3d(wrist, middleMcp));

    // 2. Détection d'extension des doigts (Invariante à la rotation et à l'angle de la main)
    const isIndexExtended = dist3d(indexTip, wrist) > dist3d(indexPip, wrist) * 1.15 && dist3d(indexTip, wrist) > dist3d(indexMcp, wrist) * 1.25;
    const isMiddleExtended = dist3d(middleTip, wrist) > dist3d(middlePip, wrist) * 1.15 && dist3d(middleTip, wrist) > dist3d(middleMcp, wrist) * 1.25;
    const isRingExtended = dist3d(ringTip, wrist) > dist3d(ringPip, wrist) * 1.15 && dist3d(ringTip, wrist) > dist3d(ringMcp, wrist) * 1.25;
    const isPinkyExtended = dist3d(pinkyTip, wrist) > dist3d(pinkyPip, wrist) * 1.15 && dist3d(pinkyTip, wrist) > dist3d(pinkyMcp, wrist) * 1.25;

    // 3. Calcul du Pincement Normalisé (Pouce - Index)
    const rawPinchRatio = dist3d(thumbTip, indexTip) / palmScale;
    
    // Normalisation : < 0.28 = 100% pincé, > 0.70 = 0% pincé
    const targetPinchPct = Math.max(0, Math.min(100, Math.round((0.70 - rawPinchRatio) / 0.42 * 100)));
    
    // Lissage exponentiel (Moving Average) : jauge fluide sans tremblement
    smoothPinchPct = Math.round(smoothPinchPct * 0.65 + targetPinchPct * 0.35);

    pinchPercent.textContent = `${smoothPinchPct}%`;
    pinchFill.style.width = `${smoothPinchPct}%`;

    // Hystérésis de pincement (évite tout clignotement au seuil de clic)
    if (!isPinchedState && smoothPinchPct >= 72) {
        isPinchedState = true;
    } else if (isPinchedState && smoothPinchPct <= 45) {
        isPinchedState = false;
    }

    // 4. Détermination du geste brut instantané
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

    // 5. Stabilisateur temporel anti-hésitation (Filtre par vote majoritaire sur les 5 dernières frames)
    gestureHistory.push(detectedRawGesture);
    if (gestureHistory.length > 5) {
        gestureHistory.shift();
    }

    const counts = {};
    for (const g of gestureHistory) {
        counts[g] = (counts[g] || 0) + 1;
    }

    let dominantGesture = detectedRawGesture;
    let maxCount = 0;
    for (const [g, count] of Object.entries(counts)) {
        if (count > maxCount) {
            maxCount = count;
            dominantGesture = g;
        }
    }

    // Seuil de confirmation : au moins 3 frames cohérentes sur 5 pour basculer
    if (maxCount >= 3) {
        stableGesture = dominantGesture;
    }

    // 6. Mise à jour de l'affichage avec le geste stable
    updateGestureUI(stableGesture, handedness);
}

function updateGestureUI(gesture, handedness) {
    const handLabel = handedness ? handedness.toUpperCase() : 'MAIN';

    switch (gesture) {
        case 'PINCH':
            gestureIcon.textContent = '🤏';
            gestureName.textContent = `PINCEMENT (${handLabel})`;
            gestureDesc.textContent = 'Action de saisie / clic validée !';
            gestureName.style.color = '#ff0077';
            if (!lastPinchState) {
                playSciFiTone(1200, 0.08, 'triangle');
                lastPinchState = true;
            }
            break;

        case 'FIST':
            lastPinchState = false;
            gestureIcon.textContent = '✊';
            gestureName.textContent = `POING FERMÉ (${handLabel})`;
            gestureDesc.textContent = 'Verrouillage / arrêt du mouvement';
            gestureName.style.color = '#ffb703';
            break;

        case 'POINT':
            lastPinchState = false;
            gestureIcon.textContent = '☝️';
            gestureName.textContent = `POINTAGE (${handLabel})`;
            gestureDesc.textContent = 'Curseur spatial laser directionnel';
            gestureName.style.color = '#00f2fe';
            break;

        case 'PEACE':
            lastPinchState = false;
            gestureIcon.textContent = '✌️';
            gestureName.textContent = `VICTOIRE / 2 DOIGTS (${handLabel})`;
            gestureDesc.textContent = 'Sélection secondaire / raccourci';
            gestureName.style.color = '#00ff88';
            break;

        case 'OPEN':
        default:
            lastPinchState = false;
            gestureIcon.textContent = '🖐️';
            gestureName.textContent = `MAIN OUVERTE (${handLabel})`;
            gestureDesc.textContent = 'Mode navigation spatiale libre';
            gestureName.style.color = '#ffffff';
            break;
    }
}

// Initialisation
window.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    initMediaPipe();
    startVideoLoop();
});
