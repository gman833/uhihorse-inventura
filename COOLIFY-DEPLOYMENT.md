# UHIHORSE Inventura - Coolify v4 Deployment

## 📦 Fajli za deployment:
- `index.html` - Glavna aplikacija
- `Dockerfile` - Docker konfiguracija
- `docker-compose.yml` - Docker Compose setup

---

## 🚀 COOLIFY v4 - Deployment Koraki:

### **OPCIJA 1: GitHub Repository (PRIPOROČENO)**

#### **KORAK 1: Ustvarite GitHub Repo**
1. Pojdite na: https://github.com/new
2. Repository name: `uhihorse-inventura`
3. Public ali Private (odvisno od vas)
4. **NE** dodajte README
5. Kliknite "Create repository"

#### **KORAK 2: Upload Fajli**
1. Na GitHub repo strani kliknite "uploading an existing file"
2. Povlecite vse 3 fajle:
   - `index.html`
   - `Dockerfile`
   - `docker-compose.yml`
3. Commit message: "Initial commit"
4. Kliknite "Commit changes"

#### **KORAK 3: V Coolify**
1. **Projects** → **+ Add**
2. Ime: `UHIHORSE` → Save
3. V projektu: **+ New Resource**
4. Izberite: **Application**
5. **Source**: Git Repository
   - Repository URL: `https://github.com/[vase-username]/uhihorse-inventura`
   - Branch: `main`
6. **Build Pack**: Dockerfile
7. **Port**: `80`
8. Kliknite **Save**
9. Kliknite **Deploy**

**Počakajte 1-2 minuti in aplikacija bo live!** 🎉

---

### **OPCIJA 2: Docker Image (ČE IMATE DOCKER HUB)**

#### **Na vašem računalniku:**
```bash
# Build image
docker build -t [your-dockerhub-username]/uhihorse-inventura:latest .

# Push to Docker Hub
docker push [your-dockerhub-username]/uhihorse-inventura:latest
```

#### **V Coolify:**
1. Projects → + Add → `UHIHORSE`
2. + New Resource → Application
3. Source: **Docker Image**
4. Image: `[your-dockerhub-username]/uhihorse-inventura:latest`
5. Port: `80`
6. Save → Deploy

---

### **OPCIJA 3: Lokalno Testiranje (Preden Deployate)**

```bash
# Build in poženite lokalno
docker-compose up -d

# Odprite v brskalniku
http://localhost
```

Ko deluje, deployajte na Coolify!

---

## 🔧 Troubleshooting

### **Če ne deluje v Coolify:**

1. **Preverite Logs:**
   - V Coolify aplikaciji → "Logs"
   - Poiščite napake

2. **Preverite Port:**
   - Port MORA biti `80` ali spremenite v Dockerfile

3. **Preverite Build:**
   - Coolify → Application → "Build Logs"
   - Če je build failed, preverite Dockerfile syntax

---

## 📱 Kako Testirati na iPhonu

Ko je aplikacija deployana na Coolify:

1. **Dobite URL:**
   - V Coolify aplikaciji → "Domains"
   - Kopirajte URL (npr. `https://uhihorse.yourdomain.com`)

2. **Na iPhonu:**
   - Odprite Safari
   - Vnesite URL
   - Dovolite dostop do kamere
   - Testirajte! 🎥

---

## ⚡ Quick Start (Če ste v naglici)

**Najhitrejša metoda - GitHub:**

```bash
# 1. Ustvarite repo na GitHubu (uhihorse-inventura)
# 2. Upload index.html, Dockerfile, docker-compose.yml
# 3. V Coolify:
#    - New Project → UHIHORSE
#    - New Resource → Application → Git Repository
#    - Paste GitHub URL
#    - Deploy
```

**DONE!** ✅

---

## 🎯 URL Structure po Deploymentu

Vaša aplikacija bo dostopna na:
- `http://[coolify-server-ip]:[port]`
- ALI če ste nastavili domain: `https://uhihorse.yourdomain.com`

V Coolify lahko nastavite custom domain v: **Application → Settings → Domains**

---

## 📝 Naslednji Koraki

Ko aplikacija deluje:
- [ ] Testirajte QR skeniranje na telefonu
- [ ] Preverite Export JSON funkcionalnost
- [ ] Dodajte SSL certifikat (v Coolify avtomatsko s Let's Encrypt)
- [ ] Nastavite custom domain
- [ ] Implementirajte pravi backend (za produkcijo)

---

**UHIHORSE** © 2024 - Inventurni sistem
