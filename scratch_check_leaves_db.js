// scratch_check_leaves_db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkDb() {
  try {
    const res = await pool.query("SELECT id, \"employeeName\", \"fromDate\", \"toDate\", \"currentApproverId\", status, \"approvalChain\" FROM leaves");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkDb();
