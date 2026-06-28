/**
 * ==========================================================================
 * MEDASTRAX WORKSPACE PORTAL CORE LOGIC
 * Role-Based Access, Dynamic Hierarchies & Task Management System
 * ==========================================================================
 */

// --------------------------------------------------------------------------
// 1. Database Seeding & Mock Data
// --------------------------------------------------------------------------

const DEFAULT_USERS = [
  {
    id: "usr-admin",
    username: "admin",
    password: "admin123",
    fullname: "Dr. Alok Verma (Director)",
    role: "Admin",
    reportingManagerId: "none",
    status: "Active",
    availabilityStatus: "Active"
  },
  {
    id: "usr-mgr-1",
    username: "manager1",
    password: "manager123",
    fullname: "Vikram Malhotra (R&D Head)",
    role: "Manager",
    reportingManagerId: "usr-admin",
    status: "Active",
    availabilityStatus: "Active"
  },
  {
    id: "usr-mgr-2",
    username: "manager2",
    password: "manager223",
    fullname: "Neha Sen (Operations Head)",
    role: "Manager",
    reportingManagerId: "usr-admin",
    status: "Active",
    availabilityStatus: "Active"
  },
  {
    id: "usr-emp-1",
    username: "employee1",
    password: "emp123",
    fullname: "Aman Sharma (Senior Dev)",
    role: "Employee",
    reportingManagerId: "usr-mgr-1",
    status: "Active",
    availabilityStatus: "Active"
  },
  {
    id: "usr-emp-2",
    username: "employee2",
    password: "emp223",
    fullname: "Priya Verma (Data Analyst)",
    role: "Employee",
    reportingManagerId: "usr-mgr-1",
    status: "Active",
    availabilityStatus: "Active"
  },
  {
    id: "usr-emp-3",
    username: "employee3",
    password: "emp323",
    fullname: "Rohan Das (Systems Exec)",
    role: "Employee",
    reportingManagerId: "usr-mgr-2",
    status: "Active",
    availabilityStatus: "Active"
  }
];

const DEFAULT_TASKS = [
  {
    id: "tsk-101",
    title: "Calibrate Biotech Sensor Array",
    description: "Run diagnostic loops and optimize the calibration metrics for the Phase-II biometric sensors in the main lab.",
    assigneeId: "usr-emp-1",
    priority: "High",
    dueDate: "2026-06-30",
    status: "Pending",
    assignedById: "usr-mgr-1",
    referenceLink: "https://docs.google.com/document/d/1_calibrate_biotech_sensor",
    deliverableLink: "",
    feedback: "",
    comments: [
      { author: "Vikram Malhotra (R&D Head)", text: "Please use the latest calibration files from the shared lab drive.", timestamp: "2026-06-25T11:00:00.000Z" }
    ]
  },
  {
    id: "tsk-102",
    title: "Document Imaging Pipeline API",
    description: "Write complete OpenAPI documentation for the core image processing workflow and share with clinical partners.",
    assigneeId: "usr-emp-2",
    priority: "Medium",
    dueDate: "2026-07-05",
    status: "In Progress",
    assignedById: "usr-mgr-1",
    referenceLink: "https://github.com/medastrax/imaging-pipeline",
    deliverableLink: "",
    feedback: "",
    comments: []
  },
  {
    id: "tsk-103",
    title: "Onboard Internship Candidates",
    description: "Conduct credential setup, workspace allocation, and documentation collection for the summer cohort.",
    assigneeId: "usr-emp-3",
    priority: "Low",
    dueDate: "2026-06-24",
    status: "Completed",
    assignedById: "usr-mgr-2",
    referenceLink: "",
    deliverableLink: "https://docs.google.com/spreadsheets/d/intern_onboarding_tracker",
    feedback: "",
    comments: [
      { author: "Rohan Das (Systems Exec)", text: "Credentials generated and shared. Ready for approval.", timestamp: "2026-06-25T11:15:00.000Z" }
    ]
  },
  {
    id: "tsk-104",
    title: "Approve Q2 Lab Expansion Budget",
    description: "Review procurement manifests and sign off on facility improvements for building C biotechnology wings.",
    assigneeId: "usr-mgr-1",
    priority: "Critical",
    dueDate: "2026-06-29",
    status: "Pending",
    assignedById: "usr-admin",
    referenceLink: "https://docs.google.com/spreadsheets/d/q2_expansion_budget",
    deliverableLink: "",
    feedback: "",
    comments: []
  }
];

const DEFAULT_ACTIVITIES = [
  {
    id: "act-1",
    timestamp: "2026-06-25T10:00:00.000Z",
    type: "system",
    message: "MedAstraX portal database initialized successfully."
  },
  {
    id: "act-2",
    timestamp: "2026-06-25T11:30:00.000Z",
    type: "success",
    message: "Task 'Onboard Internship Candidates' marked as Completed by Rohan Das."
  }
];

// Initialize local database if not exists
function initDatabase() {
  if (!localStorage.getItem("medastrax_users")) {
    localStorage.setItem("medastrax_users", JSON.stringify(DEFAULT_USERS));
  }
  if (!localStorage.getItem("medastrax_tasks")) {
    localStorage.setItem("medastrax_tasks", JSON.stringify(DEFAULT_TASKS));
  }
  if (!localStorage.getItem("medastrax_activities")) {
    localStorage.setItem("medastrax_activities", JSON.stringify(DEFAULT_ACTIVITIES));
  }
}

// Database Helpers
const db = {
  getUsers: () => JSON.parse(localStorage.getItem("medastrax_users")),
  saveUsers: (users) => localStorage.setItem("medastrax_users", JSON.stringify(users)),
  getTasks: () => JSON.parse(localStorage.getItem("medastrax_tasks")),
  saveTasks: (tasks) => localStorage.setItem("medastrax_tasks", JSON.stringify(tasks)),
  getActivities: () => JSON.parse(localStorage.getItem("medastrax_activities")),
  saveActivities: (acts) => localStorage.setItem("medastrax_activities", JSON.stringify(acts)),
  
  logActivity: (message, type = "info") => {
    const acts = db.getActivities();
    acts.unshift({
      id: "act-" + Date.now(),
      timestamp: new Date().toISOString(),
      type,
      message
    });
    db.saveActivities(acts.slice(0, 30)); // Cap logs to last 30
  }
};

// --------------------------------------------------------------------------
// 2. Application State & Authentication
// --------------------------------------------------------------------------

let currentUser = null;
let performanceChart = null;

function checkAuth() {
  const sessionUser = sessionStorage.getItem("medastrax_current_user");
  if (sessionUser) {
    currentUser = JSON.parse(sessionUser);
    setupWorkspace();
  } else {
    showLoginScreen();
  }
}

window.selectPortal = function(type) {
  const portalSelector = document.getElementById("portal-selector");
  const loginCardWrapper = document.getElementById("login-card-wrapper");
  const portalTitle = document.getElementById("login-portal-title");
  const portalTypeInput = document.getElementById("login-portal-type");
  const credentialsHint = document.getElementById("demo-credentials-hint");

  // Reset animations and classes
  portalSelector.className = "portal-select-container";
  loginCardWrapper.className = "login-card hidden";

  // Slide out selector to left
  portalSelector.classList.add("slide-out-left");
  portalTypeInput.value = type;

  if (type === "admin") {
    portalTitle.textContent = "ADMIN PORTAL LOGIN";
    credentialsHint.innerHTML = `
      <div><span>Admin Username:</span> <code>admin</code></div>
      <div><span>Admin Password:</span> <code>admin123</code></div>
    `;
    document.getElementById("username").placeholder = "Enter admin username";
  } else {
    portalTitle.textContent = "STAFF PORTAL LOGIN";
    credentialsHint.innerHTML = `
      <div><span>Manager Username:</span> <code>manager1</code> / <code>manager123</code></div>
      <div><span>Employee Username:</span> <code>employee1</code> / <code>emp123</code></div>
    `;
    document.getElementById("username").placeholder = "Enter manager or employee username";
  }
  
  lucide.createIcons();

  // Wait for slide-out animation to complete, then slide-in login form
  setTimeout(() => {
    portalSelector.classList.add("hidden");
    portalSelector.classList.remove("slide-out-left");
    
    loginCardWrapper.classList.remove("hidden");
    loginCardWrapper.classList.add("slide-in-right");
    
    setTimeout(() => {
      loginCardWrapper.classList.remove("slide-in-right");
    }, 400);
  }, 250);
};

