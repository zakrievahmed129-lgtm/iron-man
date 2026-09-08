# 🛡️ A.E.G.I.S — Spatial HUD & Hand Tracking

> **Transformez votre smartphone (Redmi A3, etc.) en capteur spatial WebRTC pour contrôler votre PC avec vos mains nues comme dans Iron Man !**

---

## ⚡ Fonctionnalités Clés

- **📹 Pont Vidéo WebRTC P2P Zéro Latence** : Flux vidéo HD direct (30 à 60 FPS) entre le smartphone et le PC via réseau local Wi-Fi ou Cloud.
- **🤖 Détection des Mains MediaPipe IA** : Traitement en temps réel des 21 articulations de chaque main sur le PC.
- **🤏 Reconnaissance Gestuelle Holographique** :
  - `Pincement (Pouce + Index)` avec jauge de précision et déclencheur audio.
  - `Main Ouverte` (mode navigation spatiale libre).
  - `Poing Fermé` (verrouillage / arrêt).
  - `Pointage Index` (curseur directionnel laser).
- **📐 Coordonnées Spatiales 3D** : Affichage en direct de la position spatiale $(X, Y, Z)$ des mains.
- **🔊 Synthétiseur Sonore Sci-Fi** : Sons procéduraux via la Web Audio API sans aucun fichier externe.
- **🔋 Anti-Veille Écran Automatique (WakeLock API)** : Empêche le téléphone de s'éteindre pendant la session.

---

## 🚀 Démarrage Local

### 1. Prérequis
- [Node.js](https://nodejs.org/) (v18+)

### 2. Installation & Lancement
```bash
# Installer les dépendances
npm install

# Démarrer le serveur
npm start
```

- **Sur votre PC** : Ouvrez `https://localhost:8443/pc.html`
- **Sur votre Téléphone** : Ouvrez le lien affiché ou scannez le QR code généré dans le terminal !

---

## ☁️ Déploiement Cloud en 1 Clic (ex: Render.com)

1. Créez un compte gratuit sur [Render.com](https://render.com).
2. Cliquez sur **New +** ➔ **Web Service**.
3. Liez ce dépôt GitHub : `https://github.com/zakrievahmed129-lgtm/iron-man`.
4. Paramètres :
   - **Environment** : `Node`
   - **Build Command** : `npm install`
   - **Start Command** : `node server.js`
5. Cliquez sur **Create Web Service** ! Render vous fournira une URL HTTPS officielle avec cadenas vert (ex: `https://mon-aegis.onrender.com`).

---

## 🛠️ Architecture Technique

```text
📱 Smartphone (Redmi A3)
   ├── Capture Caméra (getUserMedia)
   ├── Stream Matériel WebRTC (H.264 / VP8)
   └── WakeLock API (Anti-veille écran)
          │
          ▼ (Flux Vidéo P2P LAN / WAN)
          │
💻 PC Récepteur
   ├── Réception WebRTC
   ├── Rendu Canvas Holographique
   ├── MediaPipe Hands IA (21 articulations 3D)
   ├── Classificateur de Gestes & Pincement
   └── Moteur Audio Web Audio API
```

---

## 👤 Auteur
- **Ahmed** ([@zakrievahmed129-lgtm](https://github.com/zakrievahmed129-lgtm))
