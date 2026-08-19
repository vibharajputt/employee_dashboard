const express = require('express');
const { Pool, Client } = require('pg');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
require('dotenv').config();
const authEmail = require('./auth-email');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
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

const fs = require('fs');
let isUsingMockDb = false;

const isCloudDb = process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1');

// Auto-check and create database if missing (Local only)
async function ensureDatabaseExists() {
  if (!process.env.DATABASE_URL || isCloudDb) {
    return;
  }
  try {
    const defaultConnectionString = process.env.DATABASE_URL.replace(/\/medastrax(?:\?.*)?$/, '/postgres');
    const client = new Client({ connectionString: defaultConnectionString });
    await client.connect();
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'medastrax'");
    if (res.rowCount === 0) {
      console.log("[DB] Database 'medastrax' does not exist. Creating it...");
      await client.query("CREATE DATABASE medastrax");
      console.log("[DB] Database 'medastrax' created successfully.");
    } else {
      console.log("[DB] Database 'medastrax' verified.");
    }
    await client.end();
  } catch (err) {
    console.log("[DB] Database verification notice:", err.message);
  }
}


class MockClient {
  async query(text, values) {
    const dbData = loadMockDb();
    const queryLower = text.toLowerCase().trim();

    if (queryLower.includes('select count(*)')) {
      let tableName = '';
      if (queryLower.includes('from activities')) tableName = 'activities';
      else if (queryLower.includes('from meetings')) tableName = 'meetings';
      else if (queryLower.includes('from users')) tableName = 'users';

      const count = dbData[tableName] ? dbData[tableName].length : 0;
      return { rows: [{ count: count.toString() }] };
    }

    if (queryLower.startsWith('select')) {
      let tableName = '';
      if (queryLower.includes('from users')) tableName = 'users';
      else if (queryLower.includes('from tasks')) tableName = 'tasks';
      else if (queryLower.includes('from leaves')) tableName = 'leaves';
      else if (queryLower.includes('from activities')) tableName = 'activities';
      else if (queryLower.includes('from meeting_history')) tableName = 'meeting_history';
      else if (queryLower.includes('from meetings')) tableName = 'meetings';
      else if (queryLower.includes('from attendance')) tableName = 'attendance';
      else if (queryLower.includes('from groups')) tableName = 'groups';
      else if (queryLower.includes('from user_chat_preferences')) tableName = 'user_chat_preferences';
      else if (queryLower.includes('from messages')) tableName = 'messages';

      if (!tableName || !dbData[tableName]) {
        return { rows: [] };
      }

      let rows = [...dbData[tableName]];

      if (tableName === 'leaves' && queryLower.includes("status = 'approved'")) {
        rows = rows.filter(r => r.status === 'Approved');
      }

      if (tableName === 'user_chat_preferences' && queryLower.includes('"userid" = $1')) {
        const userId = values[0];
        rows = rows.filter(r => r.userId === userId);
      }

      if (tableName === 'activities') {
        rows.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      } else if (tableName === 'meetings') {
        rows.sort((a, b) => {
          if (b.isFixed !== a.isFixed) {
            return (b.isFixed ? 1 : 0) - (a.isFixed ? 1 : 0);
          }
          return (a.title || '').localeCompare(b.title || '');
        });
      } else if (tableName === 'meeting_history') {
        rows.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
      } else if (tableName === 'groups') {
        rows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      } else if (tableName === 'messages') {
        rows.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      }

      return { rows };
    }

    if (queryLower.startsWith('insert into users')) {
      const u = {
        id: values[0],
        username: values[1],
        password: values[2],
        fullname: values[3],
        role: values[4],
        reportingManagerId: values[5],
        status: values[6],
        availabilityStatus: values[7],
        gmail: values[8],
        phone: values[9],
        domain: values[10],
        aadhar: values[11],
        workEmail: values[12]
      };

      const idx = dbData.users.findIndex(x => x.username.toLowerCase() === u.username.toLowerCase());
      if (idx !== -1) {
        dbData.users[idx] = { ...dbData.users[idx], ...u };
      } else {
        dbData.users.push(u);
      }
      saveMockDb(dbData);
      return { rows: [u] };
    }

    if (queryLower.startsWith('insert into tasks')) {
      const t = {
        id: values[0],
        title: values[1],
        description: values[2],
        assigneeId: values[3],
        priority: values[4],
        dueDate: values[5],
        status: values[6],
        assignedById: values[7],
        referenceLink: values[8],
        deliverableLink: values[9],
        feedback: values[10],
        comments: typeof values[11] === 'string' ? JSON.parse(values[11]) : (values[11] || [])
      };
      dbData.tasks.push(t);
      saveMockDb(dbData);
      return { rows: [t] };
    }

    if (queryLower.startsWith('insert into leaves')) {
      const l = {
        id: values[0],
        userId: values[1],
        employeeName: values[2],
        designation: values[3],
        contactNo: values[4],
        fromDate: values[5],
        toDate: values[6],
        totalDays: values[7],
        reason: values[8],
        status: values[9],
        currentApproverId: values[10],
        approvalChain: typeof values[11] === 'string' ? JSON.parse(values[11]) : (values[11] || []),
        createdAt: new Date().toISOString()
      };
      dbData.leaves.push(l);
      saveMockDb(dbData);
      return { rows: [l] };
    }

    if (queryLower.startsWith('insert into activities')) {
      const a = {
        id: values[0],
        message: values[1],
        type: values[2],
        timestamp: values[3] || new Date().toISOString()
      };
      dbData.activities.push(a);
      saveMockDb(dbData);
      return { rows: [a] };
    }

    if (queryLower.startsWith('insert into meetings')) {
      const m = {
        id: values[0],
        title: values[1],
        time: values[2],
        participants: typeof values[3] === 'string' ? JSON.parse(values[3]) : (values[3] || []),
        isFixed: values[4] || false,
        roomCode: values[5],
        description: values[6] || '',
        isRecurring: values[7] || false,
        recurrence: typeof values[8] === 'string' ? JSON.parse(values[8]) : (values[8] || {})
      };
      dbData.meetings.push(m);
      saveMockDb(dbData);
      return { rows: [m] };
    }

    if (queryLower.startsWith('insert into meeting_history')) {
      const h = {
        id: values[0],
        userId: values[1],
        title: values[2],
        roomCode: values[3],
        date: values[4],
        time: values[5],
        duration: values[6],
        durationSec: values[7] || 0,
        host: values[8] || 'You',
        hostId: values[9],
        participants: typeof values[10] === 'string' ? JSON.parse(values[10]) : (values[10] || []),
        timestamp: values[11] || new Date().toISOString()
      };
      if (!dbData.meeting_history) dbData.meeting_history = [];
      dbData.meeting_history.unshift(h);
      saveMockDb(dbData);
      return { rows: [h] };
    }

    if (queryLower.startsWith('insert into attendance')) {
      const att = {
        id: values[0],
        userId: values[1],
        date: values[2],
        meetingType: values[3],
        status: values[4],
        markedById: values[5],
        markedByName: values[6],
        createdAt: new Date().toISOString()
      };

      const idx = dbData.attendance.findIndex(x => x.userId === att.userId && x.date === att.date && x.meetingType === att.meetingType);
      if (idx !== -1) {
        dbData.attendance[idx] = { ...dbData.attendance[idx], ...att };
      } else {
        dbData.attendance.push(att);
      }
      saveMockDb(dbData);
      return { rows: [att] };
    }

    if (queryLower.startsWith('insert into groups')) {
      const g = {
        id: values[0],
        name: values[1],
        createdById: values[2],
        members: typeof values[3] === 'string' ? JSON.parse(values[3]) : (values[3] || []),
        createdAt: new Date().toISOString()
      };
      dbData.groups.push(g);
      saveMockDb(dbData);
      return { rows: [g] };
    }

    if (queryLower.startsWith('insert into user_chat_preferences')) {
      if (queryLower.includes('select $1, id, current_timestamp from users')) {
        const userId = values[0];
        for (const u of dbData.users) {
          const prefIdx = dbData.user_chat_preferences.findIndex(x => x.userId === userId && x.chatId === u.id);
          if (prefIdx !== -1) {
            dbData.user_chat_preferences[prefIdx].lastReadTimestamp = new Date().toISOString();
          } else {
            dbData.user_chat_preferences.push({
              userId,
              chatId: u.id,
              isArchived: false,
              isPinned: false,
              lastReadTimestamp: new Date().toISOString()
            });
          }
        }
        saveMockDb(dbData);
        return { rows: [] };
      }

      const userId = values[0];
      const chatId = values[1];
      const val = values[2];

      const prefIdx = dbData.user_chat_preferences.findIndex(x => x.userId === userId && x.chatId === chatId);
      let updatedPref = {};
      if (prefIdx !== -1) {
        updatedPref = dbData.user_chat_preferences[prefIdx];
      } else {
        updatedPref = { userId, chatId, isArchived: false, isPinned: false, lastReadTimestamp: new Date().toISOString() };
        dbData.user_chat_preferences.push(updatedPref);
      }

      if (queryLower.includes('"isarchived"')) {
        updatedPref.isArchived = val;
      } else if (queryLower.includes('"ispinned"')) {
        updatedPref.isPinned = val;
      } else if (queryLower.includes('"lastreadtimestamp"')) {
        updatedPref.lastReadTimestamp = new Date().toISOString();
      }

      saveMockDb(dbData);
      return { rows: [updatedPref] };
    }

    if (queryLower.startsWith('insert into messages')) {
      const msg = {
        id: dbData.messages.length + 1,
        sender: values[0],
        receiver: values[1],
        senderId: values[2],
        receiverId: values[3],
        message: values[4],
        isGroup: values[5] || false,
        readBy: typeof values[6] === 'string' ? JSON.parse(values[6]) : (values[6] || []),
        createdAt: new Date().toISOString()
      };
      dbData.messages.push(msg);
      saveMockDb(dbData);
      return { rows: [msg] };
    }

    if (queryLower.startsWith('update users')) {
      // Password-only update (from /api/auth reset-password & change-password)
      if (queryLower.includes('set "password"')) {
        const pidx = dbData.users.findIndex(x => x.id === values[1]);
        if (pidx !== -1) {
          dbData.users[pidx].password = values[0];
          saveMockDb(dbData);
        }
        return { rows: [] };
      }

      const id = values[10];
      const idx = dbData.users.findIndex(x => x.id === id);
      if (idx !== -1) {
        dbData.users[idx] = {
          ...dbData.users[idx],
          fullname: values[0],
          role: values[1],
          reportingManagerId: values[2],
          status: values[3],
          availabilityStatus: values[4],
          gmail: values[5],
          phone: values[6],
          domain: values[7],
          // Mirror the server's COALESCE guard: null means "keep existing value"
          aadhar: (values[8] === null || values[8] === undefined) ? dbData.users[idx].aadhar : values[8],
          workEmail: (values[9] === null || values[9] === undefined) ? dbData.users[idx].workEmail : values[9]
        };
        saveMockDb(dbData);
      }
      return { rows: [] };
    }

    if (queryLower.startsWith('update tasks')) {
      const id = values[11];
      const idx = dbData.tasks.findIndex(x => x.id === id);
      if (idx !== -1) {
        dbData.tasks[idx] = {
          ...dbData.tasks[idx],
          title: values[0],
          description: values[1],
          assigneeId: values[2],
          priority: values[3],
          dueDate: values[4],
          status: values[5],
          assignedById: values[6],
          referenceLink: values[7],
          deliverableLink: values[8],
          feedback: values[9],
          comments: typeof values[10] === 'string' ? JSON.parse(values[10]) : (values[10] || [])
        };
        saveMockDb(dbData);
      }
      return { rows: [] };
    }

    if (queryLower.startsWith('update leaves')) {
      const id = values[3];
      const idx = dbData.leaves.findIndex(x => x.id === id);
      if (idx !== -1) {
        dbData.leaves[idx] = {
          ...dbData.leaves[idx],
          status: values[0],
          currentApproverId: values[1],
          approvalChain: typeof values[2] === 'string' ? JSON.parse(values[2]) : (values[2] || [])
        };
        saveMockDb(dbData);
      }
      return { rows: [] };
    }

    if (queryLower.startsWith('update meetings')) {
      const id = values[5];
      const idx = dbData.meetings.findIndex(x => x.id === id);
      if (idx !== -1) {
        dbData.meetings[idx] = {
          ...dbData.meetings[idx],
          title: values[0],
          time: values[1],
          participants: typeof values[2] === 'string' ? JSON.parse(values[2]) : (values[2] || []),
          roomCode: values[3],
          description: values[4]
        };
        saveMockDb(dbData);
      }
      return { rows: [] };
    }

    if (queryLower.startsWith('update messages')) {
      const id = values[1];
      const idx = dbData.messages.findIndex(x => x.id == id);
      if (idx !== -1) {
        dbData.messages[idx].readBy = typeof values[0] === 'string' ? JSON.parse(values[0]) : (values[0] || []);
        saveMockDb(dbData);
      }
      return { rows: [] };
    }

    if (queryLower.startsWith('delete from users')) {
      const id = values[0];
      dbData.users = dbData.users.filter(x => x.id !== id);
      saveMockDb(dbData);
      return { rows: [] };
    }

    if (queryLower.startsWith('delete from tasks')) {
      const id = values[0];
      dbData.tasks = dbData.tasks.filter(x => x.id !== id);
      saveMockDb(dbData);
      return { rows: [] };
    }

    if (queryLower.startsWith('delete from meetings')) {
      const id = values[0];
      dbData.meetings = dbData.meetings.filter(x => x.id !== id);
      saveMockDb(dbData);
      return { rows: [] };
    }

    return { rows: [] };
  }

