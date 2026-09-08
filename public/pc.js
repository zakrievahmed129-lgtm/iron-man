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
let audioCtx = null;
let lastPinchState = false;

// Configuration WebRTC
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// --- 1. MOTEUR AUDIO PROCÉDURAL SCI-FI (WEB AUDIO API) ---
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
        // Ignorer les blocages d'autoplay audio
    }
}

// --- 2. WEBSOCKET ET SIGNALISATION ---
function initWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        serverDot.className = 'dot connected';
        serverStatus.textContent = 'SIGNALISATION : CONNECTÉ';
        ws.send(JSON.stringify({ type: 'register', role: 'pc' }));
        console.log('✅ Connecté au serveur de signalisation');
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
                    }
                    break;

                case 'offer':
                    console.log('📥 Offre WebRTC reçue du téléphone');
                    await handleWebRTCOffer(data.sdp);
                    break;

                case 'candidate':
                    if (peerConnection && data.candidate) {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
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

// --- 3. TRAITEMENT DE L'OFFRE WEBRTC (RÉCEPTION DU FLUX DU REDMI A3) ---
async function handleWebRTCOffer(sdp) {
    if (peerConnection) {
        peerConnection.close();
    }

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
        streamDot.className = 'dot connected';
        streamStatus.textContent = 'FLUX VIDÉO : ACTIF (REDMI A3)';
        waitingOverlay.style.display = 'none';
        playSciFiTone(880, 0.15, 'sine');
    };

    peerConnection.onconnectionstatechange = () => {
        console.log('État WebRTC PC:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            streamDot.className = 'dot disconnected';
            streamStatus.textContent = 'FLUX INTERROMPU';
            waitingOverlay.style.display = 'flex';
        }
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
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

// --- 4. INITIALISATION DE MEDIAPIPE HANDS ---
function initMediaPipe() {
    handsDetector = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    handsDetector.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    handsDetector.onResults(onHandResults);
    console.log('🤖 MediaPipe Hands prêt');
}

// --- 5. BOUCLE D'ANALYSE D'IMAGES & RENDER ---
let videoFrames = 0;
let aiFrames = 0;
let lastMetricTime = performance.now();

async function processVideoFrame() {
    if (remoteVideo.readyState >= 2 && !remoteVideo.paused && !isProcessingFrame && handsDetector) {
        // Ajuster la taille du canvas
        if (overlayCanvas.width !== remoteVideo.videoWidth || overlayCanvas.height !== remoteVideo.videoHeight) {
            overlayCanvas.width = remoteVideo.videoWidth;
            overlayCanvas.height = remoteVideo.videoHeight;
            teleRes.textContent = `${remoteVideo.videoWidth}x${remoteVideo.videoHeight}`;
        }

        isProcessingFrame = true;
        videoFrames++;
        try {
            await handsDetector.send({ image: remoteVideo });
        } catch (e) {
            // Frame ignorée en cas de micro-saut
        }
        isProcessingFrame = false;
    }

    requestAnimationFrame(processVideoFrame);
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

// --- 6. RÉSULTATS MEDIAPIPE : DESSIN HOLOGRAPHIQUE & RECONNAISSANCE GESTUELLE ---
function onHandResults(results) {
    aiFrames++;
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Dessiner l'image vidéo de base
    ctx.drawImage(results.image, 0, 0, overlayCanvas.width, overlayCanvas.height);

    // Si aucune main n'est détectée
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        gestureIcon.textContent = '🖐️';
        gestureName.textContent = 'AUCUNE MAIN';
        gestureDesc.textContent = 'Place ta main devant la caméra';
        pinchPercent.textContent = '0%';
        pinchFill.style.width = '0%';
        lastPinchState = false;
        return;
    }

    // Analyser chaque main détectée
    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i] ? results.multiHandedness[i].label : 'Main';

        drawHolographicHand(landmarks);
        analyzeGestures(landmarks, handedness);
    }
}

// Dessin des articulations façon HUD Laser Cyan
function drawHolographicHand(landmarks) {
    const w = overlayCanvas.width;
    const h = overlayCanvas.height;

    // Connexions de la main
    const CONNECTIONS = [
        [0,1],[1,2],[2,3],[3,4],          // Pouce
        [0,5],[5,6],[6,7],[7,8],          // Index
        [0,9],[9,10],[10,11],[11,12],     // Majeur
        [0,13],[13,14],[14,15],[15,16],   // Annulaire
        [0,17],[17,18],[18,19],[19,20],   // Auriculaire
        [5,9],[9,13],[13,17]              // Paume
    ];

    // Lignes laser néon
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

    // Points d'articulation (Nodes lumineux)
    ctx.shadowBlur = 12;
    for (let j = 0; j < landmarks.length; j++) {
        const pt = landmarks[j];
        const px = pt.x * w;
        const py = pt.y * h;

        ctx.beginPath();
        if (j === 4 || j === 8) {
            // Bouts du pouce et de l'index en surbrillance
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
    ctx.shadowBlur = 0; // reset
}

// --- 7. CLASSIFICATEUR DE GESTES EN TEMPS RÉEL ---
function analyzeGestures(landmarks, handedness) {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const wrist = landmarks[0];

    // Téléportation coordonnées 3D (Poignet)
    coordX.textContent = wrist.x.toFixed(3);
    coordY.textContent = wrist.y.toFixed(3);
    coordZ.textContent = wrist.z.toFixed(3);

    // Calcul distance Pinceur (Pouce - Index)
    const dx = thumbTip.x - indexTip.x;
    const dy = thumbTip.y - indexTip.y;
    const dz = thumbTip.z - indexTip.z;
    const pinchDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Normalisation du pincement (seuil ~ 0.05 à 0.15 selon échelle écran)
    const pinchProgress = Math.max(0, Math.min(1, (0.16 - pinchDist) / 0.11));
    const pinchPct = Math.round(pinchProgress * 100);

    pinchPercent.textContent = `${pinchPct}%`;
    pinchFill.style.width = `${pinchPct}%`;

    const isPinched = pinchPct >= 75;

    // Détection des doigts levés
    const isIndexExtended = indexTip.y < landmarks[6].y;
    const isMiddleExtended = middleTip.y < landmarks[10].y;
    const isRingExtended = ringTip.y < landmarks[14].y;
    const isPinkyExtended = pinkyTip.y < landmarks[18].y;

    if (isPinched) {
        gestureIcon.textContent = '🤏';
        gestureName.textContent = `PINCEMENT (${handedness.toUpperCase()})`;
        gestureDesc.textContent = 'Action de saisie / interaction déclenchée !';
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

// Initialisation au chargement
window.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    initMediaPipe();
    remoteVideo.addEventListener('play', () => {
        requestAnimationFrame(processVideoFrame);
    });
});