function handleLogin(username, password) {
  const portalType = document.getElementById("login-portal-type").value;
  const users = db.getUsers();
  const matchedUser = users.find(
    u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );

  if (matchedUser) {
    if (matchedUser.status !== "Active") {
      showToast("Your account has been deactivated. Contact Admin.", "error");
      return;
    }

    // Role vs Portal validation
    if (portalType === "admin" && matchedUser.role !== "Admin") {
      showToast("Access Denied: This portal is reserved for Administrators.", "error");
      return;
    }
    if (portalType === "staff" && matchedUser.role === "Admin") {
      showToast("Access Denied: Administrators must use the Admin Portal.", "error");
      return;
    }

    currentUser = matchedUser;
    sessionStorage.setItem("medastrax_current_user", JSON.stringify(currentUser));
    db.logActivity(`${currentUser.fullname} logged into the ${portalType} portal.`, "success");
    setupWorkspace();
    showToast(`Welcome back, ${currentUser.fullname}!`, "success");
  } else {
    showToast("Invalid username or password.", "error");
  }
}

function handleLogout() {
  if (currentUser) {
    db.logActivity(`${currentUser.fullname} logged out of the workspace.`, "system");
  }
  currentUser = null;
  sessionStorage.removeItem("medastrax_current_user");
  showLoginScreen();
  showToast("Logged out successfully.", "info");
}

// --------------------------------------------------------------------------
// 3. UI Navigation & Rendering Control
// --------------------------------------------------------------------------

function showLoginScreen() {
  document.getElementById("login-container").classList.remove("hidden");
  document.getElementById("portal-selector").classList.remove("hidden");
  document.getElementById("login-card-wrapper").classList.add("hidden");
  document.getElementById("workspace-container").classList.add("hidden");
  document.getElementById("login-form").reset();
  
  const ecgCanvas = document.getElementById("ecg-canvas");
  if (ecgCanvas) {
    ecgCanvas.classList.remove("hidden");
  }
}

function setupWorkspace() {
  document.getElementById("login-container").classList.add("hidden");
  document.getElementById("workspace-container").classList.remove("hidden");

  const ecgCanvas = document.getElementById("ecg-canvas");
  if (ecgCanvas) {
    ecgCanvas.classList.add("hidden");
  }

  // Load basic UI details
  const cleanFullname = currentUser.fullname.replace(/\s*\(.*\)\s*/g, "");
  const nameParts = cleanFullname.split(' ');
  const titlePrefixes = ['dr.', 'mr.', 'ms.', 'mrs.', 'prof.', 'sir'];
  
  let displayName = nameParts[0];
  if (nameParts.length > 1 && titlePrefixes.includes(nameParts[0].toLowerCase())) {
    displayName = `${nameParts[0]} ${nameParts[1]}`;
  }
  
  let avatarChar = nameParts[0].charAt(0);
  if (nameParts.length > 1 && titlePrefixes.includes(nameParts[0].toLowerCase())) {
    avatarChar = nameParts[1].charAt(0);
  }

  document.getElementById("user-display-name").textContent = cleanFullname;
  document.getElementById("user-display-role").textContent = currentUser.role;
  document.getElementById("user-avatar-char").textContent = avatarChar.toUpperCase();
  
  // Set badge classes
  const roleBadge = document.getElementById("user-display-role");
  roleBadge.className = "badge";
  if (currentUser.role === "Admin") roleBadge.classList.add("badge-admin");
  else if (currentUser.role === "Manager") roleBadge.classList.add("badge-manager");
  else roleBadge.classList.add("badge-employee");

  document.getElementById("welcome-title").textContent = `Welcome back, ${displayName}`;
  document.getElementById("header-role-badge").textContent = currentUser.role;
  document.getElementById("header-role-badge").className = `value badge badge-${currentUser.role.toLowerCase()}`;
  
  // Display reporting structure in header
  const managerInfo = document.getElementById("manager-info-mini");
  if (currentUser.role === "Admin") {
    managerInfo.classList.add("hidden");
  } else {
    managerInfo.classList.remove("hidden");
    const users = db.getUsers();
    const mgr = users.find(u => u.id === currentUser.reportingManagerId);
    document.getElementById("header-manager-name").textContent = mgr ? mgr.fullname : "N/A";
  }

  // Set Current Date
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById("current-date").textContent = new Date().toLocaleDateString('en-US', options);

  // Manage visibility of sidebar elements
  const manageEmployeesNavItem = document.getElementById("nav-item-manage-employees");
  if (currentUser.role === "Admin") {
    manageEmployeesNavItem.classList.remove("hidden");
  } else {
    manageEmployeesNavItem.classList.add("hidden");
  }

  const performanceNavItem = document.getElementById("nav-item-performance");
  if (currentUser.role === "Admin" || currentUser.role === "Manager") {
    performanceNavItem.classList.remove("hidden");
  } else {
    performanceNavItem.classList.add("hidden");
  }

  // Default to Overview tab
  switchTab("overview");
  
  // Refresh Lucide Icons
  lucide.createIcons();
}

function switchTab(tabId) {
  // Update nav links
  document.querySelectorAll(".nav-link").forEach(link => {
    if (link.getAttribute("data-tab") === tabId) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });

  // Toggle panes
  document.querySelectorAll(".tab-pane").forEach(pane => {
    if (pane.id === `tab-${tabId}`) {
      pane.classList.remove("hidden");
    } else {
      pane.classList.add("hidden");
    }
  });

  // Specific render controllers for each tab
  if (tabId === "overview") renderOverviewTab();
  else if (tabId === "hierarchy") renderHierarchyTab();
  else if (tabId === "employees" && currentUser.role === "Admin") renderEmployeesTab();
  else if (tabId === "tasks") renderTasksTab();
  else if (tabId === "settings") renderSettingsTab();
  else if (tabId === "performance") renderPerformanceTab();

  lucide.createIcons();
}

// --------------------------------------------------------------------------
// 4. Tab 1: Overview Dashboard rendering
// --------------------------------------------------------------------------