  release() { }
}

class MockPool {
  async connect() {
    return new MockClient();
  }
  async query(text, values) {
    const client = new MockClient();
    return client.query(text, values);
  }
}

const MOCK_DB_FILE = path.join(__dirname, 'mock_db.json');

function loadMockDb() {
  if (fs.existsSync(MOCK_DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(MOCK_DB_FILE, 'utf8'));
    } catch (e) {
      console.error("Error reading mock_db.json, using empty DB", e);
    }
  }
  return {
    users: [],
    tasks: [],
    leaves: [],
    activities: [],
    messages: [],
    groups: [],
    user_chat_preferences: [],
    attendance: [],
    meetings: []
  };
}

function saveMockDb(data) {
  try {
    fs.writeFileSync(MOCK_DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error("Error writing to mock_db.json", e);
  }
}

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isCloudDb ? { rejectUnauthorized: false } : false,
  // Neon closes idle connections; keep the pool small and recycle promptly so a
  // dropped socket surfaces as a retryable error instead of a hung request.
  max: 5,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 10000,
  keepAlive: true
});

// An idle client erroring out (Neon dropping the socket) must NOT crash the process.
// Without this handler Node treats it as an unhandled 'error' event.
pgPool.on('error', (err) => {
  console.warn('[DB] Idle client error (pool will recover):', err.message);
});

