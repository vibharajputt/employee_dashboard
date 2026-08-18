# MedAstraX Workspace Portal — Complete Deployment Guide

> 100% Free | Zero Personal Data in Code | Secure Cloud Setup

---

## Architecture and Security Model

```
 GitHub Repository
 (Only Clean Source Code — 0% Personal Information)
        |
        | Auto-Build and Deploy
        v
 Render.com (Free Web Service)
 Node.js + Express + Socket.IO
 Secrets stored ONLY in Render Environment Variables
        |
        | Encrypted SSL Connection
        v
 Neon.tech (Cloud PostgreSQL — Free Tier)
 Employee data lives here — private, encrypted, safe
```

Golden Rule: Koi bhi password, Aadhaar number, phone number, ya DB credentials kabhi
bhi code ya GitHub mein nahi hone chahiye. Sab kuch environment variables ya cloud DB mein
rehta hai.

---

## Pre-Deploy Checklist (Already Done)

| Task | Status |
| :--- | :--- |
| .env added to .gitignore | Done |
| mock_db.json added to .gitignore | Done |
| seed_data.json added to .gitignore | Done |
| mock_db.json purged from entire git history | Done |
| No hardcoded credentials in source code | Done |
| Code pushed to GitHub (force-push after history clean) | Done |

---

## PART A — Neon Database Setup

### Step 1: Neon Account Banana

1. Browser mein neon.tech open karein
2. Sign Up par click karo (GitHub se bhi ho sakta hai)
3. Email verify karo agar maanga jaaye

### Step 2: New Project Create Karo

1. Dashboard par "New Project" click karein
2. Fill in karo:
   - Project Name: medastrax (ya kuch bhi)
   - Postgres Version: 16 (latest)
   - Region: ap-southeast-1 (Singapore) — Render ke Singapore region se closest
3. "Create Project" click karein

### Step 3: Connection String Copy Karo

1. Project dashboard mein "Connection Details" section mein jaao
2. Dropdown mein "Pooled connection" select karo (better performance)
3. Connection string copy karo — format aisi hogi:

   postgresql://neondb_owner:YOUR_PASSWORD@YOUR_HOST.neon.tech/neondb?sslmode=require

   IMPORTANT: Yeh string Notepad ya password manager mein save karo.
   Ise GitHub, code, ya kisi bhi file mein paste MAT karna.

### Step 4: Database Tables

Kuch karne ki zaroorat nahi. Jab server pehli baar start hoga, server.js khud saari tables
create kar leta hai — users, tasks, leaves, meetings, attendance, messages, etc.

---

## PART B — Employee Data Seed Karna

> Yeh step sirf pehli baar karna hai. Iske baad naye employees Admin portal se directly add ho sakte hain.

### Step 1: Local .env File Banao

Project folder mein .env file create karo (agar nahi hai):

   DATABASE_URL=postgresql://neondb_owner:YOUR_PASSWORD@YOUR_HOST.neon.tech/neondb?sslmode=require

.env already .gitignore mein hai — yeh GitHub par kabhi nahi jayegi.

### Step 2: seed_data.json Check Karo

seed_data.json local computer par honi chahiye (.gitignore mein hai, GitHub par nahi).
Agar nahi hai toh mock_db.json copy karke rename kar lo:

   Copy-Item mock_db.json seed_data.json

### Step 3: Seed Script Chalao

   node seed_database.js

Expected output:

   [DB] Connected to PostgreSQL medastrax
   [DB] Seeding users...
   [DB] Users seeded successfully.
   [DB] Done! All data seeded to Neon cloud.

Ab saara employee data securely Neon cloud DB mein hai. seed_data.json local pe hi rahega.

---

## PART C — Render.com Deployment

### Step 1: Render Account Banana

1. render.com open karein
2. "Get Started for Free" par click karo
3. "Sign in with GitHub" karo — same account jahan repo hai

### Step 2: New Web Service Banana

1. Dashboard top-right mein "+ New" click karo
2. "Web Service" select karo
3. "Build and deploy from a Git repository" choose karo -> Next
4. Repository list mein apna repo dhundho: vibharajputt/employee_dashboard
5. "Connect" click karo

   (Agar repo na dikhe: neeche "Configure GitHub App" click karke repository access enable karo)

### Step 3: Service Configuration

Form mein ye exact values bharein:

| Field            | Value                          |
| :---             | :---                           |
| Name             | medastrax-portal               |
| Region           | Singapore (Southeast Asia)     |
| Branch           | main                           |
| Root Directory   | (Khaali chhodo)                |
| Runtime          | Node                           |
| Build Command    | npm install                    |
| Start Command    | node server.js                 |
| Instance Type    | Free                           |

