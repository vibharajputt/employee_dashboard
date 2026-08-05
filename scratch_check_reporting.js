// scratch_check_reporting.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkDb() {
  try {
    const res = await pool.query("SELECT id, username, fullname, role, \"reportingManagerId\" FROM users");
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkDb();