function renderOverviewTab() {
  const users = db.getUsers();
  const tasks = db.getTasks();
  const activities = db.getActivities();
  const statsContainer = document.getElementById("stats-grid-container");

  // Determine Subordinates (hierarchy mapping)
  const subordinates = getSubordinates(currentUser.id, users);
  const subordinateIds = subordinates.map(s => s.id);

  let statsHTML = "";

  if (currentUser.role === "Admin") {
    const totalUsers = users.length;
    const totalManagers = users.filter(u => u.role === "Manager").length;
    const pendingTasks = tasks.filter(t => t.status !== "Completed").length;
    const completedTasks = tasks.filter(t => t.status === "Completed").length;

    statsHTML = `
      <div class="dashboard-card stat-card">
        <div class="stat-card-left">
          <h4>Total Workspace Staff</h4>
          <div class="stat-value">${totalUsers}</div>
        </div>
        <div class="stat-card-right"><i data-lucide="users"></i></div>
      </div>
      <div class="dashboard-card stat-card stat-secondary">
        <div class="stat-card-left">
          <h4>Reporting Managers</h4>
          <div class="stat-value">${totalManagers}</div>
        </div>
        <div class="stat-card-right"><i data-lucide="shield"></i></div>
      </div>
      <div class="dashboard-card stat-card stat-warning">
        <div class="stat-card-left">
          <h4>Active Pending Tasks</h4>
          <div class="stat-value">${pendingTasks}</div>
        </div>
        <div class="stat-card-right"><i data-lucide="clock"></i></div>
      </div>
      <div class="dashboard-card stat-card stat-success">
        <div class="stat-card-left">
          <h4>Completed Deliverables</h4>
          <div class="stat-value">${completedTasks}</div>
        </div>
        <div class="stat-card-right"><i data-lucide="check-circle-2"></i></div>
      </div>
    `;
  } else if (currentUser.role === "Manager") {
    const subCount = subordinates.length;
    const teamTasks = tasks.filter(t => subordinateIds.includes(t.assigneeId) || t.assigneeId === currentUser.id);
    const pendingTeamTasks = teamTasks.filter(t => t.status !== "Completed").length;
    const completedTeamTasks = teamTasks.filter(t => t.status === "Completed").length;
    const myTasksCount = tasks.filter(t => t.assigneeId === currentUser.id && t.status !== "Completed").length;

    statsHTML = `
      <div class="dashboard-card stat-card">
        <div class="stat-card-left">
          <h4>Your Subordinates</h4>
          <div class="stat-value">${subCount}</div>
        </div>
        <div class="stat-card-right"><i data-lucide="users"></i></div>
      </div>
      <div class="dashboard-card stat-card stat-secondary">
        <div class="stat-card-left">
          <h4>Your Pending Tasks</h4>
          <div class="stat-value">${myTasksCount}</div>
        </div>
        <div class="stat-card-right"><i data-lucide="user-check"></i></div>
      </div>
      <div class="dashboard-card stat-card stat-warning">
        <div class="stat-card-left">
          <h4>Team Pending Tasks</h4>
          <div class="stat-value">${pendingTeamTasks}</div>
        </div>
        <div class="stat-card-right"><i data-lucide="clock"></i></div>
      </div>
      <div class="dashboard-card stat-card stat-success">
        <div class="stat-card-left">
          <h4>Team Completed</h4>
          <div class="stat-value">${completedTeamTasks}</div>
        </div>
        <div class="stat-card-right"><i data-lucide="check-circle-2"></i></div>
      </div>
    `;
  } else {
    // Employee
    const myTasks = tasks.filter(t => t.assigneeId === currentUser.id);
    const totalMy = myTasks.length;
    const pendingMy = myTasks.filter(t => t.status !== "Completed").length;
    const completedMy = myTasks.filter(t => t.status === "Completed").length;
    const completionRate = totalMy > 0 ? Math.round((completedMy / totalMy) * 100) : 100;

    statsHTML = `
      <div class="dashboard-card stat-card">
        <div class="stat-card-left">
          <h4>Assigned Deliverables</h4>
          <div class="stat-value">${totalMy}</div>
        </div>
        <div class="stat-card-right"><i data-lucide="briefcase"></i></div>
      </div>
      <div class="dashboard-card stat-card stat-warning">
        <div class="stat-card-left">
          <h4>Tasks to Complete</h4>
          <div class="stat-value">${pendingMy}</div>
        </div>
        <div class="stat-card-right"><i data-lucide="clock"></i></div>
      </div>
      <div class="dashboard-card stat-card stat-success">
        <div class="stat-card-left">
          <h4>Tasks Completed</h4>
          <div class="stat-value">${completedMy}</div>
        </div>
        <div class="stat-card-right"><i data-lucide="check-circle-2"></i></div>
      </div>
      <div class="dashboard-card stat-card stat-secondary">
        <div class="stat-card-left">
          <h4>Completion Score</h4>
          <div class="stat-value">${completionRate}%</div>
        </div>
        <div class="stat-card-right"><i data-lucide="trending-up"></i></div>
      </div>
    `;
  }

  statsContainer.innerHTML = statsHTML;

  // Render recent activities
  const timeline = document.getElementById("activity-timeline-container");
  timeline.innerHTML = "";
  activities.forEach(act => {
    const actTime = new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const actDate = new Date(act.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
    
    const div = document.createElement("div");
    div.className = `activity-item ${act.type}-activity`;
    div.innerHTML = `
      <span class="activity-time">${actDate} at ${actTime}</span>
      <p class="activity-desc">${act.message}</p>
    `;
    timeline.appendChild(div);
  });

  // Render security card details
  document.getElementById("profile-full-name").textContent = currentUser.fullname;
  document.getElementById("profile-username").textContent = `@${currentUser.username}`;
  document.getElementById("profile-role").textContent = currentUser.role;
  
  const profileReporting = document.getElementById("profile-reporting");
  if (currentUser.role === "Admin") {
    profileReporting.textContent = "Top-level Organization Admin";
  } else {
    const reportingMgr = users.find(u => u.id === currentUser.reportingManagerId);
    profileReporting.textContent = reportingMgr ? `${reportingMgr.fullname} (${reportingMgr.role})` : "None";
  }

  // Update current duty status badge in security card
  const statusPill = document.querySelector(".profile-details-card .status-pill");
  if (statusPill) {
    const curStatus = currentUser.availabilityStatus || "Active";
    statusPill.textContent = curStatus;
    statusPill.className = "status-pill";
    if (curStatus === "Active") {
      statusPill.classList.add("active-status");
    } else if (curStatus === "On Leave") {
      statusPill.classList.add("warning-status");
    } else {
      statusPill.classList.add("danger-status");
    }
  }

  // Update status indicator dot in sidebar
  const indicator = document.querySelector(".avatar-container .status-indicator");
  if (indicator) {
    const curStatus = currentUser.availabilityStatus || "Active";
    indicator.className = "status-indicator";
    if (curStatus === "Active") {
      indicator.classList.add("online");
      indicator.style.backgroundColor = "";
    } else if (curStatus === "On Leave") {
      indicator.style.backgroundColor = "var(--color-warning)";
    } else {
      indicator.style.backgroundColor = "var(--color-danger)";
    }
  }

}

// --------------------------------------------------------------------------
// 4.5. Tab 1.5: Team Performance Dashboard rendering
// --------------------------------------------------------------------------

function renderPerformanceTab() {
  const users = db.getUsers();
  const tasks = db.getTasks();
  const subordinates = getSubordinates(currentUser.id, users);

  // Destroy previous chart if it exists
  if (performanceChart) {
    performanceChart.destroy();
    performanceChart = null;
  }

  if (subordinates.length === 0) {
    const canvas = document.getElementById("team-performance-chart");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "var(--text-secondary)";
    ctx.font = "14px Inter";
    ctx.textAlign = "center";
    ctx.fillText("No subordinates found in reporting line", canvas.width / 2, canvas.height / 2);
    return;
  }

  // Get active filters values
  const roleFilter = document.getElementById("perf-role-filter").value;
  const priorityFilter = document.getElementById("perf-priority-filter").value;
  const dateFilter = document.getElementById("perf-date-filter").value;

  // Filter subordinates list by role
  let filteredSubordinates = [...subordinates];
  if (roleFilter !== "all") {
    filteredSubordinates = filteredSubordinates.filter(sub => sub.role === roleFilter);
  }

  if (filteredSubordinates.length === 0) {
    const canvas = document.getElementById("team-performance-chart");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "var(--text-secondary)";
    ctx.font = "14px Inter";
    ctx.textAlign = "center";
    ctx.fillText("No subordinates found matching the filters", canvas.width / 2, canvas.height / 2);
    return;
  }

  // Build data arrays for the chart
  const labels = [];
  const data = [];
  const backgroundColors = [];
  const borderColors = [];
  const taskCounts = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  filteredSubordinates.forEach(sub => {
    let subTasks = tasks.filter(t => t.assigneeId === sub.id);

    // Apply priority constraint
    if (priorityFilter !== "all") {
      subTasks = subTasks.filter(t => t.priority === priorityFilter);
    }

    // Apply date constraints
    if (dateFilter !== "all") {
      subTasks = subTasks.filter(t => {
        if (!t.dueDate) return false;
        const taskDate = new Date(t.dueDate);
        if (dateFilter === "week") {
          const nextWeek = new Date(today);
          nextWeek.setDate(today.getDate() + 7);
          return taskDate >= today && taskDate <= nextWeek;
        } else if (dateFilter === "month") {
          const nextMonth = new Date(today);
          nextMonth.setDate(today.getDate() + 30);
          return taskDate >= today && taskDate <= nextMonth;
        } else if (dateFilter === "overdue") {
          return t.status !== "Completed" && taskDate < today;
        }
        return true;
      });
    }

    const total = subTasks.length;
    const completed = subTasks.filter(t => t.status === "Completed").length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    labels.push(`${sub.fullname.split(' ')[0]} (${sub.role})`);
    data.push(percent);
    taskCounts.push({ completed, total });

    // Color Segregation: Indigo for Manager, Teal for Employee
    if (sub.role === "Manager") {
      backgroundColors.push("rgba(5, 47, 95, 0.75)"); // Deep Indigo
      borderColors.push("#052f5f");
    } else {
      backgroundColors.push("rgba(0, 168, 150, 0.75)"); // Teal
      borderColors.push("#00a896");
    }
  });

  const canvas = document.getElementById("team-performance-chart");
  const ctx = canvas.getContext("2d");

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(5, 47, 95, 0.06)";
  const labelColor = isDark ? "#94a3b8" : "#475569";

  performanceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Completion Score (%)',
        data: data,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 4,
        barPercentage: 0.55
      }]
    },
    options: {
      indexAxis: 'y', // Horizontal bars
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          titleColor: isDark ? '#f8fafc' : '#052f5f',
          bodyColor: isDark ? '#94a3b8' : '#475569',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(5,47,95,0.1)',
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              const idx = context.dataIndex;
              const counts = taskCounts[idx];
              return ` Score: ${context.raw}% (${counts.completed}/${counts.total} Tasks)`;
            }
          }
        }
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          grid: {
            color: gridColor
          },
          ticks: {
            color: labelColor,
            font: {
              family: 'Inter',
              size: 11
            },
            callback: function(value) {
              return value + "%";
            }
          }
        },
        y: {
          grid: {
            display: false
          },
          ticks: {
            color: labelColor,
            font: {
              family: 'Inter',
              weight: 500,
              size: 11
            }
          }
        }
      }
    }
  });
}


// Helper to get recursive subordinates under any given manager id
function getSubordinates(managerId, usersList) {
  const directSubordinates = usersList.filter(u => u.reportingManagerId === managerId);
  let allSubordinates = [...directSubordinates];
  
  directSubordinates.forEach(sub => {
    const nestedSubordinates = getSubordinates(sub.id, usersList);
    allSubordinates = allSubordinates.concat(nestedSubordinates);
  });
  
  return allSubordinates;
}

