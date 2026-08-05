const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:postgres@localhost:5432/medastrax' });
pool.query('SELECT id, fullname, role, "reportingManagerId" FROM users').then(res => {
  console.table(res.rows);
  process.exit(0);
});
