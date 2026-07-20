# 📢 WhatsApp Broadcast System

Sistem broadcast pesan WhatsApp berbasis [Baileys](https://github.com/WhiskeySockets/Baileys) dengan antarmuka web modern. Dibangun untuk deployment di GCP VM dengan PM2 process manager.

## ✨ Fitur

- **📡 Koneksi WhatsApp** — Koneksi langsung via WebSocket (tanpa browser)
- **🚀 Broadcast Massal** — Kirim pesan ke ratusan kontak dengan rate limiting
- **👥 Manajemen Kontak** — Tambah, import bulk, dan kelompokkan dengan tag
- **📝 Template Pesan** — Simpan template untuk penggunaan berulang
- **📊 Dashboard Real-time** — Pantau status koneksi dan broadcast aktif
- **📜 Riwayat Lengkap** — Lacak semua aktivitas broadcast
- **⚡ Rate Limiting** — Jeda antar pesan untuk menghindari ban
- **🎯 Filter by Tag** — Kirim hanya ke kontak dengan tag tertentu
- **🧪 Tes Pengiriman** — Kirim pesan tes sebelum broadcast

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone <repo-url> whatsapp-broadcast
cd whatsapp-broadcast
npm install
```

### 2. Konfigurasi

```bash
cp .env.example .env
# Edit .env sesuai kebutuhan
```

### 3. Jalankan Development

```bash
npm run dev
```

Buka browser ke `http://localhost:3000`

### 4. Scan QR Code

1. Buka halaman **Settings** di UI
2. Klik **Hubungkan Sekarang**
3. Scan QR code dengan WhatsApp di ponsel Anda
4. Menu → Perangkat Tertaut → Tautkan Perangkat

## 🖥️ Production Deployment (GCP VM)

### 1. Setup VM

```bash
# Update sistem
sudo apt update && sudo apt upgrade -y

# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Clone project
git clone <repo-url> /opt/whatsapp-broadcast
cd /opt/whatsapp-broadcast
npm install --production
```

### 2. Environment Variables

```bash
cp .env.example .env
nano .env
```

Isi dengan:
```env
PORT=3000
NODE_ENV=production
RATE_LIMIT_DELAY=2000
MAX_BATCH_SIZE=100
```

### 3. Jalankan dengan PM2

```bash
# Buat folder logs
mkdir -p logs

# Start dengan PM2
pm2 start ecosystem.config.js

# Save PM2 config
pm2 save
pm2 startup

# Monitor
pm2 logs whatsapp-broadcast
pm2 monit
```

### 4. Setup Reverse Proxy (Nginx)

```bash
sudo apt install nginx -y
sudo nano /etc/nginx/sites-available/whatsapp-broadcast
```

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/whatsapp-broadcast /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 5. SSL dengan Certbot

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

### 6. Firewall (GCP)

Buka port di GCP Console:
- HTTP (80)
- HTTPS (443)
- SSH (22) — jika belum

## 📁 Struktur Folder

```
whatsapp-broadcast/
├── src/
│   ├── index.js              # Entry point
│   ├── whatsapp/
│   │   └── Connection.js     # Baileys connection manager
│   ├── queue/
│   │   └── BroadcastQueue.js # Queue & rate limiting
│   ├── api/
│   │   └── Routes.js         # Express API routes
│   ├── models/
│   │   └── Store.js          # In-memory store + persistence
│   └── utils/
├── public/
│   ├── index.html            # Single Page Application
│   ├── css/style.css         # Dark theme styles
│   └── js/app.js             # Frontend logic
├── auth_info/                # WhatsApp session (auto-generated)
├── data/                     # JSON data storage (auto-generated)
├── uploads/                  # File uploads
├── logs/                     # PM2 logs
├── package.json
├── ecosystem.config.js       # PM2 config
├── .env.example
└── README.md
```

## 🔌 API Endpoints

### Koneksi
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/connection/status` | Status koneksi WhatsApp |
| POST | `/api/connection/reconnect` | Reconnect ke WhatsApp |
| POST | `/api/connection/logout` | Logout & hapus session |

### Kontak
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/contacts?tags=tag1,tag2` | Daftar kontak |
| POST | `/api/contacts` | Tambah kontak |
| POST | `/api/contacts/bulk` | Import bulk (JSON file) |
| DELETE | `/api/contacts/:id` | Hapus kontak |

### Template
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/templates` | Daftar template |
| POST | `/api/templates` | Buat template |
| DELETE | `/api/templates/:id` | Hapus template |

### Broadcast
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/broadcast` | Kirim broadcast |
| GET | `/api/broadcast/:id` | Detail broadcast |
| POST | `/api/broadcast/:id/pause` | Pause broadcast |
| POST | `/api/broadcast/:id/resume` | Resume broadcast |
| POST | `/api/broadcast/:id/stop` | Stop broadcast |

### Lainnya
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/history?limit=50` | Riwayat broadcast |
| GET | `/api/stats` | Statistik dashboard |
| POST | `/api/send/test` | Kirim pesan tes |

## ⚠️ Best Practices & Batasan

### Rate Limiting
- Default delay: **2000ms** antar pesan
- WhatsApp mendeteksi spam jika terlalu cepat
- Untuk 1000 kontak = sekitar **33 menit**

### Session Management
- Session disimpan di folder `auth_info/`
- Jangan hapus folder ini setelah login berhasil
- Backup folder ini untuk recovery

### Anti-Ban Tips
- Gunakan nomor yang sudah lama aktif
- Hindari broadcast ke kontak yang tidak menyimpan nomor Anda
- Jangan kirim lebih dari 100 pesan/hari untuk nomor baru
- Variasikan isi pesan (jangan copy-paste sama)
- Jeda antar broadcast minimal 1 jam

### PM2
- **Jangan** gunakan cluster mode — Baileys hanya 1 instance per akun
- Gunakan `fork` mode seperti di `ecosystem.config.js`
- Monitor dengan `pm2 monit` atau `pm2 logs`

## 🔧 Troubleshooting

### QR Code tidak muncul
```bash
pm2 restart whatsapp-broadcast
# atau
npm run dev
```

### Session hilang
```bash
rm -rf auth_info/
pm2 restart whatsapp-broadcast
# Scan QR ulang
```

### Rate limit dari WhatsApp
- Tunggu 24 jam
- Kurangi jumlah broadcast
- Naikkan delay antar pesan

### Port sudah digunakan
```bash
lsof -i :3000
kill -9 <PID>
```

## 📝 Changelog

### v1.0.0
- Initial release
- Broadcast system with queue
- Contact & template management
- Real-time dashboard
- PM2 production ready

## 📄 Lisensi

MIT License — Gunakan dengan bijak dan patuhi ketentuan layanan WhatsApp.

---

**Dibuat dengan ❤️ menggunakan Baileys + Express + Vanilla JS**
