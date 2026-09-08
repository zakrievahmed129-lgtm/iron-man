const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
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

// --- 4. SERVEUR WEBSOCKET DE SIGNALISATION WEBRTC ---
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

// --- 5. DÉMARRAGE DU SERVEUR ---
server.listen(PORT, '0.0.0.0', () => {
    console.clear();
    console.log('\n============================================================');
    console.log('     🛡️  PROJET A.E.G.I.S — SPATIAL HUD (WEBRTC BRIDGE)     ');
    console.log('============================================================');

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
