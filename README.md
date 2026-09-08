# 🛡️ A.E.G.I.S — Spatial HUD & Windows Mouse Controller

> **Transformez votre smartphone (Redmi A3, etc.) en capteur spatial WebRTC pour contrôler votre PC Windows avec vos mains nues comme dans Iron Man !**

---

## ⚡ Fonctionnalités Clés

- **🖱️ Contrôle Réel de la Souris Windows (Win32 Native Engine)** :
  - Synchronisation fluide du curseur avec l'index ou la main (< 1 ms de latence).
  - Lissage adaptatif anti-tremblement et zone active calibrée (coins d'écran accessibles sans sortir du champ visuel).
- **🤏 Gestuelle de Pincement (Pouce + Index)** :
  - `Pincement rapide (< 350 ms)` : **Clic gauche** instantané.
  - `Deux pincements rapides` : **Double-clic**.
  - `Pincement maintenu + déplacement vertical` : **Défilement (Scroll) haut / bas** avec vitesse proportionnelle.
- **✌️ Geste Peace (2 Doigts / Victoire)** : **Clic droit** (menu contextuel).
- **✊ Poing Fermé (Fist)** : **Gel / Pause du curseur** pour reposer le bras sans déplacer la souris.
- **⌨️ Raccourci Clavier Universel** : Touche `[Espace]` ou `[M]` pour activer/désactiver le contrôle souris à tout moment.
- **🚀 Application Exécutable Windows (`Aegis.exe`)** :
  - Double-cliquez simplement sur `Aegis.exe` (ou `LANCER_AEGIS.bat`) pour tout démarrer automatiquement en mode application dédiée sans barre d'adresse.
- **📹 Pont Vidéo WebRTC P2P Zéro Latence** : Flux vidéo HD direct entre le smartphone et le PC via Wi-Fi local.
- **🤖 Détection MediaPipe Hands IA** : Traitement à 60 FPS des 21 articulations 3D de chaque main.
- **🔊 Synthétiseur Sonore Sci-Fi** : Sons procéduraux haptiques (clics, double clics, crans de scroll, pause).

---

## 🚀 Démarrage Ultra-Simple

### Méthode 1 : L'Exécutable Windows (Recommandé)
Double-cliquez simplement sur **`Aegis.exe`** (situé dans `iron-man-main` ou `LANCER_AEGIS.bat` à la racine) :
1. Le serveur démarre automatiquement.
2. L'interface HUD s'ouvre dans une fenêtre d'application dédiée.
3. Scannez le QR code affiché dans la console avec votre smartphone.

### Méthode 2 : Lancement Manuel
```bash
cd iron-man-main
npm install
npm start
```
- **Sur votre PC** : Ouvrez `https://localhost:8443/pc.html`
- **Sur votre Téléphone** : Ouvrez l'adresse affichée ou scannez le QR code.

---

## 🎮 Tableau des Commandes Gestuelles

| Geste de la main | Action Windows | Description |
| :--- | :--- | :--- |
| ☝️ **Index pointé / Main ouverte** | **Déplacement du curseur** | Le curseur suit votre index sur tout l'écran. |
| 🤏 **Pincement bref** | **Clic Gauche** | Tapotez le pouce et l'index brièvement (< 350 ms). |
| 🤏🤏 **Double pincement** | **Double-Clic** | Deux pincements rapides successifs. |
| 🤏↕️ **Pincement maintenu + glissement haut/bas** | **Molette / Scroll** | Main vers le haut = Défilement vers le haut.<br>Main vers le bas = Défilement vers le bas. |
| ✌️ **Geste 2 doigts (Peace)** | **Clic Droit** | Maintenez l'index et le majeur levés 350 ms. |
| ✊ **Poing fermé** | **Pause du curseur** | Fige le curseur pour reposer la main sans bouger la souris. |
| ⌨️ **Touche [Espace] ou [M]** | **Activer / Désactiver** | Bascule générale du contrôle souris. |

---

## 🛠️ Architecture Technique

```text
📱 Smartphone (Redmi A3)
   ├── Capture Caméra (getUserMedia)
   ├── Stream Matériel WebRTC (H.264 / VP8)
   └── WakeLock API (Anti-veille écran)
          │
          ▼ (Flux Vidéo P2P LAN direct)
          │
💻 PC Récepteur
   ├── Réception WebRTC & Rendu Canvas
   ├── MediaPipe Hands IA (21 articulations 3D)
   ├── Détecteur Gestuel (Pincement, Clic, Scroll, Poing)
   ├── WebSocket Local (Commandes gestuelles)
   │      │
   │      ▼ (Pipe IPC Stdin/Stdout < 1ms)
   └── AegisMouseBridge.exe (Win32 API: SetCursorPos & mouse_event)
          │
          ▼
   🖥️ Windows OS (Curseur, Clics, Défilement réels)
```

---

## 👤 Auteur
- **Ahmed** ([@zakrievahmed129-lgtm](https://github.com/zakrievahmed129-lgtm))