### Step 4: Environment Variables Add Karna (MOST IMPORTANT)

Yahi jagah hai jahan secrets safely store hote hain — GitHub mein nahi.

Neeche scroll karo aur "Environment Variables" section mein ye add karo:

Variable 1 — Database Connection:
   Key:   DATABASE_URL
   Value: (Neon connection string paste karo — Part A Step 3 mein copy ki thi)

Variable 2 — Node Environment:
   Key:   NODE_ENV
   Value: production

Variable 3 — Email OTP Login (Optional):
   Key:   RESEND_API_KEY
   Value: (Resend.com se API key — agar OTP email login feature chahiye)

   Key:   MAIL_FROM
   Value: MedAstraX <noreply@medastrax.com>

IMPORTANT: Koi bhi actual password, Aadhaar number, ya personal info yahan mat daalna.
Render ke environment variables encrypted hote hain — sirf aapka Render account inhe dekh sakta hai.

### Step 5: Deploy!

1. "Create Web Service" button click karo
2. Build logs dikhenge (2-4 minutes):

   ==> Running build command 'npm install'...
   ==> Starting service with 'node server.js'...
   [DB] Connected to PostgreSQL medastrax
   [DB] Database migration and seeding checks complete
   MedAstraX Portal running on port 10000
   ==> Your service is live

3. Top par aapka live URL dikhega: https://medastrax-portal.onrender.com

---

## PART D — Post-Deploy Verification

### 1. Portal Open Karo

Browser mein Render ka URL paste karo.

Note: Pehli baar open hone mein 30-40 seconds lag sakte hain. Render free tier sleep mode
se wake hota hai — yeh completely normal hai.

### 2. Login Karo

Admin account se login karo (credentials seed_data.json ya Neon DB mein hain).

Security Note: Credentials is document mein nahi likhenge — kabhi bhi kisi document
ya code file mein credentials mat likhna.

### 3. Features Verify Karo

- Real-time Chat and Group Messages
- Task Board and Assignment
- Attendance and Leave Management
- Meetings and Live Room
- Employee Profiles and Settings
- OTP Email Login (agar RESEND_API_KEY set hai)

---

## Future Updates — Code Change ke Baad

Jab bhi code update karo aur push karo:

   git add .
   git commit -m "Describe your change here"
   git push origin main

Render automatically detect karega aur naya version auto-deploy ho jayega — kuch aur nahi karna.

IMPORTANT: Agar kabhi force push karo (git push --force), toh Render dashboard mein
jaake manual deploy trigger karo.

---

## Troubleshooting

| Problem | Solution |
| :--- | :--- |
| Build fails | Render logs mein error dekho — usually missing package ya syntax error |
| DB connection error | DATABASE_URL environment variable check karo — extra spaces nahi hone chahiye |
| Port error | server.js mein process.env.PORT use ho raha hai — PORT double-check karo |
| First load slow (30-40s) | Normal — Render free tier 15 min inactivity ke baad sleep mode mein jaata hai |
| Data nahi dikha | Seed step dobara chalao: node seed_database.js |
| Module not found | npm install locally chalao aur package.json dependencies check karo |
| Neon connection refused | SSL mode check karo — connection string mein sslmode=require hona chahiye |

---

## Security Summary

| Sensitive Item | Kahaan Stored Hai | GitHub Par? |
| :--- | :--- | :--- |
| Employee passwords | Neon Cloud DB (encrypted) | Never |
| Employee Aadhaar numbers | Neon Cloud DB (encrypted) | Never |
| Employee phone numbers | Neon Cloud DB (encrypted) | Never |
| Database connection string | Render Environment Variables | Never |
| Resend API Key | Render Environment Variables | Never |
| seed_data.json (local backup) | Local computer only | .gitignore mein (safe) |
| mock_db.json (local backup) | Local computer only | .gitignore + full history purge |
| .env file | Local computer only | .gitignore mein (safe) |

---

## Free Tier Limits (Reference)

| Service | Free Limit |
| :--- | :--- |
| Neon DB | 512 MB storage, 190 compute hours/month |
| Render Web Service | 750 hours/month — 1 service always free |
| Resend Email | 100 emails/day, 3,000/month |

Ek normal employee dashboard ke liye ye limits kaafi hain.

---

Last updated: August 2026 | MedAstraX Workspace Portal v2.0