// --------------------------------------------------------------------------
// 5. Tab 2: Team Hierarchy rendering (Interactive Org Chart)
// --------------------------------------------------------------------------

function renderHierarchyTab() {
  const users = db.getUsers();
  const container = document.getElementById("org-chart-container");
  container.innerHTML = "";

  // The hierarchy should start from a specific root depending on the role.
  // Admin: starts from Admin.
  // Manager: starts from that specific manager (hiding admin/other manager's hierarchy).
  // Employee: starts from the Employee showing their reporting line to the top.
  
  let rootNode = null;
  
  if (currentUser.role === "Admin") {
    // Admin is root
    rootNode = users.find(u => u.role === "Admin");
  } else if (currentUser.role === "Manager") {
    // Manager is root of their own team
    rootNode = currentUser;
  } else {
    // Employee: let's build their path (Admin -> Manager -> Employee)
    rootNode = users.find(u => u.role === "Admin");
  }

  if (!rootNode) {
    container.innerHTML = "<p class='text-muted'>No hierarchy data available.</p>";
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "chart-tree";
  
  if (currentUser.role === "Employee") {
    // Show vertical path for employee to reduce isolation
    const list = document.createElement("li");
    list.appendChild(createNodeCard(rootNode, users));
    
    // Find manager
    const manager = users.find(u => u.id === currentUser.reportingManagerId);
    if (manager) {
      const subUl = document.createElement("ul");
      const managerLi = document.createElement("li");
      managerLi.appendChild(createNodeCard(manager, users));
      subUl.appendChild(managerLi);
      
      const empUl = document.createElement("ul");
      const empLi = document.createElement("li");
      empLi.appendChild(createNodeCard(currentUser, users));
      empUl.appendChild(empLi);
      managerLi.appendChild(empUl);
      
      list.appendChild(subUl);
    }
    ul.appendChild(list);
  } else {
    // For Admin or Manager, construct the complete downwards tree
    ul.appendChild(buildTreeHTML(rootNode, users));
  }
  
  container.appendChild(ul);
}

function buildTreeHTML(node, usersList) {
  const children = usersList.filter(u => u.reportingManagerId === node.id);
  const hasChildren = children.length > 0;

  const li = document.createElement("li");
  const nodeCard = createNodeCard(node, usersList, hasChildren);
  li.appendChild(nodeCard);

  if (hasChildren) {
    const ul = document.createElement("ul");
    children.forEach(child => {
      ul.appendChild(buildTreeHTML(child, usersList));
    });
    li.appendChild(ul);

    // Collapsible branch click handler
    nodeCard.addEventListener("click", () => {
      ul.classList.toggle("collapsed");
      nodeCard.classList.toggle("node-collapsed");
    });
  }

  return li;
}

function createNodeCard(node, usersList, hasChildren = false) {
  const div = document.createElement("div");
  div.className = `node-card ${node.role.toLowerCase()}-node`;
  if (hasChildren) {
    div.classList.add("collapsible-node");
  }
  
  // Highlight self
  if (node.id === currentUser.id) {
    div.style.borderColor = "var(--border-focus)";
    div.style.boxShadow = "var(--shadow-accent)";
  }

  const initial = node.fullname.charAt(0);
  const reportsToUser = usersList.find(u => u.id === node.reportingManagerId);
  const reportsToText = reportsToUser ? `Reports to: ${reportsToUser.fullname.split(' ')[0]}` : "Top Level";

  div.innerHTML = `
    <div class="node-avatar">${initial}</div>
    <div class="node-name">${node.fullname}</div>
    <span class="node-role badge badge-${node.role.toLowerCase()}">${node.role}</span>
    <div class="node-reports-to">${reportsToText}</div>
  `;
  
  return div;
}

// --------------------------------------------------------------------------
// 6. Tab 3: Directory / User Management rendering (Admin Only)
// --------------------------------------------------------------------------

function renderEmployeesTab() {
  if (currentUser.role !== "Admin") return;

  const users = db.getUsers();
  const searchVal = document.getElementById("employee-search").value.toLowerCase();
  const roleFilter = document.getElementById("filter-role-select").value;
  const tbody = document.getElementById("employees-table-body");
  tbody.innerHTML = "";

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.fullname.toLowerCase().includes(searchVal) || 
                          u.username.toLowerCase().includes(searchVal) || 
                          u.id.toLowerCase().includes(searchVal);
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  filteredUsers.forEach(u => {
    const tr = document.createElement("tr");
    const reportingUser = users.find(mgr => mgr.id === u.reportingManagerId);
    const reportingText = reportingUser ? reportingUser.fullname : "None (Director)";
    
    // Checkbox action actions: delete button (disable deleting root admin)
    const isRootAdmin = u.username === "admin";
    const deleteBtn = isRootAdmin 
      ? `<span class="text-muted">Protected</span>` 
      : `<button class="btn btn-danger btn-logout" onclick="deleteEmployee('${u.id}')"><i data-lucide="trash-2"></i> Delete</button>`;

    tr.innerHTML = `
      <td><code>${u.id}</code></td>
      <td><strong>${u.fullname}</strong></td>
      <td>@${u.username}</td>
      <td><span class="badge badge-${u.role.toLowerCase()}">${u.role}</span></td>
      <td>${reportingText}</td>
      <td><span class="status-pill active-status">${u.status}</span></td>
      <td>${deleteBtn}</td>
    `;
    tbody.appendChild(tr);
  });
  
  lucide.createIcons();
}

window.deleteEmployee = function(userId) {
  if (confirm("Are you sure you want to delete this employee? This action is irreversible and will delete all their assigned tasks.")) {
    let users = db.getUsers();
    let tasks = db.getTasks();

    const employeeToDelete = users.find(u => u.id === userId);
    if (!employeeToDelete) return;

    // Check if employee has direct reports (is a manager)
    const hasReports = users.some(u => u.reportingManagerId === userId);
    if (hasReports) {
      showToast("Cannot delete this manager because employees report to them. Re-assign their reports first.", "error");
      return;
    }

    // Remove tasks
    tasks = tasks.filter(t => t.assigneeId !== userId);
    db.saveTasks(tasks);

    // Remove user
    users = users.filter(u => u.id !== userId);
    db.saveUsers(users);

    db.logActivity(`Staff account '${employeeToDelete.fullname}' was deleted by Admin.`, "danger");
    showToast(`Deleted ${employeeToDelete.fullname} successfully.`, "success");
    renderEmployeesTab();
  }
};

// --------------------------------------------------------------------------
// 7. Tab 4: Tasks Board rendering
// --------------------------------------------------------------------------

function renderTasksTab() {
  const users = db.getUsers();
  const tasks = db.getTasks();

  // Get filter/sort element values
  const searchVal = document.getElementById("task-search-input").value.trim().toLowerCase();
  const priorityVal = document.getElementById("task-priority-filter").value;
  const sortVal = document.getElementById("task-sort-select").value;

  // Filter tasks list
  let processedTasks = [...tasks];

  if (searchVal) {
    processedTasks = processedTasks.filter(t => 
      t.title.toLowerCase().includes(searchVal) || 
      t.description.toLowerCase().includes(searchVal)
    );
  }

  if (priorityVal && priorityVal !== "all") {
    processedTasks = processedTasks.filter(t => t.priority === priorityVal);
  }

  // Sort tasks
  if (sortVal === "dueDate") {
    processedTasks.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  } else if (sortVal === "priority") {
    const priorityWeight = { "Critical": 4, "High": 3, "Medium": 2, "Low": 1 };
    processedTasks.sort((a, b) => {
      const weightA = priorityWeight[a.priority] || 0;
      const weightB = priorityWeight[b.priority] || 0;
      return weightB - weightA;
    });
  }

  const openModalBtn = document.getElementById("open-create-task-modal");
  const adminView = document.getElementById("admin-manager-tasks-view");
  const employeeView = document.getElementById("employee-tasks-view");
  const boardDesc = document.getElementById("tasks-board-desc");

  // Show "Create Task" button for Admin & Manager
  if (currentUser.role === "Admin" || currentUser.role === "Manager") {
    openModalBtn.classList.remove("hidden");
    adminView.classList.remove("hidden");
    employeeView.classList.add("hidden");
    boardDesc.textContent = "Assign tasks to team members and monitor their progress tracker.";
    
    renderTeamTasksTable(users, processedTasks);
  } else {
    // Employee view: Kanban board
    openModalBtn.classList.add("hidden");
    adminView.classList.add("hidden");
    employeeView.classList.remove("hidden");
    boardDesc.textContent = "Manage your assigned deliverables. Click options to progress task status.";
    
    renderKanbanBoard(processedTasks);
  }
}

// Render Table for Admin / Manager
function renderTeamTasksTable(users, tasks) {
  const tbody = document.getElementById("tasks-table-body");
  const assigneeFilter = document.getElementById("task-assignee-filter");
  const activeFilterVal = assigneeFilter.value;
  
  tbody.innerHTML = "";

  // Filter list of assignees in dropdown depending on role
  // Admin: can assign to anyone. Manager: can assign to subordinates only.
  let allowedAssignees = [];
  if (currentUser.role === "Admin") {
    // All users except Admin themselves (typically)
    allowedAssignees = users.filter(u => u.id !== currentUser.id);
  } else {
    // Only Manager's subordinates
    allowedAssignees = getSubordinates(currentUser.id, users);
  }

  // Update assignee filter dropdown options
  assigneeFilter.innerHTML = '<option value="all">All Assignees</option>';
  allowedAssignees.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = `${u.fullname} (${u.role})`;
    if (u.id === activeFilterVal) opt.selected = true;
    assigneeFilter.appendChild(opt);
  });

  // Determine tasks to show:
  // Admin: see all tasks
  // Manager: see tasks assigned to their subordinates OR assigned by them
  let visibleTasks = [];
  if (currentUser.role === "Admin") {
    visibleTasks = tasks;
  } else {
    const subordinateIds = allowedAssignees.map(a => a.id);
    visibleTasks = tasks.filter(
      t => subordinateIds.includes(t.assigneeId) || t.assignedById === currentUser.id
    );
  }

  // Apply quick filter
  const filterVal = assigneeFilter.value;
  if (filterVal !== "all") {
    visibleTasks = visibleTasks.filter(t => t.assigneeId === filterVal);
  }

  visibleTasks.forEach(t => {
    const assignee = users.find(u => u.id === t.assigneeId);
    const assigneeName = assignee ? assignee.fullname : "Unknown User";
    const reportingMgr = assignee ? users.find(mgr => mgr.id === assignee.reportingManagerId) : null;
    const reportingName = reportingMgr ? reportingMgr.fullname : "None";
    
    const tr = document.createElement("tr");
    
    // Status Badge classes
    let statusClass = "warning";
    if (t.status === "In Progress") statusClass = "info";
    else if (t.status === "Under Review") statusClass = "review";
    else if (t.status === "Completed") statusClass = "success";

    tr.innerHTML = `
      <td>
        <div style="font-weight:600;">${t.title}</div>
        <div style="font-size:0.8rem; color:var(--text-secondary); max-width: 320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${t.description}
        </div>
      </td>
      <td><strong>${assigneeName}</strong></td>
      <td><span class="task-priority-badge priority-${t.priority.toLowerCase()}">${t.priority}</span></td>
      <td><span class="task-due-date"><i data-lucide="calendar"></i> ${t.dueDate}</span></td>
      <td><span class="status-pill ${statusClass}-status">${t.status}</span></td>
      <td><strong>${reportingName}</strong></td>
      <td>
        <div style="display:flex; gap:6px; justify-content:center;">
          <button class="btn btn-secondary" style="padding: 6px 12px; font-size:0.85rem;" onclick="openTaskDetails('${t.id}')">
            <i data-lucide="eye" style="width:14px; height:14px;"></i> Details
          </button>
          <button class="btn btn-danger btn-logout" style="padding: 6px 12px; font-size:0.85rem;" onclick="deleteTask('${t.id}')">
            <i data-lucide="trash-2" style="width:14px; height:14px;"></i> Cancel
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  lucide.createIcons();
}

window.deleteTask = function(taskId) {
  if (confirm("Are you sure you want to cancel and delete this task?")) {
    let tasks = db.getTasks();
    const taskToDelete = tasks.find(t => t.id === taskId);
    if (!taskToDelete) return;

    tasks = tasks.filter(t => t.id !== taskId);
    db.saveTasks(tasks);
    
    db.logActivity(`Task '${taskToDelete.title}' was deleted.`, "danger");
    showToast("Task cancelled successfully.", "success");
    renderTasksTab();
  }
};

// Render Kanban Board for Employee
function renderKanbanBoard(tasks) {
  const myTasks = tasks.filter(t => t.assigneeId === currentUser.id);

  // Clear columns
  const cols = {
    "Pending": document.getElementById("cards-pending"),
    "In Progress": document.getElementById("cards-in-progress"),
    "Under Review": document.getElementById("cards-review"),
    "Completed": document.getElementById("cards-completed")
  };
  
  cols["Pending"].innerHTML = "";
  cols["In Progress"].innerHTML = "";
  cols["Under Review"].innerHTML = "";
  cols["Completed"].innerHTML = "";

  const counts = { "Pending": 0, "In Progress": 0, "Under Review": 0, "Completed": 0 };

  myTasks.forEach(t => {
    if (!cols[t.status]) return;
    counts[t.status]++;
    const card = document.createElement("div");
    card.className = "task-card";
    card.setAttribute("onclick", `openTaskDetails('${t.id}')`);
    card.style.cursor = "pointer";
    
    // Check for feedback
    let feedbackBadge = "";
    if (t.status === "In Progress" && t.feedback) {
      feedbackBadge = `
        <div style="margin-top: 8px; font-size: 0.75rem; color: var(--color-danger); display: flex; align-items: center; gap: 4px; font-weight: 600;">
          <i data-lucide="alert-circle" style="width: 12px; height: 12px;"></i> Changes Requested
        </div>
      `;
    }

    card.innerHTML = `
      <div class="task-card-header">
        <h4>${t.title}</h4>
        <span class="task-priority-badge priority-${t.priority.toLowerCase()}">${t.priority}</span>
      </div>
      <p class="task-card-desc">${t.description}</p>
      ${feedbackBadge}
      <div class="task-card-footer" style="margin-top: 12px;">
        <span class="task-due-date"><i data-lucide="calendar"></i> ${t.dueDate}</span>
        <div class="task-actions-wrap">
          <span class="text-accent" style="font-size: 0.8rem; font-weight: 500; display: flex; align-items: center; gap: 4px;">
            Details <i data-lucide="chevron-right" style="width:12px; height:12px;"></i>
          </span>
        </div>
      </div>
    `;
    
    cols[t.status].appendChild(card);
  });

  // Update counts
  document.getElementById("count-pending").textContent = counts["Pending"];
  document.getElementById("count-in-progress").textContent = counts["In Progress"];
  document.getElementById("count-review").textContent = counts["Under Review"];
  document.getElementById("count-completed").textContent = counts["Completed"];
  
  lucide.createIcons();
}

window.updateTaskStatus = function(taskId, newStatus) {
  const tasks = db.getTasks();
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  
  if (taskIndex !== -1) {
    const oldStatus = tasks[taskIndex].status;
    tasks[taskIndex].status = newStatus;
    db.saveTasks(tasks);

    db.logActivity(`Task '${tasks[taskIndex].title}' moved from ${oldStatus} to ${newStatus}.`, "success");
    showToast(`Task moved to ${newStatus}!`, "success");
    renderTasksTab();
  }
};

// --------------------------------------------------------------------------
// 8. Modals Management (Admin / Manager Actions)
// --------------------------------------------------------------------------

// Employee Modal Control
function openEmployeeModal() {
  const modal = document.getElementById("add-employee-modal");
  const managerSelect = document.getElementById("new-manager");
  const users = db.getUsers();

  // Populate Reporting Manager select
  // Hierarchy rules:
  // Managers can report to Admin. Employees can report to Managers.
  // We can let new Managers/Employees report to Admin, or Employees report to Managers.
  // So the selectable reporting line includes: Admin + Managers.
  managerSelect.innerHTML = "";
  
  const managers = users.filter(u => u.role === "Admin" || u.role === "Manager");
  managers.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = `${m.fullname} (${m.role})`;
    managerSelect.appendChild(opt);
  });

  modal.classList.remove("hidden");
  document.getElementById("add-employee-form").reset();
  lucide.createIcons();
}

function closeEmployeeModal() {
  document.getElementById("add-employee-modal").classList.add("hidden");
}

function handleAddEmployee(e) {
  e.preventDefault();
  
  const fullname = document.getElementById("new-fullname").value.trim();
  const username = document.getElementById("new-username").value.trim().toLowerCase();
  const password = document.getElementById("new-password").value;
  const role = document.getElementById("new-role").value;
  const reportingManagerId = document.getElementById("new-manager").value;

  const users = db.getUsers();
  
  // Validation: unique username
  if (users.some(u => u.username === username)) {
    showToast("Username already exists. Try another.", "error");
    return;
  }

  // Create new user entity
  const newUser = {
    id: "usr-" + Date.now(),
    username,
    password,
    fullname,
    role,
    reportingManagerId,
    status: "Active",
    availabilityStatus: "Active"
  };

  users.push(newUser);
  db.saveUsers(users);

  db.logActivity(`New ${role} profile '${fullname}' added by Admin.`, "success");
  showToast(`${role} profile created successfully!`, "success");
  closeEmployeeModal();
  renderEmployeesTab();
}

// Task Modal Control
function openTaskModal() {
  const modal = document.getElementById("create-task-modal");
  const assigneeSelect = document.getElementById("task-assignee");
  const users = db.getUsers();

  assigneeSelect.innerHTML = "";

  // Assignee filtering logic based on Hierarchy:
  // Admin: can assign tasks to Managers and Employees (everyone).
  // Manager: can assign tasks ONLY to employees reporting to them.
  let assignees = [];
  if (currentUser.role === "Admin") {
    assignees = users.filter(u => u.id !== currentUser.id); // exclude admin
  } else {
    assignees = getSubordinates(currentUser.id, users);
  }

  if (assignees.length === 0) {
    showToast("You don't have any subordinates to assign tasks to.", "error");
    return;
  }

  assignees.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.fullname} (${a.role})`;
    assigneeSelect.appendChild(opt);
  });

  // Set default due date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById("task-duedate").value = tomorrow.toISOString().split('T')[0];

  modal.classList.remove("hidden");
  document.getElementById("create-task-form").reset();
  lucide.createIcons();
}

