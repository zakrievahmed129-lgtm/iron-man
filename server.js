const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');
const qrcode = require('qrcode-terminal');

// Détection de l'environnement Cloud (ex: Render.com, Glitch, Heroku)
const IS_CLOUD = !!process.env.PORT;
const PORT = process.env.PORT || 8443;
const CERT_FILE = path.join(__dirname, 'cert.pem');
const KEY_FILE = path.join(__dirname, 'key.pem');
const PUBLIC_DIR = path.join(__dirname, 'public');

// --- 1. DÉTECTION DE L'ADRESSE IP LOCALE (POUR DÉV LOCAL) ---
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                const n = name.toLowerCase();
                if (!n.includes('virtual') && !n.includes('vethernet') && !n.includes('docker') && !n.includes('loopback')) {
                    return iface.address;
                }
            }
        }
    }
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

const LOCAL_IP = getLocalIP();

// --- 2. GESTION DU CERTIFICAT SSL (UNIQUEMENT EN LOCAL) ---
if (!IS_CLOUD) {
    if (!fs.existsSync(CERT_FILE) || !fs.existsSync(KEY_FILE)) {
        console.log('🔒 Génération automatique du certificat SSL auto-signé...');
        try {
            execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${KEY_FILE}" -out "${CERT_FILE}" -days 365 -nodes -subj "/CN=${LOCAL_IP}"`, {
                stdio: 'ignore'
            });
            console.log('✅ Certificats SSL créés avec succès.');
        } catch (err) {
            console.error('❌ Erreur OpenSSL:', err.message);
        }
    }
}

// --- 3. GESTIONNAIRE DE REQUÊTES STATIQUES ---
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function handleHttpRequest(req, res) {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '') {
        reqPath = '/index.html';
    }

    const filePath = path.join(PUBLIC_DIR, reqPath);

    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        return res.end('Accès interdit');
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Fichier introuvable');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
    });
}

// Création du serveur (HTTP en Cloud car le proxy Render gère déjà le SSL officiel, HTTPS en local)
let server;
if (IS_CLOUD) {
    server = http.createServer(handleHttpRequest);
} else {
    server = https.createServer({
        key: fs.readFileSync(KEY_FILE),
        cert: fs.readFileSync(CERT_FILE)
    }, handleHttpRequest);
}

// --- 4. GESTION DU PONT SOURIS NATIF (AegisMouseBridge.exe) ---
let mouseBridge = null;
let screenWidth = 1920;
let screenHeight = 1080;

function initMouseBridge() {
    if (process.platform !== 'win32') {
        console.log('ℹ️  Pont souris actif uniquement sous Windows.');
        return;
    }

    const bridgePath = path.join(__dirname, 'AegisMouseBridge.exe');
    if (!fs.existsSync(bridgePath)) {
        console.warn('⚠️ AegisMouseBridge.exe non trouvé. Compilez AegisMouseBridge.cs.');
        return;
    }

    try {
        mouseBridge = spawn(bridgePath, [], {
            cwd: __dirname,
            stdio: ['pipe', 'pipe', 'inherit']
        });

        mouseBridge.stdout.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('READY ') || trimmed.startsWith('SCREEN ')) {
                    const parts = trimmed.split(' ');
                    if (parts.length >= 3) {
                        screenWidth = parseInt(parts[1], 10) || 1920;
                        screenHeight = parseInt(parts[2], 10) || 1080;
                        console.log(`🖥️  Écran Windows détecté : ${screenWidth} x ${screenHeight}`);
                        if (pcClient && pcClient.readyState === WebSocket.OPEN) {
                            pcClient.send(JSON.stringify({
                                type: 'system_info',
                                screenWidth,
                                screenHeight,
                                bridgeReady: true
                            }));
                        }
                    }
                }
            }
        });

        mouseBridge.on('close', (code) => {
            console.log(`⚠️ AegisMouseBridge terminé (code ${code})`);
            mouseBridge = null;
        });

        mouseBridge.on('error', (err) => {
            console.error('❌ Erreur AegisMouseBridge:', err.message);
            mouseBridge = null;
        });

        console.log('⚡ AegisMouseBridge (Win32 Native Mouse Engine) prêt !');
    } catch (e) {
        console.error('❌ Impossible de lancer AegisMouseBridge:', e.message);
    }
}

function sendMouseCommand(cmd) {
    if (mouseBridge && mouseBridge.stdin && !mouseBridge.stdin.destroyed) {
        try {
            mouseBridge.stdin.write(cmd + '\n');
        } catch (e) {
            // Ignorer erreur d'écriture si fermé
        }
    }
}

process.on('exit', () => {
    if (mouseBridge && mouseBridge.stdin && !mouseBridge.stdin.destroyed) {
        try {
            mouseBridge.stdin.write('QUIT\n');
        } catch (e) {}
    }
});

// --- 5. SERVEUR WEBSOCKET DE SIGNALISATION & CONTRÔLE SOURIS ---
const wss = new WebSocketServer({ server });

let pcClient = null;
let phoneClient = null;

