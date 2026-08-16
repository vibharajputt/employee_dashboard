/**
 * Seed Database Utility Script for MedAstraX Portal
 * 
 * Usage:
 *   node seed_database.js "postgresql://user:pass@host/db?sslmode=require"
 * OR set DATABASE_URL in your local .env and run:
 *   node seed_database.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.argv[2] || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ Error: No DATABASE_URL provided.");
  console.log("👉 Usage: node seed_database.js \"postgresql://username:password@ep-xyz.neon.tech/neondb?sslmode=require\"");
  process.exit(1);
}

const isCloudDb = !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');

const pool = new Pool({
  connectionString,
  ssl: isCloudDb ? { rejectUnauthorized: false } : false
});

async function runSeed() {
  console.log("🔌 Connecting to database...");
  const client = await pool.connect();
  console.log("✅ Connected successfully!");

  try {
    const seedFile = path.join(__dirname, 'seed_data.json');
    if (!fs.existsSync(seedFile)) {
      console.error("❌ Error: seed_data.json file not found locally.");
      return;
    }

    const data = JSON.parse(fs.readFileSync(seedFile, 'utf8'));

    // 1. Create Tables if they don't exist
    console.log("📦 Verifying database schema...");

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
      );

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
      );

      CREATE TABLE IF NOT EXISTS leaves (
        "id" VARCHAR(50) PRIMARY KEY,
        "userId" VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        "userName" VARCHAR(100),
        "userRole" VARCHAR(50),
        "startDate" VARCHAR(50) NOT NULL,
        "endDate" VARCHAR(50) NOT NULL,
        "type" VARCHAR(50) NOT NULL,
        "reason" TEXT,
        "status" VARCHAR(50) NOT NULL,
        "appliedOn" VARCHAR(50) NOT NULL,
        "actionedBy" VARCHAR(100),
        "actionedAt" VARCHAR(50)
      );

      CREATE TABLE IF NOT EXISTS activities (
        "id" VARCHAR(50) PRIMARY KEY,
        "message" TEXT NOT NULL,
        "type" VARCHAR(50),
        "timestamp" VARCHAR(50) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        "id" VARCHAR(50) PRIMARY KEY,
        "sender" VARCHAR(100) NOT NULL,
        "receiver" VARCHAR(100) NOT NULL,
        "message" TEXT NOT NULL,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS groups (
        "id" VARCHAR(50) PRIMARY KEY,
        "name" VARCHAR(100) NOT NULL,
        "members" JSONB NOT NULL,
        "createdBy" VARCHAR(100) NOT NULL,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_chat_preferences (
        "userId" VARCHAR(50) PRIMARY KEY,
        "pinnedChats" JSONB DEFAULT '[]',
        "starredMessages" JSONB DEFAULT '[]',
        "unreadCounts" JSONB DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS meetings (
        "id" VARCHAR(50) PRIMARY KEY,
        "title" VARCHAR(100) NOT NULL,
        "time" VARCHAR(10) NOT NULL,
        "participants" JSONB DEFAULT '[]',
        "isFixed" BOOLEAN DEFAULT false,
        "roomCode" VARCHAR(50) NOT NULL,
        "description" TEXT DEFAULT '',
        "isRecurring" BOOLEAN DEFAULT false,
        "recurrence" JSONB DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS attendance (
        "id" VARCHAR(50) PRIMARY KEY,
        "userId" VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        "userName" VARCHAR(100) NOT NULL,
        "userRole" VARCHAR(50),
        "userDomain" VARCHAR(100),
        "date" VARCHAR(20) NOT NULL,
        "meetingType" VARCHAR(50) NOT NULL,
        "status" VARCHAR(20) NOT NULL,
        "markedBy" VARCHAR(50),
        "markedByName" VARCHAR(100),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("userId", "date", "meetingType")
      );
    `);

    console.log("✅ Tables created/verified.");

    // 2. Insert Users
    if (data.users && data.users.length > 0) {
      console.log(`👤 Seeding ${data.users.length} users into live database...`);
      for (const u of data.users) {
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
          [u.id, u.username, u.password, u.fullname, u.role, u.reportingManagerId || 'none', u.status || 'Active', u.availabilityStatus || 'Active', u.gmail || '', u.phone || '', u.domain || 'General', u.aadhar || '']
        );
      }
    }

    // 3. Insert Meetings
    if (data.meetings && data.meetings.length > 0) {
      console.log(`📅 Seeding ${data.meetings.length} meetings...`);
      for (const m of data.meetings) {
        await client.query(
          `INSERT INTO meetings (id, title, "time", participants, "isFixed", "roomCode", description, "isRecurring", recurrence)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [m.id, m.title, m.time, JSON.stringify(m.participants || []), !!m.isFixed, m.roomCode || m.id, m.description || '', !!m.isRecurring, JSON.stringify(m.recurrence || {})]
        );
      }
    }

    // 4. Insert Activities
    if (data.activities && data.activities.length > 0) {
      console.log(`🔔 Seeding ${data.activities.length} activities...`);
      for (const a of data.activities) {
        await client.query(
          `INSERT INTO activities (id, message, type, timestamp)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [a.id, a.message, a.type, a.timestamp]
        );
      }
    }

    console.log("🎉 All data seeded successfully to cloud PostgreSQL database!");
  } catch (err) {
    console.error("❌ Seed error:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

runSeed();