function closeTaskModal() {
  document.getElementById("create-task-modal").classList.add("hidden");
}

function handleCreateTask(e) {
  e.preventDefault();

  const title = document.getElementById("task-title").value.trim();
  const description = document.getElementById("task-desc").value.trim();
  const assigneeId = document.getElementById("task-assignee").value;
  const priority = document.getElementById("task-priority").value;
  const dueDate = document.getElementById("task-duedate").value;
  const referenceLink = document.getElementById("task-reference-link").value.trim();

  const tasks = db.getTasks();
  const users = db.getUsers();
  const assigneeUser = users.find(u => u.id === assigneeId);

  const newTask = {
    id: "tsk-" + Date.now(),
    title,
    description,
    assigneeId,
    priority,
    dueDate,
    status: "Pending",
    assignedById: currentUser.id,
    referenceLink,
    deliverableLink: "",
    feedback: "",
    comments: []
  };

  tasks.push(newTask);
  db.saveTasks(tasks);

  db.logActivity(`Task '${title}' assigned to ${assigneeUser.fullname} by ${currentUser.fullname}.`, "info");
  showToast("Task assigned successfully!", "success");
  closeTaskModal();
  renderTasksTab();
}

// --------------------------------------------------------------------------
// 8.5. Detailed Task Modal & Workflow Feedback Loop
// --------------------------------------------------------------------------

