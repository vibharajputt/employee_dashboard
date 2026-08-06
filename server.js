const express = require('express');
const { Pool, Client } = require('pg');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

app.use(express.json());
app.use(express.static(__dirname));

// Request logger
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

// Disable API caching
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Auto-check and create database if missing
async function ensureDatabaseExists() {
  const defaultConnectionString = process.env.DATABASE_URL.replace(/\/medastrax(?:\?.*)?$/, '/postgres');
  const client = new Client({ connectionString: defaultConnectionString });
  try {
    await client.connect();
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'medastrax'");
    if (res.rowCount === 0) {
      console.log("[DB] Database 'medastrax' does not exist. Creating it...");
      await client.query("CREATE DATABASE medastrax");
      console.log("[DB] Database 'medastrax' created successfully.");
    } else {
      console.log("[DB] Database 'medastrax' verified.");
    }
  } catch (err) {
    console.error("[DB] Database creation check failed:", err.message);
  } finally {
    try {
      await client.end();
    } catch (e) {}
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Auto migrations and seeding
async function initDb() {
  try {
    await ensureDatabaseExists();
    
    const client = await pool.connect();
    console.log('[DB] Connected to PostgreSQL medastrax');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        "id" VARCHAR(50) PRIMARY KEY,
        "username" VARCHAR(50) UNIQUE NOT NULL,
        "password" VARCHAR(50) NOT NULL,
        "fullname" VARCHAR(100) NOT NULL,
        "role" VARCHAR(50) NOT NULL,
        "reportingManagerId" VARCHAR(50),
        "status" VARCHAR(50),
        "availabilityStatus" VARCHAR(50),
        "gmail" VARCHAR(100),
        "phone" VARCHAR(50),
        "domain" VARCHAR(100),
        "aadhar" VARCHAR(50)
      )
    `);

    // Create tasks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        "id" VARCHAR(50) PRIMARY KEY,
        "title" VARCHAR(200) NOT NULL,
        "description" TEXT,
        "assigneeId" VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
        "priority" VARCHAR(50),
        "dueDate" VARCHAR(50),
        "status" VARCHAR(50),
        "assignedById" VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
        "referenceLink" VARCHAR(500),
        "deliverableLink" VARCHAR(500),
        "feedback" TEXT,
        "comments" JSONB DEFAULT '[]'
      )
    `);

    // Create leaves table
    await client.query(`
      CREATE TABLE IF NOT EXISTS leaves (
        "id" VARCHAR(50) PRIMARY KEY,
        "userId" VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        "employeeName" VARCHAR(100),
        "designation" VARCHAR(50),
        "contactNo" VARCHAR(50),
        "fromDate" VARCHAR(50),
        "toDate" VARCHAR(50),
        "totalDays" INTEGER,
        "reason" TEXT,
        "status" VARCHAR(50),
        "currentApproverId" VARCHAR(50),
        "approvalChain" JSONB DEFAULT '[]',
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create activities table
    await client.query(`
      CREATE TABLE IF NOT EXISTS activities (
        "id" VARCHAR(50) PRIMARY KEY,
        "message" TEXT NOT NULL,
        "type" VARCHAR(50) NOT NULL,
        "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create attendance table
    await client.query(`DROP TABLE IF EXISTS attendance CASCADE`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        "id" VARCHAR(50) PRIMARY KEY,
        "userId" VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        "date" VARCHAR(50) NOT NULL,
        "meetingType" VARCHAR(50) NOT NULL,
        "status" VARCHAR(50) NOT NULL,
        "markedById" VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
        "markedByName" VARCHAR(100),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("userId", "date", "meetingType")
      )
    `);

    // Seed default users if empty or update existing on startup
    console.log('[DB] Seeding default workspace users...');

    // Remove legacy placeholder/fake users that are no longer part of the real team
    const legacyUserIds = ['usr-admin', 'usr-mgr-1', 'usr-mgr-2', 'usr-emp-1', 'usr-emp-2', 'usr-emp-3'];
    for (const legacyId of legacyUserIds) {
      await client.query(`DELETE FROM users WHERE id = $1`, [legacyId]);
    }
    // Remove legacy placeholder tasks linked to fake users
    const legacyTaskIds = ['tsk-101', 'tsk-102', 'tsk-103', 'tsk-104'];
    for (const legacyId of legacyTaskIds) {
      await client.query(`DELETE FROM tasks WHERE id = $1`, [legacyId]);
    }

    const defaultUsers = [

      // CO-FOUNDERS & C-Level
      { id: "usr-sambhav", username: "sambhav", password: "sambhav123", fullname: "Sambhav Kaushik Singh (CO - Founder & Chief Executive Officer)", role: "Admin", reportingManagerId: "none", status: "Active", availabilityStatus: "Active", gmail: "sambhavceo25@gmail.com", phone: "7527910223", domain: "Other", aadhar: "645713250752" },
      { id: "usr-shivangi", username: "shivangi", password: "shivangi123", fullname: "Shivangi Bathyal (CO- Founder & Chief Operating Officer)", role: "Admin", reportingManagerId: "none", status: "Active", availabilityStatus: "Active", gmail: "shivangicoo25@gmail.com", phone: "7526920225", domain: "Other", aadhar: "396680523862" },
      { id: "usr-shakcham", username: "shakcham", password: "shakcham123", fullname: "Shakcham Kaushik Singh (Co - Founder & Chief Marketing Officer)", role: "Admin", reportingManagerId: "none", status: "Active", availabilityStatus: "Active", gmail: "shakchamcmo25@gmail.com", phone: "6290191578", domain: "Marketing", aadhar: "697836655001" },
      
      // Tech Heads & Tech Team
      { id: "usr-vibha", username: "vibha", password: "vibha123", fullname: "Vibha Rajput (Chief Technical Officer)", role: "Admin", reportingManagerId: "usr-sambhav", status: "Active", availabilityStatus: "Active", gmail: "vibharajput2004@gmail.com", phone: "7827472924", domain: "Tech", aadhar: "536302716909" },
      { id: "usr-rashika", username: "rashika", password: "rashika123", fullname: "Rashika Poonia (Head of Technology)", role: "Manager", reportingManagerId: "usr-vibha", status: "Active", availabilityStatus: "Active", gmail: "pooniarashika5@gmail.com", phone: "7988766566", domain: "Tech", aadhar: "919766258868" },
      { id: "usr-amit", username: "amit", password: "amit123", fullname: "Amit Rai (Android developer)", role: "Software Developer", reportingManagerId: "usr-rashika", status: "Active", availabilityStatus: "Active", gmail: "amitraics06@gmail.com", phone: "8826233540", domain: "Tech", aadhar: "543336197283" },
      { id: "usr-naina", username: "naina", password: "naina123", fullname: "Naina (Full Stack Engineer)", role: "Software Developer", reportingManagerId: "usr-rashika", status: "Active", availabilityStatus: "Active", gmail: "nainahooda2106@gmail.com", phone: "9817512192", domain: "Tech", aadhar: "398626983045" },
      { id: "usr-aryan", username: "aryan", password: "aryan123", fullname: "Aryan (System support Engineer)", role: "Software Developer", reportingManagerId: "usr-rashika", status: "Active", availabilityStatus: "Active", gmail: "aryanrao8670@gmail.com", phone: "8307847393", domain: "Tech", aadhar: "407917734100" },
      { id: "usr-tanveer", username: "tanveer", password: "tanveer123", fullname: "Tanveer Dhindsa (AI & Full stack Engineer)", role: "Software Developer", reportingManagerId: "usr-rashika", status: "Active", availabilityStatus: "Active", gmail: "tanveer0713@gmail.com", phone: "9041990211", domain: "Tech", aadhar: "827367367601" },
      { id: "usr-saksham", username: "saksham", password: "saksham123", fullname: "Saksham (Data Analytics)", role: "Software Developer", reportingManagerId: "usr-rashika", status: "Active", availabilityStatus: "Active", gmail: "jainsaksham286@gmail.com", phone: "8330954134", domain: "Tech", aadhar: "280887258140" },

      // Research
      { id: "usr-rikhil", username: "rikhil", password: "rikhil123", fullname: "Rikhil Singh (Chief Research Officer)", role: "Admin", reportingManagerId: "usr-sambhav", status: "Active", availabilityStatus: "Active", gmail: "rikhil.medastrax@gmail.com", phone: "9083008600", domain: "R&D", aadhar: "791236576114" },

      // Finance
      { id: "usr-vivek", username: "vivek", password: "vivek123", fullname: "Vivek (Chief Financial Officer)", role: "Manager", reportingManagerId: "usr-sambhav", status: "Active", availabilityStatus: "Active", gmail: "vivek.finance@gmail.com", phone: "N/A", domain: "Finance", aadhar: "N/A" },

      // Graphics
      { id: "usr-spandan", username: "spandan", password: "spandan123", fullname: "Spandan (Head of Graphic Designing)", role: "Manager", reportingManagerId: "usr-sambhav", status: "Active", availabilityStatus: "Active", gmail: "sarkar1980sumitra@gmail.com", phone: "8100080568", domain: "Graphic Designing", aadhar: "950768361022" },

      // Marketing
      { id: "usr-parneet", username: "parneet", password: "parneet123", fullname: "Parneet Kaur (Director General of Marketing)", role: "Team Lead", reportingManagerId: "usr-sambhav", status: "Active", availabilityStatus: "Active", gmail: "parneetkaur21009353@cumail.in", phone: "8054871267", domain: "Marketing", aadhar: "661128889286" },
      { id: "usr-prabhroop", username: "prabhroop", password: "prabhroop123", fullname: "Prabhroop Kaur (Senior Marketing Manager)", role: "Manager", reportingManagerId: "usr-parneet", status: "Active", availabilityStatus: "Active", gmail: "prabhroopkaur21@gmail.com", phone: "9988710469", domain: "Marketing", aadhar: "530227341023" },
      { id: "usr-mahakpreet", username: "mahakpreet", password: "mahakpreet123", fullname: "Mahakpreet Kaur (Marketing Manager)", role: "Team Lead", reportingManagerId: "usr-parneet", status: "Active", availabilityStatus: "Active", gmail: "mahak170905@gmail.com", phone: "9779937381", domain: "Marketing", aadhar: "386504010824" },
      { id: "usr-rudrakshi", username: "rudrakshi", password: "rudrakshi123", fullname: "Rudrakshi (MSE (Team Lead))", role: "Team Lead", reportingManagerId: "usr-mahakpreet", status: "Active", availabilityStatus: "Active", gmail: "rajputrudrakshi86@gmail.com", phone: "8847067953", domain: "Marketing", aadhar: "675041024864" },
      { id: "usr-dakshi", username: "dakshi", password: "dakshi123", fullname: "Dakshi (MSE (Team Lead))", role: "Team Lead", reportingManagerId: "usr-mahakpreet", status: "Active", availabilityStatus: "Active", gmail: "dakshianand123@gmail.com", phone: "9779060285", domain: "Marketing", aadhar: "408425021956" },
      { id: "usr-kiranveer", username: "kiranveer", password: "kiranveer123", fullname: "Kiranveer Kaur (MSE (Team Lead))", role: "Team Lead", reportingManagerId: "usr-mahakpreet", status: "Active", availabilityStatus: "Active", gmail: "veerdhillon0070@gmail.com", phone: "7717580012", domain: "Marketing", aadhar: "345596162781" },
      { id: "usr-mehakdeep", username: "mehakdeep", password: "mehakdeep123", fullname: "Mehakdeep (MSE (Team Lead))", role: "Team Lead", reportingManagerId: "usr-mahakpreet", status: "Active", availabilityStatus: "Active", gmail: "mehakgrewalmehak@gmail.com", phone: "7696546005", domain: "Marketing", aadhar: "918957796517" },
      { id: "usr-aditi", username: "aditi", password: "aditi123", fullname: "Aditi (MSE)", role: "Employee", reportingManagerId: "usr-dakshi", status: "Active", availabilityStatus: "Active", gmail: "puniaaditi5@gmail.com", phone: "7898659651", domain: "Marketing", aadhar: "801434040805" },
      { id: "usr-harmandeep", username: "harmandeep", password: "harmandeep123", fullname: "Harmandeep Kaur (MSE)", role: "Employee", reportingManagerId: "usr-rudrakshi", status: "Active", availabilityStatus: "Active", gmail: "harmandeepdhesa2306@gmail.com", phone: "8146030993", domain: "Marketing", aadhar: "302243524648" }
    ];

    for (const u of defaultUsers) {
      await client.query(
        `INSERT INTO users (id, username, password, fullname, role, "reportingManagerId", status, "availabilityStatus", gmail, phone, domain, aadhar) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (username) DO UPDATE SET
           id = EXCLUDED.id,
           password = EXCLUDED.password,
           fullname = EXCLUDED.fullname,
           role = EXCLUDED.role,
           "reportingManagerId" = EXCLUDED."reportingManagerId",
           status = EXCLUDED.status,
           "availabilityStatus" = EXCLUDED."availabilityStatus",
           gmail = EXCLUDED.gmail,
           phone = EXCLUDED.phone,
           domain = EXCLUDED.domain,
           aadhar = EXCLUDED.aadhar`,
        [u.id, u.username, u.password, u.fullname, u.role, u.reportingManagerId, u.status, u.availabilityStatus, u.gmail, u.phone, u.domain, u.aadhar]
      );
    }

    // No default task seeding — tasks are created by real users only

    // Seed default activities if empty
    const activitiesCount = await client.query('SELECT COUNT(*) FROM activities');
    if (parseInt(activitiesCount.rows[0].count) === 0) {
      console.log('[DB] Seeding default activities...');
      const defaultActivities = [
        { id: "act-1", timestamp: "2026-06-25T10:00:00.000Z", type: "system", message: "MedAstraX portal database initialized successfully." },
        { id: "act-2", timestamp: "2026-06-25T11:30:00.000Z", type: "success", message: "Task 'Onboard Internship Candidates' marked as Completed by Rohan Das." }
      ];

      for (const a of defaultActivities) {
        await client.query(
          `INSERT INTO activities (id, message, type, timestamp) VALUES ($1, $2, $3, $4)`,
          [a.id, a.message, a.type, a.timestamp]
        );
      }
    }

    // Create meetings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(100) NOT NULL,
        "time" VARCHAR(10) NOT NULL,
        participants JSONB DEFAULT '[]',
        "isFixed" BOOLEAN DEFAULT false,
        "roomCode" VARCHAR(50) NOT NULL,
        description TEXT DEFAULT ''
      )
    `);

    // Ensure description column exists for existing tables
    await client.query(`
      ALTER TABLE meetings ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
    `);

    // Seed default meetings if empty
    const meetingsCount = await client.query('SELECT COUNT(*) FROM meetings');
    if (parseInt(meetingsCount.rows[0].count) === 0) {
      console.log('[DB] Seeding default meetings...');
      const techTeamParticipants = ["usr-vibha", "usr-rashika", "usr-amit", "usr-naina", "usr-aryan", "usr-tanveer", "usr-saksham"];
      const marketingTeamParticipants = ["usr-prabhroop", "usr-mahakpreet", "usr-rudrakshi", "usr-dakshi", "usr-kiranveer", "usr-mehakdeep", "usr-aditi", "usr-harmandeep"];
      const foundersParticipants = ["usr-shakcham", "usr-sambhav", "usr-shivangi"];
      
      await client.query(
        `INSERT INTO meetings (id, title, "time", participants, "isFixed", "roomCode") VALUES
         ($1, $2, $3, $4, $5, $6),
         ($7, $8, $9, $10, $11, $12),
         ($13, $14, $15, $16, $17, $18),
         ($19, $20, $21, $22, $23, $24)`,
        [
          'mtg-daily', 'Tech Daily Meeting', '17:30', JSON.stringify(techTeamParticipants), true, 'tech-daily-meeting',
          'mtg-eod', 'Tech EOD Meeting', '20:30', JSON.stringify(techTeamParticipants), true, 'tech-eod-meeting',
          'mtg-mkt-eod', 'Marketing EOD Meeting', '20:00', JSON.stringify(marketingTeamParticipants), true, 'marketing-eod-meeting',
          'mtg-founders-eod', 'Founders & Data EOD Meeting', '18:00', JSON.stringify(foundersParticipants), true, 'founders-eod-meeting'
        ]
      );
    }

    client.release();
    console.log('[DB] Database migration and seeding checks complete');
  } catch (err) {
    console.error('[DB] Schema initialization error:', err.stack);
  }
}

// REST APIs
// USERS
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const u = req.body;
    await pool.query(
      `INSERT INTO users (id, username, password, fullname, role, "reportingManagerId", status, "availabilityStatus", gmail, phone, domain, aadhar) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [u.id, u.username, u.password, u.fullname, u.role, u.reportingManagerId, u.status || 'Active', u.availabilityStatus || 'Active', u.gmail, u.phone, u.domain, u.aadhar]
    );
    res.status(201).json(u);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const u = req.body;
    await pool.query(
      `UPDATE users SET 
        fullname = $1, 
        role = $2, 
        "reportingManagerId" = $3, 
        status = $4, 
        "availabilityStatus" = $5, 
        gmail = $6, 
        phone = $7, 
        domain = $8, 
        aadhar = $9
       WHERE id = $10`,
      [u.fullname, u.role, u.reportingManagerId, u.status, u.availabilityStatus, u.gmail, u.phone, u.domain, u.aadhar, id]
    );
    res.json({ message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TASKS
app.get('/api/tasks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tasks');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const t = req.body;
    await pool.query(
      `INSERT INTO tasks (id, title, description, "assigneeId", priority, "dueDate", status, "assignedById", "referenceLink", "deliverableLink", feedback, comments) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [t.id, t.title, t.description, t.assigneeId, t.priority, t.dueDate, t.status, t.assignedById, t.referenceLink, t.deliverableLink, t.feedback, JSON.stringify(t.comments || [])]
    );
    res.status(201).json(t);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const t = req.body;
    await pool.query(
      `UPDATE tasks SET 
        title = $1, 
        description = $2, 
        "assigneeId" = $3, 
        priority = $4, 
        "dueDate" = $5, 
        status = $6, 
        "assignedById" = $7, 
        "referenceLink" = $8, 
        "deliverableLink" = $9, 
        feedback = $10, 
        comments = $11
       WHERE id = $12`,
      [t.title, t.description, t.assigneeId, t.priority, t.dueDate, t.status, t.assignedById, t.referenceLink, t.deliverableLink, t.feedback, JSON.stringify(t.comments || []), id]
    );
    res.json({ message: 'Task updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LEAVES
app.get('/api/leaves', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM leaves');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/leaves', async (req, res) => {
  try {
    const lv = req.body;
    await pool.query(
      `INSERT INTO leaves (id, "userId", "employeeName", designation, "contactNo", "fromDate", "toDate", "totalDays", reason, status, "currentApproverId", "approvalChain") 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [lv.id, lv.userId, lv.employeeName, lv.designation, lv.contactNo, lv.fromDate, lv.toDate, lv.totalDays, lv.reason, lv.status, lv.currentApproverId, JSON.stringify(lv.approvalChain || [])]
    );
    res.status(201).json(lv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/leaves/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const lv = req.body;
    await pool.query(
      `UPDATE leaves SET 
        status = $1, 
        "currentApproverId" = $2, 
        "approvalChain" = $3
       WHERE id = $4`,
      [lv.status, lv.currentApproverId, JSON.stringify(lv.approvalChain || []), id]
    );
    res.json({ message: 'Leave request updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ACTIVITIES
app.get('/api/activities', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM activities ORDER BY timestamp DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/activities', async (req, res) => {
  try {
    const act = req.body;
    await pool.query(
      `INSERT INTO activities (id, message, type, timestamp) VALUES ($1, $2, $3, $4)`,
      [act.id, act.message, act.type, act.timestamp || new Date().toISOString()]
    );
    res.status(201).json(act);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MEETINGS
app.get('/api/meetings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM meetings ORDER BY "isFixed" DESC, title');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/meetings', async (req, res) => {
  try {
    const m = req.body;
    await pool.query(
      `INSERT INTO meetings (id, title, "time", participants, "isFixed", "roomCode", description) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [m.id, m.title, m.time, JSON.stringify(m.participants || []), m.isFixed || false, m.roomCode, m.description || '']
    );
    res.status(201).json(m);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/meetings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const m = req.body;
    await pool.query(
      `UPDATE meetings SET title = $1, "time" = $2, participants = $3, "roomCode" = $4, description = $5 WHERE id = $6`,
      [m.title, m.time, JSON.stringify(m.participants || []), m.roomCode, m.description || '', id]
    );
    res.json({ message: 'Meeting updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/meetings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM meetings WHERE id = $1', [id]);
    res.json({ message: 'Meeting deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ATTENDANCE
app.get('/api/attendance', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM attendance');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendance', async (req, res) => {
  try {
    const att = req.body;
    await pool.query(
      `INSERT INTO attendance ("id", "userId", "date", "meetingType", "status", "markedById", "markedByName") 
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT ("userId", "date", "meetingType") 
       DO UPDATE SET "status" = EXCLUDED."status", "markedById" = EXCLUDED."markedById", "markedByName" = EXCLUDED."markedByName"`,
      [att.id, att.userId, att.date, att.meetingType, att.status, att.markedById, att.markedByName]
    );
    res.status(201).json(att);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WebRTC Signaling over Server-Sent Events (SSE)
let videoClients = []; // array of { userId, username, res, room }

app.get('/api/video/events', (req, res) => {
  const { userId, username } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Remove any stale client for this user ID
  videoClients = videoClients.filter(c => c.userId !== userId);

  const client = { userId, username, res, room: null };
  videoClients.push(client);

  req.on('close', () => {
    // If the client had joined a room, notify others
    if (client.room) {
      broadcastToRoom(client.room, client.userId, {
        type: 'user-left',
        userId: client.userId
      });
    }
    videoClients = videoClients.filter(c => c.userId !== userId);
  });
});

app.post('/api/video/join', (req, res) => {
  const { userId, username, room } = req.body;
  const client = videoClients.find(c => c.userId === userId);
  if (client) {
    client.room = room;
    client.username = username;
    
    // Notify all other clients in the same room that a new user joined
    broadcastToRoom(room, userId, {
      type: 'user-joined',
      userId,
      username
    });
    
    // Send the list of existing users currently in the room back to the joiner
    const existingUsers = videoClients
      .filter(c => c.room === room && c.userId !== userId)
      .map(c => ({ userId: c.userId, username: c.username }));
      
    res.json({ existingUsers });
  } else {
    res.status(404).json({ error: "Client event stream not found." });
  }
});

app.post('/api/video/signal', (req, res) => {
  const { senderId, targetId, type, data } = req.body;
  const target = videoClients.find(c => c.userId === targetId);
  if (target) {
    sendSseEvent(target.res, {
      type,
      senderId,
      data
    });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Target peer offline" });
  }
});

app.post('/api/video/leave', (req, res) => {
  const { userId, room } = req.body;
  const client = videoClients.find(c => c.userId === userId);
  if (client) {
    client.room = null;
    broadcastToRoom(room, userId, {
      type: 'user-left',
      userId
    });
  }
  res.json({ success: true });
});

function broadcastToRoom(room, senderId, eventData) {
  videoClients.forEach(c => {
    if (c.room === room && c.userId !== senderId) {
      sendSseEvent(c.res, eventData);
    }
  });
}

function sendSseEvent(res, eventData) {
  res.write(`data: ${JSON.stringify(eventData)}\n\n`);
}

// Route everything else to index.html (fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize server
app.listen(port, async () => {
  await initDb();
  console.log(`[Server] Running on http://localhost:${port}`);
});
