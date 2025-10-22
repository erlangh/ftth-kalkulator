# FTTH Kalkulator

Aplikasi web untuk perhitungan otomatis jaringan FTTH dengan upload file KML/KMZ berisi titik ODC dan rute feeder. Hasil: visualisasi peta, jumlah material (tiang, panjang kabel feeder & distribusi, jumlah ODP), serta ekspor KML/KMZ dan PDF.

## Fitur
- Upload KML/KMZ (ODC Point, Feeder LineString)
- Pilihan: jenis tiang (6m/7m/9m), jarak antar tiang (50–100m), feeder core (12/24/48/96/144), ODP per ODC (4/8/12/16)
- Visualisasi: ODC, feeder, tiang, ODP, dan jalur distribusi (ODC→ODP)
- Ekspor: KML/KMZ yang lebih lengkap dan PDF ringkasan material

## Asumsi & Catatan
- Semua LineString dari KML dianggap rute feeder.
- ODP dibuat radial di sekitar ODC (~120m) untuk visualisasi sederhana. Anda bisa kustomisasi pola distribusi sesuai rute aktual.
- Panjang feeder dihitung dari total panjang semua LineString; tiang ditempatkan tiap `jarak antar tiang` di sepanjang feeder.
- Panjang distribusi dihitung dari total jarak ODC→ODP.

## Menjalankan Secara Lokal

Prerequisites: Node.js 18/20+

```bash
npm install
npm run dev
# buka http://localhost:5173
```

## Deployment di Ubuntu 22/24 (pilih salah satu)

### Opsi A: Node.js (tanpa Docker)
```bash
# di server
sudo apt update
sudo apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# clone repo
git clone https://github.com/erlangh/ftth-kalkulator.git
cd ftth-kalkulator
npm install --production

# jalankan
NODE_ENV=production PORT=5173 node server.js
# akses: http://SERVER_IP:5173
```

Opsional: buat service systemd
```bash
sudo tee /etc/systemd/system/ftth-kalkulator.service > /dev/null <<'EOF'
[Unit]
Description=FTTH Kalkulator
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ftth-kalkulator
ExecStart=/usr/bin/node server.js
Restart=always
Environment=PORT=5173 NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo mkdir -p /opt/ftth-kalkulator
sudo cp -r * /opt/ftth-kalkulator
sudo systemctl daemon-reload
sudo systemctl enable --now ftth-kalkulator
```

### Opsi B: Docker
```bash
# di server
sudo apt update && sudo apt install -y docker.io
sudo systemctl enable --now docker

# clone repo
git clone https://github.com/erlangh/ftth-kalkulator.git
cd ftth-kalkulator

# build & run
sudo docker build -t ftth-kalkulator:latest .
sudo docker run -d --name ftth-kalkulator -p 5173:5173 ftth-kalkulator:latest
# akses: http://SERVER_IP:5173
```

## Struktur Project
- `server.js` – Express static server
- `public/index.html` – UI
- `public/app.js` – logika parsing & kalkulasi
- `public/styles.css` – gaya UI
- `Dockerfile` – container build

## Dorongan ke GitHub
Siapkan repo kosong di akun `erlangh` misal `ftth-kalkulator`, lalu jalankan:
```bash
git init
git add .
git commit -m "Initial commit: FTTH Kalkulator"
git branch -M main
git remote add origin https://github.com/erlangh/ftth-kalkulator.git
git push -u origin main
```

Jika perlu autentikasi, gunakan Personal Access Token (PAT) atau `gh auth login`.

## Releases & Changelog
- Lihat rilis: https://github.com/erlangh/ftth-kalkulator/releases
- Rilis awal: `v1.0.0` — https://github.com/erlangh/ftth-kalkulator/releases/tag/v1.0.0
- Changelog: lihat `CHANGELOG.md` di repo.

### Rilis Otomatis (CI)
- Setiap push tag `v*` (mis. `v1.0.1`) akan memicu GitHub Actions untuk: 
  - Membangun arsip ZIP berisi `server.js`, `package.json`, `Dockerfile`, `README.md`, `CHANGELOG.md`, dan folder `public/`.
  - Membuat Release di GitHub dengan nama `FTTH Kalkulator <tag>` dan melampirkan ZIP sebagai asset.
- Cara memicu:
  - Pastikan `main` bersih dan dorong tag: `git tag v1.0.1 -m \"FTTH Kalkulator v1.0.1\" && git push origin v1.0.1`.
  - Workflow: `.github/workflows/release.yml`.

### Auto Install (Ubuntu 22)
- Unduh dan jalankan skrip:
  - `curl -O https://raw.githubusercontent.com/erlangh/ftth-kalkulator/main/scripts/install_ubuntu_22.sh`
  - `chmod +x install_ubuntu_22.sh`
  - `sudo ./install_ubuntu_22.sh --tag latest --port 5173 --dir /opt/ftth-kalkulator --user ubuntu`
- Opsi:
  - `--tag latest` untuk versi terbaru atau `--tag vX.Y.Z` untuk versi spesifik.
  - `--source release|git` default `release`.
- Service:
  - `sudo systemctl status ftth-kalkulator`
  - `sudo systemctl restart ftth-kalkulator`
  - `sudo journalctl -u ftth-kalkulator -f`