let currentDetailedTaskId = null;

window.openTaskDetails = function(taskId) {
  currentDetailedTaskId = taskId;
  const tasks = db.getTasks();
  const users = db.getUsers();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  const assignee = users.find(u => u.id === task.assigneeId);
  const creator = users.find(u => u.id === task.assignedById);

  // Set Title and Description
  document.getElementById("detail-task-title").textContent = task.title;
  document.getElementById("detail-task-desc").textContent = task.description;

  // Set Priority badge
  const priorityBadge = document.getElementById("detail-task-priority");
  priorityBadge.textContent = task.priority.toUpperCase();
  priorityBadge.className = `task-priority-badge priority-${task.priority.toLowerCase()}`;

  // Set due date, assignee, creator
  document.getElementById("detail-task-duedate").textContent = task.dueDate || "N/A";
  document.getElementById("detail-task-assignee").textContent = assignee ? assignee.fullname : "Unknown User";
  document.getElementById("detail-task-creator").textContent = creator ? creator.fullname : "System / Unknown";

  // Set Reference Link
  const refLinkContainer = document.getElementById("detail-reference-link-container");
  if (task.referenceLink) {
    refLinkContainer.innerHTML = `<a href="${task.referenceLink}" target="_blank" class="text-accent" style="display:inline-flex; align-items:center; gap:4px; font-weight:600;"><i data-lucide="external-link" style="width:14px; height:14px;"></i> View Reference</a>`;
  } else {
    refLinkContainer.innerHTML = `<span class="text-muted">None Provided</span>`;
  }

  // Set Deliverable Link
  const delLinkContainer = document.getElementById("detail-deliverable-link-container");
  if (currentUser.role === "Employee" && task.status === "In Progress") {
    // Input field so employee can submit/change deliverable URL
    delLinkContainer.innerHTML = `
      <input type="url" id="detail-deliverable-input" value="${task.deliverableLink || ''}" placeholder="https://github.com/..." style="width:100%; padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); color: var(--text-primary); background: transparent; font-family: var(--font-body); font-size: 0.85rem;">
    `;
  } else {
    if (task.deliverableLink) {
      delLinkContainer.innerHTML = `<a href="${task.deliverableLink}" target="_blank" style="color:var(--color-success); display:inline-flex; align-items:center; gap:4px; font-weight:600;"><i data-lucide="external-link" style="width:14px; height:14px;"></i> View Deliverable</a>`;
    } else {
      delLinkContainer.innerHTML = `<span class="text-muted">No deliverable submitted</span>`;
    }
  }

  // Rejection Feedback Alert
  const feedbackAlert = document.getElementById("detail-feedback-alert");
  const feedbackText = document.getElementById("detail-feedback-text");
  if (task.feedback) {
    feedbackAlert.classList.remove("hidden");
    feedbackText.textContent = task.feedback;
  } else {
    feedbackAlert.classList.add("hidden");
  }

  // Hide reject textarea container initially
  document.getElementById("detail-reject-textarea-container").classList.add("hidden");
  document.getElementById("detail-reject-feedback").value = "";

  // Set up workflow actions depending on roles
  const workflowActions = document.getElementById("detail-workflow-actions");
  workflowActions.innerHTML = "";

  if (currentUser.role === "Employee") {
    if (task.status === "Pending") {
      workflowActions.innerHTML = `
        <button class="btn btn-primary glow-btn" onclick="updateTaskStatusInModal('${task.id}', 'In Progress')">
          <i data-lucide="play"></i> Start Working on Task
        </button>
      `;
    } else if (task.status === "In Progress") {
      workflowActions.innerHTML = `
        <div style="display:flex; gap:10px;">
          <button class="btn btn-secondary" onclick="updateTaskStatusInModal('${task.id}', 'Pending')">Revert to Pending</button>
          <button class="btn btn-primary glow-btn" onclick="submitTaskForReviewInModal('${task.id}')">
            <i data-lucide="arrow-up-right"></i> Submit for Manager Review
          </button>
        </div>
      `;
    } else if (task.status === "Under Review") {
      workflowActions.innerHTML = `
        <p style="font-size:0.9rem; color:var(--color-info); display:flex; align-items:center; gap:6px; font-weight:500;">
          <i data-lucide="clock" style="width:16px; height:16px;"></i> Awaiting Manager Approval and Completion Sign-off.
        </p>
      `;
    } else if (task.status === "Completed") {
      workflowActions.innerHTML = `
        <p style="font-size:0.9rem; color:var(--color-success); display:flex; align-items:center; gap:6px; font-weight:500;">
          <i data-lucide="check-circle-2" style="width:16px; height:16px;"></i> Task Approved & Completed successfully.
        </p>
      `;
    }
  } else {
    // Admin or Manager
    // Can approve or request changes on tasks that are Under Review
    const isSubordinate = currentUser.role === "Admin" || (assignee && assignee.reportingManagerId === currentUser.id) || task.assignedById === currentUser.id;
    
    if (isSubordinate) {
      if (task.status === "Under Review") {
        workflowActions.innerHTML = `
          <div style="display:flex; gap:10px;">
            <button class="btn btn-danger" onclick="showRejectFeedbackInput()"><i data-lucide="x-circle"></i> Request Changes</button>
            <button class="btn btn-primary glow-btn" onclick="approveTaskInModal('${task.id}')"><i data-lucide="check-circle-2"></i> Approve & Complete</button>
          </div>
        `;
      } else if (task.status === "Pending" || task.status === "In Progress") {
        workflowActions.innerHTML = `
          <p style="font-size:0.9rem; color:var(--text-secondary); display:flex; align-items:center; gap:6px;">
            <i data-lucide="loader" class="text-accent" style="width:16px; height:16px; animation: spin 2s linear infinite;"></i> Task is currently in progress by ${assignee ? assignee.fullname.split(' ')[0] : 'assignee'}.
          </p>
        `;
      } else if (task.status === "Completed") {
        workflowActions.innerHTML = `
          <p style="font-size:0.9rem; color:var(--color-success); display:flex; align-items:center; gap:6px; font-weight:500;">
            <i data-lucide="check-circle-2" style="width:16px; height:16px;"></i> Task completed.
          </p>
        `;
      }
    } else {
      // Just viewing task details without review privileges
      workflowActions.innerHTML = `
        <p style="font-size:0.9rem; color:var(--text-secondary);">
          Viewing task of ${assignee ? assignee.fullname : 'staff'}. Status: <strong>${task.status}</strong>
        </p>
      `;
    }
  }

  // Render Comments List
  const commentsList = document.getElementById("detail-comments-list");
  commentsList.innerHTML = "";
  if (task.comments && task.comments.length > 0) {
    task.comments.forEach(c => {
      const div = document.createElement("div");
      div.className = "comment-item";
      const commentTime = new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const commentDate = new Date(c.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.75rem; font-weight: 600;">
          <span>${c.author}</span>
          <span class="text-muted">${commentDate} at ${commentTime}</span>
        </div>
        <div style="color:var(--text-primary); font-size:0.85rem; line-height: 1.4;">${c.text}</div>
      `;
      commentsList.appendChild(div);
    });
    // Scroll comments to bottom
    setTimeout(() => {
      commentsList.scrollTop = commentsList.scrollHeight;
    }, 50);
  } else {
    commentsList.innerHTML = `<p class="text-muted" style="font-size:0.85rem; text-align:center; padding: 10px;">No comments posted yet.</p>`;
  }

  // Show modal
  document.getElementById("task-details-modal").classList.remove("hidden");
  lucide.createIcons();
};

window.closeTaskDetailsModal = function() {
  document.getElementById("task-details-modal").classList.add("hidden");
  currentDetailedTaskId = null;
};

// Helper inside modal to update task status (like Pending <-> In Progress)
window.updateTaskStatusInModal = function(taskId, newStatus) {
  const tasks = db.getTasks();
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex !== -1) {
    const oldStatus = tasks[taskIndex].status;
    tasks[taskIndex].status = newStatus;
    db.saveTasks(tasks);
    db.logActivity(`Task '${tasks[taskIndex].title}' moved from ${oldStatus} to ${newStatus}.`, "success");
    showToast(`Task status moved to ${newStatus}!`, "success");
    
    // Refresh modal and main tab
    openTaskDetails(taskId);
    renderTasksTab();
    renderOverviewTab(); // refresh stats
  }
};

// Employee submission inside modal
window.submitTaskForReviewInModal = function(taskId) {
  const delInput = document.getElementById("detail-deliverable-input");
  const deliverableUrl = delInput ? delInput.value.trim() : "";
  
  if (!deliverableUrl) {
    showToast("Please provide a deliverable link before submitting.", "error");
    return;
  }

  const tasks = db.getTasks();
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex !== -1) {
    tasks[taskIndex].status = "Under Review";
    tasks[taskIndex].deliverableLink = deliverableUrl;
    tasks[taskIndex].feedback = ""; // clear any previous feedback
    
    db.saveTasks(tasks);
    db.logActivity(`Task '${tasks[taskIndex].title}' submitted for review by ${currentUser.fullname}.`, "info");
    showToast("Task submitted successfully for review!", "success");

    // Refresh modal and main tab
    openTaskDetails(taskId);
    renderTasksTab();
    renderOverviewTab();
  }
};

// Manager Approval inside modal
window.approveTaskInModal = function(taskId) {
  const tasks = db.getTasks();
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex !== -1) {
    tasks[taskIndex].status = "Completed";
    tasks[taskIndex].feedback = ""; // clear feedback
    db.saveTasks(tasks);
    db.logActivity(`Task '${tasks[taskIndex].title}' approved and marked completed by ${currentUser.fullname}.`, "success");
    showToast("Task approved and marked as completed!", "success");

    // Refresh modal and main tab
    openTaskDetails(taskId);
    renderTasksTab();
    renderOverviewTab();
  }
};

// Show Manager Reject feedback input form
window.showRejectFeedbackInput = function() {
  document.getElementById("detail-reject-textarea-container").classList.remove("hidden");
  // Scroll modal card down to make form visible
  const modalBody = document.querySelector("#task-details-modal .modal-card");
  if (modalBody) {
    setTimeout(() => {
      modalBody.scrollTop = modalBody.scrollHeight;
    }, 50);
  }
};

window.cancelRejectFeedback = function() {
  document.getElementById("detail-reject-textarea-container").classList.add("hidden");
  document.getElementById("detail-reject-feedback").value = "";
};

window.submitRejectTask = function(taskId) {
  const fbInput = document.getElementById("detail-reject-feedback");
  const feedbackText = fbInput ? fbInput.value.trim() : "";

  if (!feedbackText) {
    showToast("Please provide feedback explaining the changes requested.", "error");
    return;
  }

  const tasks = db.getTasks();
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex !== -1) {
    tasks[taskIndex].status = "In Progress";
    tasks[taskIndex].feedback = feedbackText; // set rejection feedback
    db.saveTasks(tasks);
    db.logActivity(`Task '${tasks[taskIndex].title}' changes requested by ${currentUser.fullname}.`, "warning");
    showToast("Changes requested! Task sent back to assignee.", "info");

    // Refresh modal and main tab
    openTaskDetails(taskId);
    renderTasksTab();
    renderOverviewTab();
  }
};

// --------------------------------------------------------------------------
// 8.6. Settings Tab Panel Render Controller
// --------------------------------------------------------------------------

function renderSettingsTab() {
  const curStatus = currentUser.availabilityStatus || "Active";
  
  // Show/Hide password change based on role
  const passCard = document.getElementById("change-password-card");
  const statusCard = document.getElementById("duty-status-card");
  
  if (currentUser.role === "Employee") {
    passCard.classList.add("hidden");
    statusCard.style.gridColumn = "span 2";
  } else {
    passCard.classList.remove("hidden");
    statusCard.style.gridColumn = "";
  }

  // Set selected value in dropdown
  document.getElementById("settings-status-select").value = curStatus;
  
  // Set badge text & styling
  const badge = document.getElementById("settings-current-status-badge");
  badge.textContent = curStatus;
  badge.className = "badge";
  if (curStatus === "Active") {
    badge.style.color = "var(--color-success)";
    badge.style.borderColor = "rgba(16, 185, 129, 0.3)";
    badge.style.backgroundColor = "rgba(16, 185, 129, 0.15)";
  } else if (curStatus === "On Leave") {
    badge.style.color = "var(--color-warning)";
    badge.style.borderColor = "rgba(245, 158, 11, 0.3)";
    badge.style.backgroundColor = "rgba(245, 158, 11, 0.15)";
  } else {
    badge.style.color = "var(--color-danger)";
    badge.style.borderColor = "rgba(239, 68, 68, 0.3)";
    badge.style.backgroundColor = "rgba(239, 68, 68, 0.15)";
  }
}

// --------------------------------------------------------------------------
// 9. Toast Notification System
// --------------------------------------------------------------------------

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let icon = "check-circle-2";
  if (type === "error") icon = "alert-circle";
  if (type === "info") icon = "info";

  toast.innerHTML = `
    <i data-lucide="${icon}"></i>
    <div>${message}</div>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  // Animation dismissal
  setTimeout(() => {
    toast.style.animation = "slideInRight 0.3s reverse forwards";
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

// --------------------------------------------------------------------------
// 10. Theme Management & Settings
// --------------------------------------------------------------------------

function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  
  html.setAttribute("data-theme", newTheme);
  localStorage.setItem("medastrax_theme", newTheme);
  
  updateThemeIcons(newTheme);
  showToast(`Switched to ${newTheme} workspace theme.`, "info");

  // Redraw performance chart if active, to update its dark/light colors
  if (currentUser) {
    const activeLink = document.querySelector(".nav-link.active");
    if (activeLink && activeLink.getAttribute("data-tab") === "performance") {
      renderPerformanceTab();
    }
  }
}

function updateThemeIcons(theme) {
  const sunIcon = document.getElementById("theme-icon-sun");
  const moonIcon = document.getElementById("theme-icon-moon");
  
  if (theme === "dark") {
    sunIcon.classList.remove("hidden");
    moonIcon.classList.add("hidden");
  } else {
    sunIcon.classList.add("hidden");
    moonIcon.classList.remove("hidden");
  }
  lucide.createIcons();
}

// Custom Healthtech ECG Heartbeat Animation
function initECG() {
  const canvas = document.getElementById("ecg-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  
  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;
  
  window.addEventListener("resize", () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const speed = 3.5;
  const maxPoints = Math.ceil(width / speed);
  const points = [];
  
  // Normalized ECG PQRST heartbeat waveform offsets
  const ecgProfile = [
    0, 0, 0, 0, 0,
    -2, -4, -2, 0, 0,      // P Bump
    0, 0,
    3, 6,                  // Q Dip
    -25, -55, -35, 20, 30, 15, 0, // R Spike & S Dip
    0, 0,
    -4, -7, -4, 0, 0,      // T Bump
    0, 0, 0, 0, 0
  ];
  
  let profileIndex = -1;
  let frameCount = 0;

  function animate() {
    if (canvas.classList.contains("hidden")) {
      requestAnimationFrame(animate);
      return;
    }
    ctx.clearRect(0, 0, width, height);

    frameCount++;
    // Trigger heartbeat pulse every 2.5 seconds (approx 150 frames)
    if (frameCount % 150 === 0) {
      profileIndex = 0;
    }

    let yVal = height / 2;
    if (profileIndex >= 0 && profileIndex < ecgProfile.length) {
      yVal += ecgProfile[profileIndex] * (height / 550 + 0.6);
      profileIndex++;
    } else {
      profileIndex = -1;
      // Tiny natural bio-sensor noise
      yVal += (Math.random() - 0.5) * 1.5;
    }

    points.push(yVal);
    if (points.length > maxPoints) {
      points.shift();
    }

    // Render faded scrolling segments
    ctx.lineWidth = 2.2;
    ctx.shadowBlur = 6;
    ctx.shadowColor = "#00a896";

    for (let i = 1; i < points.length; i++) {
      const x1 = (i - 1) * speed;
      const y1 = points[i - 1];
      const x2 = i * speed;
      const y2 = points[i];

      const alpha = i / points.length;
      ctx.strokeStyle = `rgba(0, 168, 150, ${alpha * 0.65})`;
      
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Leading sensor light dot
    if (points.length > 0) {
      const headX = (points.length - 1) * speed;
      const headY = points[points.length - 1];
      
      ctx.beginPath();
      ctx.arc(headX, headY, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#00a896";
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#00a896";
      ctx.fill();
    }

    requestAnimationFrame(animate);
  }
  
  // Pre-seed baseline points
  for (let i = 0; i < maxPoints; i++) {
    points.push(height / 2);
  }

  animate();
}

// --------------------------------------------------------------------------
// 11. Core Event Listeners Initialization
// --------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  // Init Local Storage DB
  initDatabase();

  // Init background ECG heartbeat animation
  initECG();

  // Check saved theme (defaulting to light as requested)
  const savedTheme = localStorage.getItem("medastrax_theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcons(savedTheme);

  // Authentication Flow
  const loginForm = document.getElementById("login-form");
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const userVal = document.getElementById("username").value.trim();
    const passVal = document.getElementById("password").value;
    handleLogin(userVal, passVal);
  });

  const logoutBtn = document.getElementById("logout-btn");
  logoutBtn.addEventListener("click", handleLogout);

  // Back to portals list action
  const backToPortalsBtn = document.getElementById("back-to-portals");
  backToPortalsBtn.addEventListener("click", () => {
    const portalSelector = document.getElementById("portal-selector");
    const loginCardWrapper = document.getElementById("login-card-wrapper");

    // Reset animation classes
    loginCardWrapper.className = "login-card";
    portalSelector.className = "portal-select-container hidden";

    // Slide out form to right
    loginCardWrapper.classList.add("slide-out-right");

    // Wait for slide-out, then slide-in selector from left
    setTimeout(() => {
      loginCardWrapper.classList.add("hidden");
      loginCardWrapper.classList.remove("slide-out-right");

      portalSelector.classList.remove("hidden");
      portalSelector.classList.add("slide-in-left");
      
      document.getElementById("login-form").reset();

      setTimeout(() => {
        portalSelector.classList.remove("slide-in-left");
      }, 400);
    }, 250);
  });

  // Tab switching links
  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const tabId = link.getAttribute("data-tab");
      switchTab(tabId);
    });
  });

  // Modal Open Buttons
  document.getElementById("open-add-employee-modal").addEventListener("click", openEmployeeModal);
  document.getElementById("open-create-task-modal").addEventListener("click", openTaskModal);

  // Modal Close Actions
  document.getElementById("close-employee-modal").addEventListener("click", closeEmployeeModal);
  document.getElementById("cancel-employee-btn").addEventListener("click", closeEmployeeModal);
  
  document.getElementById("close-task-modal").addEventListener("click", closeTaskModal);
  document.getElementById("cancel-task-btn").addEventListener("click", closeTaskModal);

  // Modal Form Submissions
  document.getElementById("add-employee-form").addEventListener("submit", handleAddEmployee);
  document.getElementById("create-task-form").addEventListener("submit", handleCreateTask);

  // Directory Filters
  const searchInput = document.getElementById("employee-search");
  searchInput.addEventListener("input", renderEmployeesTab);

  const roleFilterSelect = document.getElementById("filter-role-select");
  roleFilterSelect.addEventListener("change", renderEmployeesTab);

  // Tasks Filter
  const taskAssigneeFilter = document.getElementById("task-assignee-filter");
  taskAssigneeFilter.addEventListener("change", renderTasksTab);

  document.getElementById("task-search-input").addEventListener("input", renderTasksTab);
  document.getElementById("task-priority-filter").addEventListener("change", renderTasksTab);
  document.getElementById("task-sort-select").addEventListener("change", renderTasksTab);

  // Performance Chart Filters
  document.getElementById("perf-role-filter").addEventListener("change", renderPerformanceTab);
  document.getElementById("perf-priority-filter").addEventListener("change", renderPerformanceTab);
  document.getElementById("perf-date-filter").addEventListener("change", renderPerformanceTab);

  // Detailed Task Modal Event Listeners
  document.getElementById("close-detail-modal").addEventListener("click", closeTaskDetailsModal);
  document.getElementById("close-detail-modal-footer").addEventListener("click", closeTaskDetailsModal);
  document.getElementById("cancel-reject-submit-btn").addEventListener("click", cancelRejectFeedback);
  document.getElementById("confirm-reject-submit-btn").addEventListener("click", () => {
    if (currentDetailedTaskId) {
      submitRejectTask(currentDetailedTaskId);
    }
  });

  // Comments form submission
  document.getElementById("add-comment-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const textInput = document.getElementById("new-comment-input");
    const text = textInput.value.trim();
    if (!text || !currentDetailedTaskId) return;

    const tasks = db.getTasks();
    const taskIndex = tasks.findIndex(t => t.id === currentDetailedTaskId);
    if (taskIndex !== -1) {
      if (!tasks[taskIndex].comments) {
        tasks[taskIndex].comments = [];
      }
      tasks[taskIndex].comments.push({
        author: currentUser.fullname,
        text: text,
        timestamp: new Date().toISOString()
      });
      db.saveTasks(tasks);
      textInput.value = "";
      
      openTaskDetails(currentDetailedTaskId);
      db.logActivity(`${currentUser.fullname} commented on task '${tasks[taskIndex].title}'.`, "info");
    }
  });

  // Settings: Change Password Form
  document.getElementById("change-password-form").addEventListener("submit", (e) => {
    e.preventDefault();
    
    const currentPass = document.getElementById("settings-current-pass").value;
    const newPass = document.getElementById("settings-new-pass").value;
    const confirmPass = document.getElementById("settings-confirm-pass").value;
    
    if (currentPass !== currentUser.password) {
      showToast("Current password is incorrect.", "error");
      return;
    }
    
    if (newPass !== confirmPass) {
      showToast("Confirm password does not match new password.", "error");
      return;
    }
    
    if (newPass === currentPass) {
      showToast("New password must be different from current password.", "error");
      return;
    }
    
    const users = db.getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser.id);
    if (userIndex !== -1) {
      users[userIndex].password = newPass;
      db.saveUsers(users);
      
      currentUser.password = newPass;
      sessionStorage.setItem("medastrax_current_user", JSON.stringify(currentUser));
      
      showToast("Password updated successfully!", "success");
      db.logActivity(`${currentUser.fullname} changed their workspace password.`, "success");
      
      document.getElementById("change-password-form").reset();
    }
  });

  // Settings: Duty Status Dropdown
  document.getElementById("settings-status-select").addEventListener("change", () => {
    const statusSelect = document.getElementById("settings-status-select");
    const newStatus = statusSelect.value;
    
    const users = db.getUsers();
    const userIndex = users.findIndex(u => u.id === currentUser.id);
    if (userIndex !== -1) {
      users[userIndex].availabilityStatus = newStatus;
      db.saveUsers(users);
      
      currentUser.availabilityStatus = newStatus;
      sessionStorage.setItem("medastrax_current_user", JSON.stringify(currentUser));
      
      showToast(`Duty status updated to ${newStatus}!`, "success");
      db.logActivity(`${currentUser.fullname} changed duty status to ${newStatus}.`, "info");
      
      renderSettingsTab();
      renderOverviewTab();
    }
  });

  // Theme Toggle Button
  document.getElementById("theme-toggle").addEventListener("click", toggleTheme);

  // Password Visibility Toggle
  const togglePassBtn = document.getElementById("toggle-password");
  const passInput = document.getElementById("password");
  togglePassBtn.addEventListener("click", () => {
    const type = passInput.getAttribute("type") === "password" ? "text" : "password";
    passInput.setAttribute("type", type);
    const icon = togglePassBtn.querySelector("i");
    icon.setAttribute("data-lucide", type === "password" ? "eye" : "eye-off");
    lucide.createIcons();
  });

  // Perform initial session auth check
  checkAuth();
});
