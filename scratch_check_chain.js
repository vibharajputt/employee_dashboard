// scratch_check_chain.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

function buildApprovalChain(user, usersList) {
  const chain = [];
  if (!user) return chain;

  const list = Array.isArray(usersList) ? usersList : [];
  let current = user;
  const visited = new Set([user.id]);
  
  while (current && current.reportingManagerId && current.reportingManagerId !== "none") {
    const manager = list.find(u => u.id === current.reportingManagerId);
    if (manager && !visited.has(manager.id)) {
      visited.add(manager.id);
      chain.push({
        approverId: manager.id,
        approverName: (manager.fullname || manager.username || "Manager").replace(/\s*\(.*\)\s*/g, ""),
        approverRole: manager.role || "Manager",
        status: "Pending",
        actionDate: null
      });
      current = manager;
    } else {
      break;
    }
  }

  const adminUser = list.find(u => u.role === "Admin");
  if (adminUser) {
    const hasAdmin = chain.some(item => item.approverId === adminUser.id);
    if (!hasAdmin && user.id !== adminUser.id) {
      chain.push({
        approverId: adminUser.id,
        approverName: (adminUser.fullname || "Admin").replace(/\s*\(.*\)\s*/g, ""),
        approverRole: adminUser.role || "Admin",
        status: "Pending",
        actionDate: null
      });
    }
  }

  return chain;
}

async function checkChain() {
  try {
    const res = await pool.query("SELECT * FROM users");
    const users = res.rows.map(r => ({
      id: r.id,
      username: r.username,
      fullname: r.fullname,
      role: r.role,
      reportingManagerId: r.reportingManagerId
    }));
    
    const tanveer = users.find(u => u.id === 'usr-tanveer');
    const chain = buildApprovalChain(tanveer, users);
    console.log("Tanveer's Approval Chain:", chain);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkChain();