// The Mock DB is a LOCAL DEVELOPMENT convenience only.
// In production it is actively dangerous: mock_db.json is gitignored, so the mock
// store is EMPTY on the server. If a single transient Neon error flipped the app
// over to it, every endpoint would start returning [] — logins fail, lists render
// blank — while the app still looked healthy. Never enable it against a cloud DB.
const MOCK_DB_ENABLED = !isCloudDb && process.env.NODE_ENV !== 'production';

function shouldFallback(err) {
  if (!MOCK_DB_ENABLED) return false;
  isUsingMockDb = true;
  console.warn('[DB] PostgreSQL unavailable — using local Mock DB fallback.', err.message);
  return true;
}

// Transient network/socket errors are worth one immediate retry: Neon frequently
// closes pooled connections, and the first query after that always fails.
function isTransient(err) {
  const code = err && err.code;
  return code === 'ECONNRESET' || code === 'EPIPE' || code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' || code === '57P01' || code === '08006' ||
    code === '08003' || code === 'XX000' ||
    /terminat|socket|timeout|connection/i.test((err && err.message) || '');
}

const pool = {
  async connect() {
    if (isUsingMockDb && MOCK_DB_ENABLED) return new MockClient();
    try {
      return await pgPool.connect();
    } catch (err) {
      if (isTransient(err)) {
        try { return await pgPool.connect(); } catch (retryErr) { err = retryErr; }
      }
      if (shouldFallback(err)) return new MockClient();
      console.error('[DB] PostgreSQL connection failed:', err.message);
      throw err;
    }
  },
  async query(text, values) {
    if (isUsingMockDb && MOCK_DB_ENABLED) return new MockClient().query(text, values);
    try {
      return await pgPool.query(text, values);
    } catch (err) {
      if (isTransient(err)) {
        try { return await pgPool.query(text, values); } catch (retryErr) { err = retryErr; }
      }
      if (shouldFallback(err)) return new MockClient().query(text, values);
      // Fail loudly instead of silently serving empty data.
      console.error('[DB] Query failed:', err.message);
      throw err;
    }
  }
};

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
        "workEmail" VARCHAR(100),
        "phone" VARCHAR(50),
        "domain" VARCHAR(100),
        "aadhar" VARCHAR(50)
      )
    `);

    // Restart-safe: ensure workEmail exists on databases created before this column was added.
    // Without this, GET /api/users (which selects "workEmail") would crash on a fresh DB.
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS "workEmail" VARCHAR(100)`);

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

    // Create messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        "id" SERIAL PRIMARY KEY,
        "sender" VARCHAR(100) NOT NULL,
        "receiver" VARCHAR(100) NOT NULL,
        "senderId" VARCHAR(50),
        "receiverId" VARCHAR(50),
        "message" TEXT NOT NULL,
        "isGroup" BOOLEAN DEFAULT false,
        "readBy" JSONB DEFAULT '[]',
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS "senderId" VARCHAR(50);`);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS "receiverId" VARCHAR(50);`);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS "isGroup" BOOLEAN DEFAULT false;`);
    await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS "readBy" JSONB DEFAULT '[]';`);

    // Create groups table
    await client.query(`
      CREATE TABLE IF NOT EXISTS groups (
        "id" VARCHAR(50) PRIMARY KEY,
        "name" VARCHAR(100) NOT NULL,
        "createdById" VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        "members" JSONB DEFAULT '[]',
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create user_chat_preferences table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_chat_preferences (
        "id" SERIAL PRIMARY KEY,
        "userId" VARCHAR(50) NOT NULL,
        "chatId" VARCHAR(50) NOT NULL,
        "isArchived" BOOLEAN DEFAULT false,
        "isPinned" BOOLEAN DEFAULT false,
        "lastReadTimestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("userId", "chatId")
      )
    `);
    await client.query(`ALTER TABLE user_chat_preferences ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN DEFAULT false;`);

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

    // Seed default users if empty or update existing on startup from secure seed_data.json
    console.log('[DB] Checking workspace user seeds...');

    const SEED_DATA_FILE = path.join(__dirname, 'seed_data.json');
    let seedUsers = [];

    if (fs.existsSync(SEED_DATA_FILE)) {
      try {
        const seedContent = JSON.parse(fs.readFileSync(SEED_DATA_FILE, 'utf8'));
        if (seedContent && Array.isArray(seedContent.users)) {
          seedUsers = seedContent.users;
        }
      } catch (e) {
        console.warn('[DB] Could not parse seed_data.json:', e.message);
      }
    }

    if (seedUsers.length > 0) {
      console.log(`[DB] Seeding ${seedUsers.length} users from seed_data.json...`);
      for (const u of seedUsers) {
        await client.query(
          `INSERT INTO users (id, username, password, fullname, role, "reportingManagerId", status, "availabilityStatus", gmail, phone, domain, aadhar, "workEmail") 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
             aadhar = EXCLUDED.aadhar,
             "workEmail" = COALESCE(EXCLUDED."workEmail", users."workEmail")`,
          [u.id, u.username, u.password, u.fullname, u.role, u.reportingManagerId || 'none', u.status || 'Active', u.availabilityStatus || 'Active', u.gmail || '', u.phone || '', u.domain || 'General', u.aadhar || '', u.workEmail || (u.username || '').toLowerCase() + '@medastrax.com']
        );
      }
    } else {
      const userCountRes = await client.query('SELECT COUNT(*) FROM users');
      if (parseInt(userCountRes.rows[0].count) === 0) {
        console.log('[DB] No users found. Creating initial workspace Admin...');
        await client.query(
          `INSERT INTO users (id, username, password, fullname, role, "reportingManagerId", status, "availabilityStatus", gmail, phone, domain, aadhar, "workEmail") 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (username) DO NOTHING`,
          ['usr-admin', 'admin', 'admin123', 'Workspace Administrator', 'Admin', 'none', 'Active', 'Active', 'admin@medastrax.com', '9999999999', 'Tech', '', 'admin@medastrax.com']
        );
      }
    }


    // Backfill workEmail for any user missing it (used as OTP / password-email target)
    await client.query(`UPDATE users SET "workEmail" = LOWER(username) || '@medastrax.com' WHERE "workEmail" IS NULL OR "workEmail" = ''`);

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

    // Ensure description, isRecurring and recurrence columns exist for existing tables
    await client.query(`
      ALTER TABLE meetings ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
      ALTER TABLE meetings ADD COLUMN IF NOT EXISTS "isRecurring" BOOLEAN DEFAULT false;
      ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recurrence JSONB DEFAULT '{}';
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

// AUTH routes (OTP login, password reset, change-password)
// Must be registered before the catch-all * route
app.use('/api/auth', authEmail(pool));

// REST APIs
// USERS
app.get('/api/users', async (req, res) => {
  try {
    // password and aadhar are excluded — sensitive data must be fetched via /api/users/:id/sensitive
    const result = await pool.query(
      `SELECT id, username, fullname, role, "reportingManagerId", status,
              "availabilityStatus", gmail, "workEmail", phone, domain
       FROM users`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TODO: add auth middleware — currently unprotected, restrict before public launch
app.get('/api/users/:id/sensitive', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT aadhar FROM users WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const u = req.body;
    await pool.query(
      `INSERT INTO users (id, username, password, fullname, role, "reportingManagerId", status, "availabilityStatus", gmail, phone, domain, aadhar, "workEmail") 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [u.id, u.username, u.password, u.fullname, u.role, u.reportingManagerId, u.status || 'Active', u.availabilityStatus || 'Active', u.gmail, u.phone, u.domain, u.aadhar, u.workEmail || (u.username || '').toLowerCase() + '@medastrax.com']
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
        aadhar = COALESCE($9, aadhar),
        "workEmail" = COALESCE($10, "workEmail")
       WHERE id = $11`,
      [
        u.fullname, u.role, u.reportingManagerId, u.status, u.availabilityStatus,
        u.gmail, u.phone, u.domain,
        // COALESCE guard: GET /api/users no longer returns aadhar, so callers that
        // update an unrelated field (e.g. duty status) send it as undefined.
        // Sending null keeps the stored value instead of wiping it.
        (u.aadhar === undefined || u.aadhar === null || u.aadhar === '') ? null : u.aadhar,
        (u.workEmail === undefined || u.workEmail === null || u.workEmail === '') ? null : u.workEmail,
        id
      ]
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
      `INSERT INTO meetings (id, title, "time", participants, "isFixed", "roomCode", description, "isRecurring", recurrence) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        m.id,
        m.title,
        m.time,
        JSON.stringify(m.participants || []),
        m.isFixed || false,
        m.roomCode,
        m.description || '',
        m.isRecurring || false,
        JSON.stringify(m.recurrence || {})
      ]
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
      `UPDATE meetings SET title = $1, "time" = $2, participants = $3, "roomCode" = $4, description = $5, "isRecurring" = $6, recurrence = $7 WHERE id = $8`,
      [
        m.title,
        m.time,
        JSON.stringify(m.participants || []),
        m.roomCode,
        m.description || '',
        m.isRecurring || false,
        JSON.stringify(m.recurrence || {}),
        id
      ]
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

