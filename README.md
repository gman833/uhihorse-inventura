<<<<<<< HEAD
# 🐴 UHIHORSE Inventory System

Sistem za inventuro z QR skeniranjem za UHIHORSE.

## Funkcionalnosti

- **Admin dashboard** - upravljanje uporabnikov, pregled sej, izvoz podatkov
- **QR skeniranje** - skeniranje QR kod s kamero telefona/tablice
- **Seje** - organizacija skeniranj v seje
- **Izvoz** - XLSX in CSV izvoz vseh podatkov

## Namestitev na VPS

### Zahteve
- Node.js 18+ 
- npm

### Koraki

```bash
# 1. Naloži datoteke na server
scp -r uhihorse-inventory/ user@server:/opt/

# 2. Pojdi v mapo
cd /opt/uhihorse-inventory

# 3. Namesti odvisnosti
npm install

# 4. Nastavi environment spremenljivke (opcijsko)
export PORT=3000
export SESSION_SECRET="tvoj-dolg-naključen-string"

# 5. Zaženi
node server.js
```

### Produkcija s systemd

Ustvari datoteko `/etc/systemd/system/uhihorse.service`:

```ini
[Unit]
Description=UHIHORSE Inventory System
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/uhihorse-inventory
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment=PORT=3000
Environment=SESSION_SECRET=tvoj-dolg-naključen-string
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable uhihorse
sudo systemctl start uhihorse
```

### HTTPS z Nginx reverse proxy

```nginx
server {
    listen 80;
    server_name inventura.uhihorse.si;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name inventura.uhihorse.si;

    ssl_certificate /etc/letsencrypt/live/inventura.uhihorse.si/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/inventura.uhihorse.si/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Za SSL certifikat:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d inventura.uhihorse.si
```

## Privzeta prijava

- **Username:** `admin`
- **Geslo:** `admin123`
- ⚠️ **Takoj spremeni geslo po prvi prijavi!**

## Struktura baze (SQLite)

- `users` - uporabniki (admin/user)
- `scan_sessions` - seje skeniranja
- `scan_items` - posamezni skenirani artikli

Baza se avtomatsko ustvari v `data/inventory.db`.

## API Endpoints

### Auth
- `POST /api/auth/login` - Prijava
- `POST /api/auth/logout` - Odjava
- `GET /api/auth/me` - Trenutni uporabnik

### Sessions (User)
- `GET /api/sessions` - Moje seje
- `POST /api/sessions` - Nova seja
- `PUT /api/sessions/:id/complete` - Zaključi sejo
- `DELETE /api/sessions/:id` - Izbriši sejo

### Items (User)
- `GET /api/sessions/:id/items` - Artikli v seji
- `POST /api/sessions/:id/items` - Dodaj artikel
- `PUT /api/items/:id` - Posodobi količino
- `DELETE /api/items/:id` - Izbriši artikel

### Admin
- `GET /api/admin/users` - Vsi uporabniki
- `POST /api/admin/users` - Nov uporabnik
- `PUT /api/admin/users/:id` - Uredi uporabnika
- `DELETE /api/admin/users/:id` - Izbriši uporabnika
- `GET /api/admin/sessions` - Vse seje (s filtri)
- `GET /api/admin/stats` - Statistika
- `GET /api/admin/export?format=xlsx|csv` - Izvoz
=======
# uhihorse-inventura
>>>>>>> 32f92cc9948affa2f8b26f6ef46b0d543a83d1c0