wss.on('connection', (ws) => {
    ws.role = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());

            switch (data.type) {
                case 'register':
                    ws.role = data.role; // 'pc' ou 'phone'
                    console.log(`[+] Client connecté : ${ws.role.toUpperCase()}`);

                    if (ws.role === 'pc') {
                        pcClient = ws;
                        // Envoi immédiat des caractéristiques de l'écran et de l'état du pont souris
                        pcClient.send(JSON.stringify({
                            type: 'system_info',
                            screenWidth,
                            screenHeight,
                            bridgeReady: !!mouseBridge
                        }));

                        if (phoneClient && phoneClient.readyState === WebSocket.OPEN) {
                            pcClient.send(JSON.stringify({ type: 'peer_status', status: 'phone_ready' }));
                            phoneClient.send(JSON.stringify({ type: 'peer_status', status: 'pc_ready' }));
                        } else {
                            pcClient.send(JSON.stringify({ type: 'peer_status', status: 'waiting_for_phone' }));
                        }
                    } else if (ws.role === 'phone') {
                        phoneClient = ws;
                        if (pcClient && pcClient.readyState === WebSocket.OPEN) {
                            pcClient.send(JSON.stringify({ type: 'peer_status', status: 'phone_ready' }));
                            phoneClient.send(JSON.stringify({ type: 'peer_status', status: 'pc_ready' }));
                        } else {
                            phoneClient.send(JSON.stringify({ type: 'peer_status', status: 'waiting_for_pc' }));
                        }
                    }
                    break;

                // Commandes souris haute performance
                case 'mouse_move':
                    if (typeof data.x === 'number' && typeof data.y === 'number') {
                        sendMouseCommand(`MOVE ${Math.round(data.x)} ${Math.round(data.y)}`);
                    }
                    break;

                case 'mouse_click':
                    if (data.button === 'right') {
                        sendMouseCommand('CLICK RIGHT');
                    } else if (data.button === 'double') {
                        sendMouseCommand('DOUBLE_CLICK');
                    } else {
                        sendMouseCommand('CLICK LEFT');
                    }
                    break;

                case 'mouse_down':
                    if (data.button === 'right') {
                        sendMouseCommand('DOWN RIGHT');
                    } else {
                        sendMouseCommand('DOWN LEFT');
                    }
                    break;

                case 'mouse_up':
                    if (data.button === 'right') {
                        sendMouseCommand('UP RIGHT');
                    } else {
                        sendMouseCommand('UP LEFT');
                    }
                    break;

                case 'mouse_scroll':
                    if (typeof data.delta === 'number') {
                        sendMouseCommand(`SCROLL ${Math.round(data.delta)}`);
                    }
                    break;

                // Signalisation WebRTC
                case 'offer':
                    if (pcClient && pcClient.readyState === WebSocket.OPEN) {
                        pcClient.send(JSON.stringify({ type: 'offer', sdp: data.sdp }));
                    }
                    break;

                case 'answer':
                    if (phoneClient && phoneClient.readyState === WebSocket.OPEN) {
                        phoneClient.send(JSON.stringify({ type: 'answer', sdp: data.sdp }));
                    }
                    break;

                case 'candidate':
                    if (ws.role === 'phone' && pcClient && pcClient.readyState === WebSocket.OPEN) {
                        pcClient.send(JSON.stringify({ type: 'candidate', candidate: data.candidate }));
                    } else if (ws.role === 'pc' && phoneClient && phoneClient.readyState === WebSocket.OPEN) {
                        phoneClient.send(JSON.stringify({ type: 'candidate', candidate: data.candidate }));
                    }
                    break;

                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong', timestamp: data.timestamp }));
                    break;
            }
        } catch (e) {
            console.error('Erreur message WS:', e);
        }
    });

    ws.on('close', () => {
        if (ws.role === 'pc') {
            console.log('[-] PC déconnecté');
            pcClient = null;
            if (phoneClient && phoneClient.readyState === WebSocket.OPEN) {
                phoneClient.send(JSON.stringify({ type: 'peer_status', status: 'pc_disconnected' }));
            }
        } else if (ws.role === 'phone') {
            console.log('[-] Téléphone déconnecté');
            phoneClient = null;
            if (pcClient && pcClient.readyState === WebSocket.OPEN) {
                pcClient.send(JSON.stringify({ type: 'peer_status', status: 'phone_disconnected' }));
            }
        }
    });
});

// --- 6. DÉMARRAGE DU SERVEUR ---
server.listen(PORT, '0.0.0.0', () => {
    console.clear();
    console.log('\n============================================================');
    console.log('     🛡️  PROJET A.E.G.I.S — SPATIAL HUD & MOUSE BRIDGE     ');
    console.log('============================================================');

    // Démarrer le moteur de contrôle souris
    initMouseBridge();

    if (IS_CLOUD) {
        console.log(`\n🚀 SERVEUR ACTIF EN MODE CLOUD SUR LE PORT : ${PORT}`);
        console.log(`   Prêt pour Render.com / Glitch avec SSL externe automatique !`);
    } else {
        const pcUrl = `https://localhost:${PORT}/pc.html`;
        const phoneUrl = `https://${LOCAL_IP}:${PORT}/phone.html`;

        console.log(`\n💻 SUR TON PC :`);
        console.log(`   👉 \x1b[36m${pcUrl}\x1b[0m\n`);

        console.log(`📱 SUR TON REDMI A3 :`);
        console.log(`   👉 \x1b[32m${phoneUrl}\x1b[0m\n`);
        console.log(`   OU SCANNE CE QR CODE AVEC TON TÉLÉPHONE :`);

        qrcode.generate(phoneUrl, { small: true }, (qr) => {
            console.log(qr);
        });
    }
    console.log('============================================================\n');
});