// MEETING HISTORY
app.get('/api/meeting-history', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM meeting_history ORDER BY timestamp DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/meeting-history', async (req, res) => {
  try {
    const h = req.body;
    await pool.query(
      `INSERT INTO meeting_history (id, "userId", title, "roomCode", "date", "time", duration, "durationSec", host, "hostId", participants, timestamp) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [h.id, h.userId, h.title, h.roomCode, h.date, h.time, h.duration, h.durationSec || 0, h.host || 'You', h.hostId, JSON.stringify(h.participants || []), h.timestamp || new Date().toISOString()]
    );
    res.status(201).json(h);
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

    io.emit("employeeStatusChanged", { userId, status: 'in_meeting' });
    res.json({ existingUsers });
  } else {
    res.status(404).json({ error: "Client event stream not found." });
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
  io.emit("employeeStatusChanged", { userId, status: 'free' });
  res.json({ success: true });
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

// --------------------------------------------------
// Live Employee Status API
// --------------------------------------------------
app.get('/api/employees/status', async (req, res) => {
  try {
    const usersRes = await pool.query('SELECT id, fullname, username FROM users');
    const users = usersRes.rows;

    // Get active video users
    const videoUserIds = new Set(
      videoClients.filter(c => c.room !== null).map(c => c.userId)
    );

    // Get today's date in YYYY-MM-DD
    const todayStr = new Date().toISOString().split('T')[0];

    // Fetch approved leaves
    const leavesRes = await pool.query(
      `SELECT * FROM leaves WHERE status = 'Approved'`
    );
    const approvedLeaves = leavesRes.rows;

    const statusMap = {};
    for (const u of users) {
      if (videoUserIds.has(u.id)) {
        statusMap[u.id] = { status: 'in_meeting', label: 'In Meeting' };
      } else {
        const onLeave = approvedLeaves.some(l => {
          if (l.userId !== u.id) return false;
          const from = (l.fromDate || '').split('T')[0];
          const to = (l.toDate || '').split('T')[0];
          return from <= todayStr && todayStr <= to;
        });
        if (onLeave) {
          statusMap[u.id] = { status: 'on_leave', label: 'On Leave' };
        } else {
          statusMap[u.id] = { status: 'free', label: 'Free' };
        }
      }
    }

    res.json(statusMap);
  } catch (err) {
    console.error("Error computing employee status:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------
// Groups API
// --------------------------------------------------
app.get("/api/groups", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM groups ORDER BY "createdAt" ASC');
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/groups", async (req, res) => {
  try {
    const { name, createdById, members } = req.body;
    if (!name || !members || !Array.isArray(members)) {
      return res.status(400).json({ error: "Group name and members array are required" });
    }
    const groupId = `grp-${Date.now()}`;
    const result = await pool.query(
      `INSERT INTO groups (id, name, "createdById", members) VALUES ($1, $2, $3, $4) RETURNING *`,
      [groupId, name, createdById, JSON.stringify(members)]
    );
    const newGroup = result.rows[0];
    io.emit("groupCreated", newGroup);
    res.status(201).json(newGroup);
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ error: "Failed to create group" });
  }
});

// --------------------------------------------------
// Chat Preferences (Archive / Mark Read) API
// --------------------------------------------------
app.get("/api/chat/preferences", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId is required" });
    const result = await pool.query('SELECT * FROM user_chat_preferences WHERE "userId" = $1', [userId]);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching chat preferences:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chat/archive", async (req, res) => {
  try {
    const { userId, chatId, isArchived } = req.body;
    if (!userId || !chatId) return res.status(400).json({ error: "userId and chatId are required" });
    const result = await pool.query(
      `INSERT INTO user_chat_preferences ("userId", "chatId", "isArchived") 
       VALUES ($1, $2, $3)
       ON CONFLICT ("userId", "chatId") 
       DO UPDATE SET "isArchived" = EXCLUDED."isArchived" RETURNING *`,
      [userId, chatId, isArchived]
    );
    io.emit("chatPreferenceUpdated", { userId, chatId, isArchived });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating archive preference:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/chat/pin", async (req, res) => {
  try {
    const { userId, chatId, isPinned } = req.body;
    if (!userId || !chatId) return res.status(400).json({ error: "userId and chatId are required" });
    const result = await pool.query(
      `INSERT INTO user_chat_preferences ("userId", "chatId", "isPinned") 
       VALUES ($1, $2, $3)
       ON CONFLICT ("userId", "chatId") 
       DO UPDATE SET "isPinned" = EXCLUDED."isPinned" RETURNING *`,
      [userId, chatId, isPinned]
    );
    io.emit("chatPreferenceUpdated", { userId, chatId, isPinned });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error updating pin preference:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/chat/mark-all-read", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });
    const msgs = await pool.query('SELECT id, "readBy" FROM messages');
    for (const m of msgs.rows) {
      let readBy = Array.isArray(m.readBy) ? m.readBy : [];
      if (!readBy.includes(userId)) {
        readBy.push(userId);
        await pool.query('UPDATE messages SET "readBy" = $1 WHERE id = $2', [JSON.stringify(readBy), m.id]);
      }
    }
    await pool.query(
      `INSERT INTO user_chat_preferences ("userId", "chatId", "lastReadTimestamp") 
       SELECT $1, id, CURRENT_TIMESTAMP FROM users
       ON CONFLICT ("userId", "chatId") DO UPDATE SET "lastReadTimestamp" = CURRENT_TIMESTAMP`,
      [userId]
    );
    io.emit("chatsMarkedRead", { userId });
    res.json({ success: true });
  } catch (error) {
    console.error("Error marking all read:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chat/mark-read", async (req, res) => {
  try {
    const { userId, chatId } = req.body;
    if (!userId || !chatId) return res.status(400).json({ error: "userId and chatId are required" });

    // Update user preferences
    await pool.query(
      `INSERT INTO user_chat_preferences ("userId", "chatId", "lastReadTimestamp") 
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT ("userId", "chatId") DO UPDATE SET "lastReadTimestamp" = CURRENT_TIMESTAMP`,
      [userId, chatId]
    );

    // Update readBy on relevant messages
    const msgs = await pool.query(
      `SELECT id, "readBy", "senderId", "receiverId", "isGroup" FROM messages`
    );
    for (const m of msgs.rows) {
      const isTargetChat = (m.senderId === chatId || m.receiverId === chatId);
      if (isTargetChat && m.senderId !== userId) {
        let readBy = Array.isArray(m.readBy) ? m.readBy : [];
        if (!readBy.includes(userId)) {
          readBy.push(userId);
          await pool.query('UPDATE messages SET "readBy" = $1 WHERE id = $2', [JSON.stringify(readBy), m.id]);
        }
      }
    }

    io.emit("chatMarkedRead", { userId, chatId });
    res.json({ success: true });
  } catch (err) {
    console.error("Error marking chat read:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------
// Chat API
// --------------------------------------------------
app.get("/api/messages", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM messages ORDER BY "createdAt" ASC');
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.json([]);
  }
});

app.post("/api/messages", async (req, res) => {
  try {
    const { sender, receiver, senderId, receiverId, message, isGroup } = req.body;
    if (!sender || !receiver || !message) {
      return res.status(400).json({ error: "sender, receiver and message are required" });
    }
    const result = await pool.query(
      `INSERT INTO messages (sender, receiver, "senderId", "receiverId", message, "isGroup", "readBy") 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [sender, receiver, senderId || null, receiverId || null, message, isGroup || false, JSON.stringify(senderId ? [senderId] : [])]
    );
    const savedMessage = result.rows[0];
    savedMessage._id = savedMessage.id;
    io.emit("newMessage", savedMessage);
    res.status(201).json(savedMessage);
  } catch (error) {
    console.error("Error saving message:", error);
    res.status(500).json({ error: "Failed to save message" });
  }
});

