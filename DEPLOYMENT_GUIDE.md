# 🚀 MedAstraX Workspace Portal — Complete Deployment Guide (100% Free)

Yeh document aapke application aur **Neon PostgreSQL Database** ko **Render.com** par **100% Free** live deploy karne ki complete, step-by-step guide hai.

---

## 🏗️ Architecture & Security Model

```
 ┌─────────────────────────────────────────────────────────────┐
 │                      GitHub Repository                      │
 │      (Only Clean Source Code • 0% Personal Information)     │
 └──────────────────────────────┬──────────────────────────────┘
                                │ (Auto-Build & Deploy)
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │              Render.com (Free Web Service)                  │
 │   - Host: Node.js + Express + Socket.IO (WebSockets)        │
 │   - Secret Key: DATABASE_URL (Stored securely in Render)    │
 └──────────────────────────────┬──────────────────────────────┘
                                │ (Encrypted SSL Connection)
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │         Neon.tech (Cloud PostgreSQL - Singapore)            │
 │   - Holds actual data: 22 Users, Aadhaar, Tasks, Attendance │
 │   - 100% Free Forever • Multi-user Realtime • Safe & Private│
 └─────────────────────────────────────────────────────────────┘
```

---

## 📌 Status Check (Ab Tak Kya Ho Chuka Hai)

- ✅ **Neon PostgreSQL Database Created:** `ep-winter-glade-azdafwpj-pooler` (Singapore Region).
- ✅ **Database Schema & Tables Initialized:** `users`, `tasks`, `leaves`, `meetings`, `attendance`, `messages`, `groups`, `activities`.
- ✅ **22 Real Employees Seeded into Cloud DB:** All founders, CTO, tech team, marketing team safely stored in cloud database.
- ✅ **GitHub Leak Protection:** `.gitignore` configured for `.env`, `mock_db.json`, `seed_data.json`.

---

## 📋 Step 1: Code ko GitHub par Push Karein

Apne IDE ya VS Code terminal me yeh 3 commands chalayein:

```powershell
git add .
git commit -m "Configure secure Neon PostgreSQL cloud database and deployment setup"
git push origin main
```

---

## 📋 Step 2: Render.com par Free Web Service Setup Karein

### 1. Login & Service Creation:
1. Browser me **[render.com](https://render.com/)** open karein.
2. Top-right me **Sign In / Get Started** par click karke **GitHub se login** karein.
3. Render Dashboard par top-right me **`+ New`** button par click karein aur **`Web Service`** select karein.
4. **"Build and deploy from a Git repository"** choose karke **Next** karein.

---

### 2. Connect Repository:
1. Repositories list me se apna project select karein: **`vibharajputt/employee_dashboard`**.
2. Uske samne **`Connect`** button par click karein.
   *(Agar repo na dikhe, toh neeche "Configure GitHub App" par click karke repository access enable karein).*

---

### 3. Service Configuration (Exact Form Values):

Form me yeh exact values fill karein:

| Form Field | Exact Value To Enter |
| :--- | :--- |
| **Name** | `medastrax-portal` *(ya koi bhi unique name)* |
| **Region** | **Singapore (Southeast Asia)** *(Nearest to Neon DB for max speed)* |
| **Branch** | `main` |
| **Root Directory** | *(Leave Blank / Khaali chhod dein)* |
| **Runtime** | **Node** |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |
| **Instance Type** | **Free** |

---

### 4. Environment Variables Add Karein (Most Important 🔑):

Neeche scroll karein aur **"Environment Variables"** section open karein:

#### Variable 1:
- **Key:** `DATABASE_URL`
- **Value:** 
  ```text
  postgresql://neondb_owner:npg_Hkx9mVfcDuA1@ep-winter-glade-azdafwpj-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
  ```

#### Variable 2:
- **Key:** `NODE_ENV`
- **Value:** `production`

---

### 5. Deploy Karein:
1. Sabse neeche **`Create Web Service`** (ya *Deploy Web Service*) button par click karein.
2. Render build process start karega (Logs terminal screen par dikhenge):
   ```text
   ==> Running build command 'npm install'...
   ==> Uploading build...
   ==> Starting service with 'node server.js'...
   [DB] Connected to PostgreSQL medastrax
   [DB] Database migration and seeding checks complete
   MedAstraX Portal running on port 10000
   ==> Your service is live 🎉
   ```
3. Top-left corner me aapko aapka live URL mil jayega (Example: `https://medastrax-portal.onrender.com`).

---

## 📋 Step 3: Live Portal Test & Login

Browser me Render ka diya hua live URL open karein:

1. **Login Credentials:**
   - **CTO / Admin:** `vibha` / `vibha123`
   - **CEO / Founder:** `sambhav` / `sambhav123`
   - **Head of Tech:** `rashika` / `rashika123`
   - *(Sabhi 22 employees apne existing usernames/passwords se login kar sakte hain).*
2. **Features Test:**
   - ✅ Real-time Chat & Group Messages
   - ✅ Task Board & Assignment
   - ✅ Attendance & Leave Management
   - ✅ Meetings & Live Room Call
   - ✅ Auto-save into Cloud PostgreSQL

---

## ❓ Frequently Asked Questions (FAQ)

### Q1: Kya Neon Database kabhi band ya delete hoga?
**Nahi.** Neon serverless Postgres hai. Inactivity par yeh standby/sleep mode me jata hai aur kisi bhi user ke aate hi **~500 milliseconds (0.5 second)** me instant wake-up ho jata hai. Data 24/7 permanent aur safe rehta hai.

### Q2: Render Free Tier sleep mode me jata hai?
**Haan.** Agar 15 minute tak koi website open na kare, toh Render ka web server sleep me chala jata hai. Jab koi pehli baar website open karega, toh pehla page load hone me **~30-40 seconds** lag sakte hain, uske baad sabhi pages aur features superfast chalte hain.

### Q3: Naye employees add karne par data kahan save hoga?
Live dashboard par Admin panel se jo bhi naya user, task ya attendance create hoga, woh directly aapke **Neon Cloud Database** me automatically save hoga. GitHub code par koi change karne ki zaroorat nahi padegi.

---

## 🔒 Security Summary

| Sensitive Item | Storage Location | GitHub Visibility |
| :--- | :--- | :--- |
| **Aadhaar Numbers & Personal Phones** | Neon Cloud Database (Singapore) | ❌ Hidden / Zero Leaks |
| **Database Connection Credentials** | Render Environment Variables | ❌ Secret & Encrypted |
| **Local Mock / Seed Backups** | Local Computer (`.gitignore`) | ❌ Untracked |
