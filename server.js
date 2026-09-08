const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');
const qrcode = require('qrcode-terminal');

const IS_CLOUD = !!process.env.PORT;
const HTTP_PORT = 8000;  // Port HTTP pour le PC (0 erreur SSL, connexion instantanée)
const HTTPS_PORT = process.env.PORT || 8443; // Port HTTPS pour le téléphone (Caméra WebRTC)

const CERT_FILE = path.join(__dirname, 'cert.pem');
const KEY_FILE = path.join(__dirname, 'key.pem');
const PUBLIC_DIR = path.join(__dirname, 'public');

// --- 1. DÉTECTION IP LOCALE ---
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

// --- 2. CERTIFICATS SSL AUTO-SIGNÉS ---
if (!IS_CLOUD) {
    if (!fs.existsSync(CERT_FILE) || !fs.existsSync(KEY_FILE)) {
        console.log('🔒 Génération du certificat SSL local pour le smartphone...');
        try {
            execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${KEY_FILE}" -out "${CERT_FILE}" -days 365 -nodes -subj "/CN=${LOCAL_IP}"`, {
                stdio: 'ignore'
            });
            console.log('✅ Certificats SSL générés.');
        } catch (err) {
            console.error('❌ Erreur OpenSSL:', err.message);
        }
    }
}

// --- 3. GESTIONNAIRE STATIQUE HTTP ---
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

// --- 4. GESTION DU PONT SOURIS NATIF WIN32 ---
let mouseBridge = null;
let screenWidth = 1920;
let screenHeight = 1080;

function initMouseBridge() {
    if (process.platform !== 'win32') return;

    const bridgePath = path.join(__dirname, 'AegisMouseBridge.exe');
    if (!fs.existsSync(bridgePath)) {
        console.warn('⚠️ AegisMouseBridge.exe manquant.');
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
                        console.log(`🖥️  Écran Windows : ${screenWidth} x ${screenHeight}`);
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

        mouseBridge.on('close', () => { mouseBridge = null; });
        mouseBridge.on('error', () => { mouseBridge = null; });
        console.log('⚡ AegisMouseBridge (Moteur Win32 60 FPS) actif !');
    } catch (e) {
        console.error('❌ Erreur lancement mouseBridge:', e.message);
    }
}

function sendMouseCommand(cmd) {
    if (mouseBridge && mouseBridge.stdin && !mouseBridge.stdin.destroyed) {
        try { mouseBridge.stdin.write(cmd + '\n'); } catch (e) {}
    }
}

process.on('exit', () => {
    if (mouseBridge && mouseBridge.stdin && !mouseBridge.stdin.destroyed) {
        try { mouseBridge.stdin.write('QUIT\n'); } catch (e) {}
    }
});

// --- 5. SIGNALISATION WEBSOCKET CENTRALISÉE ---
let pcClient = null;
let phoneClient = null;

function handleWsConnection(ws) {
    ws.role = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());

            switch (data.type) {
                case 'register':
                    ws.role = data.role;
                    console.log(`[+] Client connecté : ${ws.role.toUpperCase()}`);

                    if (ws.role === 'pc') {
                        pcClient = ws;
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

                case 'mouse_move':
                    if (typeof data.x === 'number' && typeof data.y === 'number') {
                        sendMouseCommand(`MOVE ${Math.round(data.x)} ${Math.round(data.y)}`);
                    }
                    break;

                case 'mouse_click':
                    if (data.button === 'right') sendMouseCommand('CLICK RIGHT');
                    else if (data.button === 'double') sendMouseCommand('DOUBLE_CLICK');
                    else sendMouseCommand('CLICK LEFT');
                    break;

                case 'mouse_scroll':
                    if (typeof data.delta === 'number') {
                        sendMouseCommand(`SCROLL ${Math.round(data.delta)}`);
                    }
                    break;


                case 'mouse_release':
                    sendMouseCommand('RELEASE');
                    break;

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
            console.error('Erreur WS message:', e);
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
}

// --- 6. CRÉATION DES SERVEURS DUAL HTTP/HTTPS ---
if (IS_CLOUD) {
    const server = http.createServer(handleHttpRequest);
    const wss = new WebSocketServer({ server });
    wss.on('connection', handleWsConnection);

    server.listen(HTTPS_PORT, '0.0.0.0', () => {
        initMouseBridge();
        console.log(`🚀 Mode Cloud actif sur le port ${HTTPS_PORT}`);
    });
} else {
    // 1. Serveur HTTP pour le PC (0 erreur SSL, 0 avertissement, chargement instantané dans .exe)
    const httpServer = http.createServer(handleHttpRequest);
    const wssHttp = new WebSocketServer({ server: httpServer });
    wssHttp.on('connection', handleWsConnection);

    // 2. Serveur HTTPS pour le Smartphone (Requis pour l'accès caméra WebRTC)
    const httpsServer = https.createServer({
        key: fs.readFileSync(KEY_FILE),
        cert: fs.readFileSync(CERT_FILE)
    }, handleHttpRequest);
    const wssHttps = new WebSocketServer({ server: httpsServer });
    wssHttps.on('connection', handleWsConnection);

    httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
        httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
            console.clear();
            console.log('\n============================================================');
            console.log('     🛡️  PROJET A.E.G.I.S — SERVEUR ULTRA-RAPIDE 60 FPS     ');
            console.log('============================================================');

            initMouseBridge();

            const pcUrl = `http://localhost:${HTTP_PORT}/pc.html`;
            const phoneUrl = `https://${LOCAL_IP}:${HTTPS_PORT}/phone.html`;

            console.log(`\n💻 APPLICATION SUR TON PC (0 ERREUR SSL / 100% FLUIDE) :`);
            console.log(`   👉 \x1b[36m${pcUrl}\x1b[0m\n`);

            console.log(`📱 SUR TON SMARTPHONE (REDMI A3, ETC.) :`);
            console.log(`   👉 \x1b[32m${phoneUrl}\x1b[0m\n`);
            console.log(`   OU SCANNE CE QR CODE :`);

            qrcode.generate(phoneUrl, { small: true }, (qr) => {
                console.log(qr);
            });
            console.log('============================================================\n');
        });
    });
}