// Socket.IO Connection
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-meeting-socket", (data) => {
    socket.join(data.room);
    socket.room = data.room;
    socket.userId = data.userId;
    socket.fullname = data.fullname;

    // Broadcast status to let others know a new user joined
    io.to(data.room).emit("meeting-status-update", {
      room: data.room,
      userId: data.userId,
      fullname: data.fullname,
      isMicOn: true,
      isCamOn: true,
      isJoined: true
    });
  });

  socket.on("meeting-chat-send", (data) => {
    if (data.room) {
      io.to(data.room).emit("meeting-chat-receive", data);
    }
  });

  socket.on("meeting-host-action", (data) => {
    if (data.room) {
      io.to(data.room).emit("meeting-host-action", data);
    }
  });

  socket.on("meeting-hand-raise", (data) => {
    if (data.room) {
      io.to(data.room).emit("meeting-hand-raise", data);
    }
  });

  socket.on("meeting-status-update", (data) => {
    if (data.room) {
      io.to(data.room).emit("meeting-status-update", data);
    }
  });

  socket.on("meeting-scheduled", (data) => {
    socket.broadcast.emit("meeting-scheduled", data);
  });

  // Instant call invite — broadcast to all connected clients so target user sees incoming call
  socket.on("instant-call-invite", (data) => {
    socket.broadcast.emit("instant-call-invite", data);
  });

  socket.on("incoming-call", (data) => {
    socket.broadcast.emit("instant-call-invite", data);
    socket.broadcast.emit("incoming-call", data);
  });

  socket.on("call-declined", (data) => {
    socket.broadcast.emit("call-declined", data);
  });


  socket.on("meeting-reaction", (data) => {
    if (data.room) {
      io.to(data.room).emit("meeting-reaction", data);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    if (socket.room && socket.userId) {
      io.to(socket.room).emit("meeting-status-update", {
        room: socket.room,
        userId: socket.userId,
        fullname: socket.fullname,
        isLeft: true
      });
    }
  });
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
// NOTE: auth routes must be mounted before this catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize server
server.listen(port, async () => {
  await initDb();
  console.log(`[Server] Running on http://localhost:${port}`);
});