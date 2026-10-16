# MotionSnap 📸✨

Aplikasi photo booth interaktif & visual FX real-time berbasis pelacakan gesture tangan (motion tracking).  
Dibangun murni dengan **Native JavaScript (ESM)** + **MediaPipe Hands** (dual hand tracking) + **HTML5 Canvas 2D**.

## Fitur Utama

1. **Sistem 3 Mode Terpisah (State Machine)**:
   - 📸 **Mode Foto**: Tunjukkan 1–4 jari untuk timer hitung mundur dan ambil foto otomatis yang masuk ke galeri.
   - 🎨 **Mode Gambar (Canvas)**: Menggambar bebas di atas video menggunakan ujung jari telunjuk dengan kuas neon glowing.
   - ✨ **Mode Efek Portal TikTok**: Efek visual futuristik (Negative, Glitch/RGB Split, Pixelate, Grayscale Noir, Vintage Film, Thermal Heat-Vision, Zoom Lens) yang **hanya aktif di dalam kotak sudut jari yang ditarik**.

2. **2-Hand Portal Effect ("Tarik Sudut Jari")**:
   - Terinspirasi dari efek viral TikTok RetroLens.
   - Menggunakan 4 ujung jari (telunjuk & jempol kedua tangan) sebagai jangkar sudut quadrilateral.
   - Saat tangan ditarik atau dipindahkan, jendela efek bertransformasi dinamis mengikuti gerakan jari.
   - Dilengkapi HUD Cyber Holografik: garis neon bercahaya, crosshair sudut, dan floating badge info.

3. **Digital Pinch-Zoom & Kontrol Zoom**:
   - Jepit antara jempol dan telunjuk:
     * Tertutup ke terbuka (spread) = **Zoom In (+)**
     * Terbuka ke tertutup (pinch) = **Zoom Out (-)**
   - Proteksi gesture ketat: **Thumbs Up, Kepalan, Peace Sign, dan Open Palm tidak akan memicu zoom** secara keliru.
   - Kontrol Zoom UI di pojok kanan atas kamera: tombol `[ − ]`, `[ 1.0x ]` (reset), dan `[ + ]`.
   - Pintasan keyboard: `+` (zoom in), `-` (zoom out), `0` (reset).

4. **Stabilisasi Transisi Mode (Delay 2 Detik)**:
   - Setiap kali berpindah mode (atau setelah mengambil foto), terdapat **jeda stabilisasi 2 detik** (`⏳ Siap dalam 2s…`).
   - Kamera dan skeleton tangan tetap aktif bergerak, namun eksekusi gesture dikunci sementara agar gerakan tangan transisi tidak langsung memicu aksi yang kacau.
   - Ambang penahanan consensus gesture dinaikkan ke ~0.5 detik untuk menjamin gesture benar-benar disengaja.

5. **Navigasi Gesture yang Andal & Mudah Terbaca**:
   - Menggantikan gesture love sign yang rumit dengan **✌️ Peace Sign (2 Jari)** yang 100% responsif di MediaPipe.
   - **✋ 5 Jari (Open Palm)** untuk masuk Mode Foto.
   - **👍 Thumbs Up** untuk masuk Mode Portal.
   - **👊 Kepalan (Fist)** sebagai tombol batal / kembali ke menu awal dari mode mana pun.
   - Sidebar kontrol interaktif: dapat diklik langsung dengan mouse/touchscreen.

---

## Panduan Gesture & Kontrol

### 1. Menu Awal (Pilih Mode)
| Gesture | Aksi |
|---|---|
| ✋ **5 Jari (Open Palm)** | Masuk **📸 Mode Foto** |
| ✌️ **2 Jari (Peace Sign)** | Masuk **🎨 Mode Gambar** |
| 👍 **Thumbs Up** | Masuk **✨ Mode Efek Portal** |
| 👊 **Kepalan (Fist)** | Reset / Batal |

### 2. 📸 Mode Foto
- ☝️ **1 Jari**: Timer 1 detik → Foto
- ✌️ **2 Jari**: Timer 2 detik → Foto
- 🤟 **3 Jari**: Timer 3 detik → Foto
- ✋ **4 Jari**: Timer 4 detik → Foto
- 👊 **Kepalan**: Keluar ke menu awal

### 3. 🎨 Mode Gambar
- ☝️ **1 Jari**: Kuas putih tipis
- ✌️ **2 Jari**: Kuas cyan medium
- 🤟 **3 Jari**: Kuas pink tebal
- ✋ **4–5 Jari**: Angkat kuas (berhenti menggambar)
- 👍 **Thumbs Up**: Hapus kanvas
- 👊 **Kepalan**: Keluar ke menu awal

### 4. ✨ Mode Efek Portal (4 Titik Cyber Quad)
- 👐 **2 Tangan**: Rentangkan dan tarik 4 titik sudut (Telunjuk dan Jempol kedua tangan) untuk membentuk portal 4 titik futuristik
- 🖐️ **1 Tangan**: Rentangkan jari untuk membentuk portal 4 sudut (Jempol, Telunjuk, Kelingking, Pergelangan)
- 🗂️ **Map-Select Carousel**: Geser tangan ke area kartu di bawah video kamera untuk memilih efek (kartu di tengah reticle aktif)
- 🚪 **Keluar**: Klik "Kembali ke Menu Awal" di sidebar kontrol

---

## Cara Menjalankan

```bash
# Pastikan server lokal berjalan:
npx serve . --listen 5173
```
Buka browser di **http://localhost:5173** dan izinkan akses kamera webcam.

---

## Arsitektur Modul (Deep Module Design)

```
js/
├── app.js        # Orchestrator — inisialisasi, loop MediaPipe dual-hand & state binding
├── modes.js      # Pure state machine untuk siklus mode (IDLE, PHOTO, DRAW, EFFECT)
├── gestures.js   # Perhitungan koordinat landmark MediaPipe, portal corners & zoom distance
├── renderer.js   # Canvas render — mirrored webcam, skeleton overlay & digital zoom lerp
├── videoFx.js    # Filter video per-pixel, offscreen canvas mask, & cyber HUD portal frame
├── draw.js       # Persistent fingertip drawing engine dengan brush glow
├── effects.js    # Particle FX engine (confetti & hearts)
└── ui.js         # DOM updates — mode badge, zoom controls, countdown SVG ring, & sidebar guide
```
Setiap modul dirancang mandiri dengan *high cohesion & low coupling*. Tidak ada modul rendering yang menyentuh DOM secara langsung, dan `app.js` mendelegasikan semua detail teknis ke modul spesialisnya.