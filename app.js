/**



 * ==========================================================================



 * MEDASTRAX WORKSPACE PORTAL CORE LOGIC



 * Role-Based Access, Dynamic Hierarchies & Task Management System



 * ==========================================================================



 */
// ðŸš€ [MedAstraX] Version 2.5 - PostgreSQL Mode Active
console.log("ðŸš€ [MedAstraX] Version 2.5 - PostgreSQL Mode Active");



// 1. Database Seeding & Mock Data



// --------------------------------------------------------------------------








// All real users are seeded and managed via the PostgreSQL backend (server.js).
// Fake/placeholder users (Alok Verma, Vikram, Neha, Aman, Priya, Rohan) have been removed.

const socket = io();

let activeChatEmployee = null;
const renderedMessageIds = new Set();

socket.on("connect", () => {
  console.log("SOCKET CONNECTED:", socket.id);
});

function appendSingleMessage(container, msg, currentUserName) {
  const isSentByMe = msg.sender === currentUserName || msg.sender === "Current User";
  const messageEl = document.createElement("div");
  messageEl.className = `message-bubble ${isSentByMe ? 'sent' : 'received'}`;
  if (msg._id) messageEl.setAttribute("data-msg-id", msg._id);

  const textEl = document.createElement("div");
  textEl.className = "message-text";
  textEl.textContent = msg.message;

  const timeEl = document.createElement("span");
  timeEl.className = "message-time";
  const dateObj = msg.createdAt ? new Date(msg.createdAt) : new Date();
  timeEl.textContent = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  messageEl.appendChild(textEl);
  messageEl.appendChild(timeEl);
  container.appendChild(messageEl);
}

const DEFAULT_USERS = [];






// No default tasks â€” all tasks are created by real team members via the portal
const DEFAULT_TASKS = [];

// Default activity log â€” only the system init message is kept
const DEFAULT_ACTIVITIES = [
  {
    id: "act-1",
    timestamp: "2026-06-25T10:00:00.000Z",
    type: "system",
    message: "MedAstraX portal database initialized successfully."
  }
];


// Initialize local database if not exists



function initDatabase() {



  if (!localStorage.getItem("medastrax_users")) {



    localStorage.setItem("medastrax_users", JSON.stringify(DEFAULT_USERS));



  } else {



    // Migration: ensure all existing users have the new fields



    const users = JSON.parse(localStorage.getItem("medastrax_users"));



    let updated = false;



    users.forEach(u => {



      if (u.gmail === undefined) {



        if (u.username === "admin") { u.gmail = "alok.verma@gmail.com"; u.phone = "+91 98765 43210"; u.domain = "Other"; u.aadhar = "1234 5678 9012"; }



        else if (u.username === "manager1") { u.gmail = "vikram.m@gmail.com"; u.phone = "+91 98765 43211"; u.domain = "R&D"; u.aadhar = "2345 6789 0123"; }



        else if (u.username === "manager2") { u.gmail = "neha.sen@gmail.com"; u.phone = "+91 98765 43212"; u.domain = "Marketing"; u.aadhar = "3456 7890 1234"; }



        else if (u.username === "employee1") { u.gmail = "aman.sharma@gmail.com"; u.phone = "+91 98765 43213"; u.domain = "Tech"; u.aadhar = "4567 8901 2345"; }



        else if (u.username === "employee2") { u.gmail = "priya.v@gmail.com"; u.phone = "+91 98765 43214"; u.domain = "Tech"; u.aadhar = "5678 9012 3456"; }



        else if (u.username === "employee3") { u.gmail = "rohan.das@gmail.com"; u.phone = "+91 98765 43215"; u.domain = "Other"; u.aadhar = "6789 0123 4567"; }



        else {



          u.gmail = `${u.username}@gmail.com`;



          u.phone = "+91 90000 00000";



          u.domain = "Other";



          u.aadhar = "0000 0000 0000";



        }



        updated = true;



      }



    });



    if (updated) {



      localStorage.setItem("medastrax_users", JSON.stringify(users));



      



      // Update currentUser session memory if logged in



      const sessionUserStr = sessionStorage.getItem("medastrax_current_user");



      if (sessionUserStr) {



        const sessionUser = JSON.parse(sessionUserStr);



        const freshUser = users.find(u => u.id === sessionUser.id);



        if (freshUser) {



          sessionStorage.setItem("medastrax_current_user", JSON.stringify(freshUser));



        }



      }



    }



  }
  if (!localStorage.getItem("medastrax_tasks")) {
    localStorage.setItem("medastrax_tasks", JSON.stringify(DEFAULT_TASKS));
  }
  if (!localStorage.getItem("medastrax_activities")) {
    localStorage.setItem("medastrax_activities", JSON.stringify(DEFAULT_ACTIVITIES));
  }
  if (!localStorage.getItem("medastrax_leaves")) {
    localStorage.setItem("medastrax_leaves", JSON.stringify([]));
  }
  if (!localStorage.getItem("medastrax_leaves")) {
    localStorage.setItem("medastrax_leaves", JSON.stringify([]));
  }
}
  if (!localStorage.getItem("medastrax_activities")) {
    localStorage.setItem("medastrax_activities", JSON.stringify(DEFAULT_ACTIVITIES));
  }
  if (!localStorage.getItem("medastrax_leaves")) {
}


// Database Helpers

let cachedUsers = [];
let cachedTasks = [];
let cachedLeaves = [];
let cachedActivities = [];
let cachedAttendance = [];
let cachedMeetings = [];
let attendanceDrafts = {};
let employeeAttendanceChartInstance = null;

async function initBackendCache() {
  try {
    const ts = Date.now();
    const [usersRes, tasksRes, leavesRes, activitiesRes, attendanceRes, meetingsRes] = await Promise.all([
      fetch(`/api/users?_=${ts}`).then(r => r.json()),
      fetch(`/api/tasks?_=${ts}`).then(r => r.json()),
      fetch(`/api/leaves?_=${ts}`).then(r => r.json()),
      fetch(`/api/activities?_=${ts}`).then(r => r.json()),
      fetch(`/api/attendance?_=${ts}`).then(r => r.json()),
      fetch(`/api/meetings?_=${ts}`).then(r => r.json())
    ]);

    cachedUsers = usersRes;
    cachedTasks = tasksRes;
    cachedLeaves = leavesRes;
    cachedActivities = activitiesRes;
    cachedAttendance = attendanceRes;
    cachedMeetings = meetingsRes;
    console.log('[Cache] Initialized with PostgreSQL database data');
  } catch (err) {
    console.error('[Cache] Error initializing cache from PostgreSQL:', err);
  }
}

let isSyncing = false;
async function startRealtimeSync() {
  if (isSyncing) return;
  isSyncing = true;
  
  try {
    const ts = Date.now();
    const [usersRes, tasksRes, leavesRes, activitiesRes, attendanceRes, meetingsRes] = await Promise.all([
      fetch(`/api/users?_=${ts}`).then(r => r.json()),
      fetch(`/api/tasks?_=${ts}`).then(r => r.json()),
      fetch(`/api/leaves?_=${ts}`).then(r => r.json()),
      fetch(`/api/activities?_=${ts}`).then(r => r.json()),
      fetch(`/api/attendance?_=${ts}`).then(r => r.json()),
      fetch(`/api/meetings?_=${ts}`).then(r => r.json())
    ]);

    let changed = false;
    
    if (JSON.stringify(cachedUsers) !== JSON.stringify(usersRes)) {
      cachedUsers = usersRes;
      changed = true;
    }
    if (JSON.stringify(cachedTasks) !== JSON.stringify(tasksRes)) {
      cachedTasks = tasksRes;
      changed = true;
    }
    if (JSON.stringify(cachedLeaves) !== JSON.stringify(leavesRes)) {
      cachedLeaves = leavesRes;
      changed = true;
    }
    if (JSON.stringify(cachedActivities) !== JSON.stringify(activitiesRes)) {
      cachedActivities = activitiesRes;
      changed = true;
    }
    if (JSON.stringify(cachedAttendance) !== JSON.stringify(attendanceRes)) {
      cachedAttendance = attendanceRes;
      changed = true;
    }
    if (JSON.stringify(cachedMeetings) !== JSON.stringify(meetingsRes)) {
      cachedMeetings = meetingsRes;
      changed = true;
    }

    if (changed && typeof currentUser !== 'undefined' && currentUser) {
      console.log('[Sync] Database changes detected, refreshing UI.');
      const activeLink = document.querySelector(".nav-link.active");
      if (activeLink) {
        const tabId = activeLink.getAttribute("data-tab");
        if (tabId === "overview") renderDashboard();
        else if (tabId === "leaves") renderLeavesTab();
        else if (tabId === "tasks") renderTasksTab();
        else if (tabId === "attendance") renderAttendanceTab();
        else if (tabId === "meetings") renderScheduledMeetings();
        else if (tabId === "employees") renderEmployeesTab();
      }
    }
  } catch (err) {
    console.error('[Sync] Error during background synchronization:', err);
  } finally {
    isSyncing = false;
  }
}

// Poll database changes every 5 seconds in background
setInterval(startRealtimeSync, 5000);

const db = {
  getUsers: () => JSON.parse(JSON.stringify(cachedUsers || [])),
  
  saveUsers: async (users) => {
    const oldUsers = [...cachedUsers];
    cachedUsers = [...users];

    const oldUsersMap = new Map(oldUsers.map(u => [u.id, u]));
    const newUsersMap = new Map(users.map(u => [u.id, u]));

    for (const [id, oldU] of oldUsersMap.entries()) {
      if (!newUsersMap.has(id)) {
        fetch(`/api/users/${id}`, { method: 'DELETE' }).catch(err => console.error(err));
      }
    }

    for (const [id, newU] of newUsersMap.entries()) {
      const oldU = oldUsersMap.get(id);
      if (!oldU) {
        fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newU)
        }).catch(err => console.error(err));
      } else if (JSON.stringify(oldU) !== JSON.stringify(newU)) {
        fetch(`/api/users/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newU)
        }).catch(err => console.error(err));
      }
    }
  },

  getTasks: () => JSON.parse(JSON.stringify(cachedTasks || [])),

  saveTasks: async (tasks) => {
    const oldTasks = [...cachedTasks];
    cachedTasks = [...tasks];

    const oldTasksMap = new Map(oldTasks.map(t => [t.id, t]));
    const newTasksMap = new Map(tasks.map(t => [t.id, t]));

    for (const [id, oldT] of oldTasksMap.entries()) {
      if (!newTasksMap.has(id)) {
        fetch(`/api/tasks/${id}`, { method: 'DELETE' }).catch(err => console.error(err));
      }
    }

    for (const [id, newT] of newTasksMap.entries()) {
      const oldT = oldTasksMap.get(id);
      if (!oldT) {
        fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newT)
        }).catch(err => console.error(err));
      } else if (JSON.stringify(oldT) !== JSON.stringify(newT)) {
        fetch(`/api/tasks/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newT)
        }).catch(err => console.error(err));
      }
    }
  },

  getLeaves: () => JSON.parse(JSON.stringify(cachedLeaves || [])),

  saveLeaves: async (leaves) => {
    const oldLeaves = [...cachedLeaves];
    cachedLeaves = [...leaves];

    const oldLeavesMap = new Map(oldLeaves.map(l => [l.id, l]));
    const newLeavesMap = new Map(leaves.map(l => [l.id, l]));

    for (const [id, newL] of newLeavesMap.entries()) {
      const oldL = oldLeavesMap.get(id);
      if (!oldL) {
        fetch('/api/leaves', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newL)
        }).catch(err => console.error(err));
      } else if (JSON.stringify(oldL) !== JSON.stringify(newL)) {
        fetch(`/api/leaves/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newL)
        }).catch(err => console.error(err));
      }
    }
  },

  getActivities: () => JSON.parse(JSON.stringify(cachedActivities || [])),

  saveActivities: async (acts) => {
    const oldActs = [...cachedActivities];
    cachedActivities = [...acts];

    const oldIds = new Set(oldActs.map(a => a.id));
    for (const act of acts) {
      if (!oldIds.has(act.id)) {
        fetch('/api/activities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(act)
        }).catch(err => console.error(err));
      }
    }
  },

  getAttendance: () => cachedAttendance,

  saveAttendance: async (record) => {
    const idx = cachedAttendance.findIndex(a => a.userId === record.userId && a.date === record.date && a.meetingType === record.meetingType);
    if (idx !== -1) {
      cachedAttendance[idx] = record;
    } else {
      cachedAttendance.push(record);
    }

    fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    }).catch(err => console.error('[Cache] Error syncing attendance:', err));
  },

  logActivity: (message, type = "info") => {
    const newAct = {
      id: "act-" + Date.now(),
      timestamp: new Date().toISOString(),
      type: type,
      message: message,
      userId: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : "system"
    };
    cachedActivities.unshift(newAct);
    
    fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAct)
    }).catch(err => console.error(err));

    renderActivitiesTimeline();
  },

  getMeetings: () => cachedMeetings,

  saveMeeting: async (meeting) => {
    const res = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meeting)
    });
    if (res.ok) {
      await initBackendCache();
      renderScheduledMeetings();
    }
  },

  updateMeeting: async (id, meeting) => {
    const res = await fetch(`/api/meetings/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meeting)
    });
    if (res.ok) {
      await initBackendCache();
      renderScheduledMeetings();
    }
  },

  deleteMeeting: async (id) => {
    const res = await fetch(`/api/meetings/${id}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      await initBackendCache();
      renderScheduledMeetings();
    }
  }
};







// --------------------------------------------------------------------------



// 2. Application State & Authentication



// --------------------------------------------------------------------------







let currentUser = null;



let performanceChart = null;







function checkAuth() {



  const sessionUser = sessionStorage.getItem("medastrax_current_user");



  const rememberedUser = localStorage.getItem("medastrax_remembered_user");



  if (sessionUser) {



    currentUser = JSON.parse(sessionUser);



    setupWorkspace();



  } else if (rememberedUser) {



    currentUser = JSON.parse(rememberedUser);



    sessionStorage.setItem("medastrax_current_user", JSON.stringify(currentUser));



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







  // Pre-fill remembered username and checkbox state



  const savedUsername = localStorage.getItem(`medastrax_remember_username_${type}`) || "";



  const savedChecked = localStorage.getItem(`medastrax_remember_checkbox_${type}`) === "true";



  document.getElementById("username").value = savedUsername;



  document.getElementById("remember-me").checked = savedChecked;



  document.getElementById("password").value = "";



  



  lucide.createIcons();







  // Wait for slide-out animation to complete, then slide-in login form



  setTimeout(() => {



    portalSelector.classList.add("hidden");



    portalSelector.classList.remove("slide-out-left");



    



    loginCardWrapper.classList.remove("hidden");



    loginCardWrapper.classList.add("slide-in-right");



    



    setTimeout(() => {



      loginCardWrapper.classList.remove("slide-in-right");



      if (savedUsername) {



        document.getElementById("password").focus();



      } else {



        document.getElementById("username").focus();



      }



    }, 400);



  }, 250);



};







function handleLogin(username, password) {



  const portalType = document.getElementById("login-portal-type").value;



  const rememberMeChecked = document.getElementById("remember-me").checked;



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







    // Remember me logic



    if (rememberMeChecked) {



      localStorage.setItem("medastrax_remembered_user", JSON.stringify(currentUser));



      localStorage.setItem(`medastrax_remember_username_${portalType}`, username);



      localStorage.setItem(`medastrax_remember_checkbox_${portalType}`, "true");



    } else {



      localStorage.removeItem("medastrax_remembered_user");



      localStorage.removeItem(`medastrax_remember_username_${portalType}`);



      localStorage.removeItem(`medastrax_remember_checkbox_${portalType}`);



    }







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
  notifiedMeetings = {};



  sessionStorage.removeItem("medastrax_current_user");



  localStorage.removeItem("medastrax_remembered_user");



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



  document.getElementById("workspace-container").classList.remove("sidebar-collapsed");



  document.getElementById("login-form").reset();



  



  const ecgCanvas = document.getElementById("ecg-canvas");



  if (ecgCanvas) {



    ecgCanvas.classList.remove("hidden");



  }



}
function getUserRoleInfo(u) {
  let displayRole = u.role;
  let badgeClass = u.role.toLowerCase().replace(/\s+/g, "-");

  if (u.username === "vibha") {
    displayRole = "Chief Technical Officer";
    badgeClass = "admin";
  } else if (u.username === "rashika") {
    displayRole = "Head of Technology";
    badgeClass = "manager";
  } else if (u.role === "Employee" && u.domain === "Tech") {
    displayRole = "Software Developer";
    badgeClass = "software-developer";
  } else if (u.role === "Employee" && u.domain === "Marketing") {
    displayRole = "MSE";
    badgeClass = "mse";
  } else if (u.role === "Team Lead" && u.domain === "Marketing") {
    displayRole = "MSE (Team Lead)";
    badgeClass = "mse-tl";
  }

  return { displayRole, badgeClass };
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
  const roleInfo = getUserRoleInfo(currentUser);
  const roleBadge = document.getElementById("user-display-role");
  roleBadge.textContent = roleInfo.displayRole;
  roleBadge.className = `badge badge-${roleInfo.badgeClass}`;
  document.getElementById("welcome-title").textContent = `Welcome back, ${displayName}`;
  document.getElementById("header-role-badge").textContent = roleInfo.displayRole;
  document.getElementById("header-role-badge").className = `value badge badge-${roleInfo.badgeClass}`;



  



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
  if (currentUser.username === "vibha") {
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

  const attendanceNavItem = document.getElementById("nav-item-attendance");
  if (attendanceNavItem) {
    if (currentUser.role === "Admin") {
      attendanceNavItem.classList.add("hidden");
    } else {
      attendanceNavItem.classList.remove("hidden");
    }
  }







  // Default to Overview tab



  switchTab("overview");
  // Refresh Lucide Icons
  lucide.createIcons();

  // Initialize Video Calling SSE Connection
  initVideoSse();
  // Trigger upcoming meeting check immediately
  checkUpcomingMeetings();
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



  else if (tabId === "profile") renderOverviewTab();



  else if (tabId === "hierarchy") renderHierarchyTab();
  else if (tabId === "employees" && (currentUser.role === "Admin" || currentUser.role === "Manager")) renderEmployeesTab();
  else if (tabId === "tasks") renderTasksTab();
  else if (tabId === "leaves") renderLeavesTab();
  else if (tabId === "attendance") renderAttendanceTab();
  else if (tabId === "settings") renderSettingsTab();
  else if (tabId === "meetings") renderMeetingsTab();
  else if (tabId === "chat") renderChatTab();
  else if (tabId === "performance") renderPerformanceTab();







  lucide.createIcons();



}







// --------------------------------------------------------------------------



// 4. Tab 1: Overview Dashboard rendering



// --------------------------------------------------------------------------











function getVisibleActivities(currentUser, users, activities) {



  if (!currentUser) return [];



  if (currentUser.role === "Admin") {



    return activities;



  }



  



  // Get all subordinates (hierarchy mapping)



  const subordinates = getSubordinates(currentUser.id, users);



  const subordinateIds = subordinates.map(s => s.id);



  



  return activities.filter(act => {



    // If it's a system activity or doesn't have userId, fallback to name parsing for backwards compatibility



    if (!act.userId) {



      const mentionsUser = (msg, name) => msg && name && msg.toLowerCase().includes(name.toLowerCase());



      if (mentionsUser(act.message, currentUser.fullname)) {



        return true;



      }



      return subordinates.some(sub => mentionsUser(act.message, sub.fullname));



    }



    



    return act.userId === currentUser.id || subordinateIds.includes(act.userId);



  });



}
function renderActivitiesTimeline() {
  const timeline = document.getElementById("activity-timeline-container");
  if (!timeline) return;
  
  timeline.innerHTML = "";
  const users = db.getUsers() || [];
  const activities = db.getActivities() || [];
  const visibleActivities = getVisibleActivities(currentUser, users, activities);
  
  if (visibleActivities.length === 0) {
    timeline.innerHTML = `<span class="text-muted" style="font-size:0.85rem; text-align:center; display:block; padding:16px;">No recent activities logged</span>`;
  } else {
    visibleActivities.forEach(act => {
      const actTime = new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const actDate = new Date(act.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
      
      let iconName = "bell";
      let iconColor = "var(--color-primary)";
      let bgColor = "rgba(5, 47, 95, 0.04)";
      let borderLeftColor = "var(--color-primary)";
      
      if (act.type === "success") {
        iconName = "check-circle";
        iconColor = "var(--color-success)";
        bgColor = "rgba(16, 185, 129, 0.04)";
        borderLeftColor = "var(--color-success)";
      } else if (act.type === "danger") {
        iconName = "x-circle";
        iconColor = "var(--color-danger)";
        bgColor = "rgba(239, 68, 68, 0.04)";
        borderLeftColor = "var(--color-danger)";
      } else if (act.type === "warning") {
        iconName = "alert-triangle";
        iconColor = "var(--color-warning)";
        bgColor = "rgba(245, 158, 11, 0.04)";
        borderLeftColor = "var(--color-warning)";
      } else if (act.type === "system") {
        iconName = "settings";
        iconColor = "var(--accent-secondary)";
        bgColor = "rgba(99, 102, 241, 0.04)";
        borderLeftColor = "var(--accent-secondary)";
      } else if (act.type === "info") {
        iconName = "info";
        iconColor = "var(--color-primary)";
        bgColor = "rgba(5, 47, 95, 0.04)";
        borderLeftColor = "var(--color-primary)";
      }
      
      const div = document.createElement("div");
      div.className = `activity-item ${act.type}-activity`;
      div.innerHTML = `
        <div class="activity-icon-badge" style="border-color: ${borderLeftColor}; color: ${iconColor};">
          <i data-lucide="${iconName}" style="width: 14px; height: 14px;"></i>
        </div>
        <div class="activity-card" style="border-left: 4px solid ${borderLeftColor}; flex-grow: 1;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 8px;">
            <span class="activity-time" style="font-weight: 500; font-size: 0.72rem; color: var(--text-secondary);">${actDate} at ${actTime}</span>
            <span style="font-size: 0.62rem; text-transform: uppercase; font-weight: 700; color: ${iconColor}; letter-spacing: 0.5px;">${act.type}</span>
          </div>
          <p class="activity-desc" style="font-size: 0.85rem; color: var(--text-primary); margin: 0; line-height: 1.4;">${act.message}</p>
        </div>
      `;
      timeline.appendChild(div);
    });
  }
}

// Global chart variable to destroy before re-rendering
let teamAttendanceChartInstance = null;

function renderTeamAttendanceChart() {
  const canvas = document.getElementById("teamAttendanceChart");
  if (!canvas) return;

  const users = db.getUsers() || [];
  const attendance = db.getAttendance() || [];

  const techTeam = users.filter(u => u.domain === 'Tech');
  const marketingTeam = users.filter(u => u.domain === 'Marketing');

  const today = new Date().toISOString().split('T')[0];

  const calcAttendancePercentage = (team) => {
    if (team.length === 0) return 0;
    let presentCount = 0;
    team.forEach(u => {
      const record = attendance.find(a => a.userId === u.id && a.date === today);
      if (record && record.status === 'Present') {
        presentCount++;
      }
    });
    return Math.round((presentCount / team.length) * 100);
  };

  const techAtt = calcAttendancePercentage(techTeam);
  const mktAtt = calcAttendancePercentage(marketingTeam);

  let chartLabels = [];
  let chartDataPoints = [];
  let chartBgColors = [];
  let chartBorderColors = [];

  if (currentUser.domain === 'Tech') {
    chartLabels = ['Tech Team'];
    chartDataPoints = [techAtt];
    chartBgColors = ['rgba(54, 162, 235, 0.6)'];
    chartBorderColors = ['rgba(54, 162, 235, 1)'];
  } else if (currentUser.domain === 'Marketing') {
    chartLabels = ['Marketing Team'];
    chartDataPoints = [mktAtt];
    chartBgColors = ['rgba(255, 99, 132, 0.6)'];
    chartBorderColors = ['rgba(255, 99, 132, 1)'];
  } else {
    // Show both for Admins/Others
    chartLabels = ['Tech Team', 'Marketing Team'];
    chartDataPoints = [techAtt, mktAtt];
    chartBgColors = ['rgba(54, 162, 235, 0.6)', 'rgba(255, 99, 132, 0.6)'];
    chartBorderColors = ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)'];
  }

  if (teamAttendanceChartInstance) {
    teamAttendanceChartInstance.destroy();
  }

  const ctx = canvas.getContext("2d");
  teamAttendanceChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartLabels,
      datasets: [{
        label: 'Attendance % Today',
        data: chartDataPoints,
        backgroundColor: chartBgColors,
        borderColor: chartBorderColors,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            stepSize: 20
          }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function renderOverviewTab() {



  const users = db.getUsers();



  const tasks = db.getTasks();



  const activities = db.getActivities();
  
  // Hide team attendance
  let isHead = currentUser.role === "Admin" || currentUser.role === "Manager" || currentUser.role === "Technical Lead" || currentUser.role === "Team Lead";

  // Marketing specific restriction: only Parneet, Prabhroop, and Mahakpreet can mark team attendance
  if (currentUser.domain === "Marketing") {
    if (!["usr-parneet", "usr-prabhroop", "usr-mahakpreet"].includes(currentUser.id)) {
      isHead = false;
    }
  }

  const graphWrapper = document.getElementById("attendance-graph-wrapper");
  if (graphWrapper) {
    if (isHead) {
      graphWrapper.classList.remove("hidden");
    } else {
      graphWrapper.classList.add("hidden");
    }
  }



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
  renderActivitiesTimeline();
  
  // Render Attendance Graph
  if (typeof renderTeamAttendanceChart === 'function') {
    renderTeamAttendanceChart();
  }
  
  // Space helper
  // Render security card details



  document.getElementById("profile-full-name").textContent = currentUser.fullname;



  document.getElementById("profile-username").textContent = `@${currentUser.username}`;



  document.getElementById("profile-role").textContent = currentUser.role;



  document.getElementById("profile-gmail").textContent = currentUser.gmail || "N/A";



  document.getElementById("profile-phone").textContent = currentUser.phone || "N/A";



  document.getElementById("profile-domain").textContent = currentUser.domain || "N/A";



  document.getElementById("profile-aadhar").textContent = currentUser.aadhar || "N/A";



  



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
  let directSubordinates = usersList.filter(u => u.reportingManagerId === managerId);

  // Marketing dual-node logic: Prabhroop and Mahakpreet share subordinates
  if (managerId === "usr-prabhroop") {
    directSubordinates = directSubordinates.concat(usersList.filter(u => u.reportingManagerId === "usr-mahakpreet"));
  } else if (managerId === "usr-mahakpreet") {
    directSubordinates = directSubordinates.concat(usersList.filter(u => u.reportingManagerId === "usr-prabhroop"));
  }

  let allSubordinates = [...directSubordinates];

  directSubordinates.forEach(sub => {
    const nestedSubordinates = getSubordinates(sub.id, usersList);
    allSubordinates = allSubordinates.concat(nestedSubordinates);
  });

  // Deduplicate array by user id to prevent double-counting when top managers fetch reports
  return allSubordinates.filter((u, index, self) => index === self.findIndex(t => t.id === u.id));
}







// --------------------------------------------------------------------------



// 5. Tab 2: Team Hierarchy rendering (Interactive Org Chart)



// --------------------------------------------------------------------------







function renderHierarchyTab() {
  const rawUsers = db.getUsers();
  const container = document.getElementById("org-chart-container");
  container.innerHTML = "";

  let rootNode = null;
  if (currentUser.role === "Admin") {
    rootNode = rawUsers.find(u => u.id === currentUser.id);
  } else if (currentUser.role === "Manager" || currentUser.role === "Technical Lead" || currentUser.role === "Team Lead") {
    if (currentUser.id === "usr-prabhroop" || currentUser.id === "usr-mahakpreet") {
      rootNode = {
        id: "dual-marketing",
        isDual: true,
        parent1: rawUsers.find(u => u.id === "usr-mahakpreet"),
        parent2: rawUsers.find(u => u.id === "usr-prabhroop"),
        reportingManagerId: "usr-parneet"
      };
    } else {
      rootNode = rawUsers.find(u => u.id === currentUser.id);
    }
  } else {
    // Employee: trace reporting manager line to the top parent
    let current = currentUser;
    while (current.reportingManagerId && current.reportingManagerId !== "none") {
      const mgr = rawUsers.find(u => u.id === current.reportingManagerId);
      if (!mgr) break;
      current = mgr;
    }
    rootNode = rawUsers.find(u => u.id === current.id);
  }

  if (!rootNode) {
    container.innerHTML = "<p class='text-muted'>No hierarchy data available.</p>";
    return;
  }
  // Use rawUsers directly without dynamic redirection
  const users = rawUsers;







  const ul = document.createElement("ul");



  ul.className = "chart-tree";



  



  if (currentUser.role === "Employee") {
    // Find manager
    const manager = users.find(u => u.id === currentUser.reportingManagerId);

    if (currentUser.domain === "Tech") {
      // For last-level tech team members, only show their direct manager (Rashika) and themselves
      if (manager) {
        const managerLi = document.createElement("li");
        managerLi.appendChild(createNodeCard(manager, users));

        const empUl = document.createElement("ul");
        const empLi = document.createElement("li");
        empLi.appendChild(createNodeCard(currentUser, users));
        empUl.appendChild(empLi);

        managerLi.appendChild(empUl);
        ul.appendChild(managerLi);
      } else {
        const empLi = document.createElement("li");
        empLi.appendChild(createNodeCard(currentUser, users));
        ul.appendChild(empLi);
      }
    } else {
      // Show vertical path for other employees to reduce isolation
      const list = document.createElement("li");
      list.appendChild(createNodeCard(rootNode, users));

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
    }
  } else {
    // For the three co-founder admins: show tri-admin peer row at top
    // Dynamically derive top-level heads: Admin role with no reporting manager
    const coFounderIds = users
      .filter(u => u.role === "Admin" && (!u.reportingManagerId || u.reportingManagerId === "none"))
      .map(u => u.id);
    if (coFounderIds.includes(currentUser.id)) {
      // Reorder: logged-in admin always in center
      const allAdmins = coFounderIds.map(id => users.find(u => u.id === id)).filter(Boolean);
      const others = allAdmins.filter(u => u.id !== currentUser.id);
      const orderedAdmins = [others[0], users.find(u => u.id === currentUser.id), others[1]];

      // Get shared children (canonical source: Sambhav's direct reports)
      let sharedChildren = users.filter(u => u.reportingManagerId === "usr-sambhav");
      // Apply spandan dummy-node transformation
      sharedChildren = sharedChildren.map(u => {
        if (u.id === "usr-spandan") {
          return { id: "dummy-" + u.id, fullname: "", role: "Dummy", isDummy: true, reportingManagerId: "usr-sambhav", actualChild: u };
        }
        return u;
      });

      const topLi = document.createElement("li");
      const triContainer = document.createElement("div");
      triContainer.className = "tri-admin-container";

      orderedAdmins.forEach((admin, idx) => {
        const isCenter = idx === 1;
        const card = createNodeCard(admin, users, isCenter && sharedChildren.length > 0);
        if (!isCenter) card.classList.add("admin-peer-card");
        triContainer.appendChild(card);
      });

      topLi.appendChild(triContainer);

      if (sharedChildren.length > 0) {
        const childUl = document.createElement("ul");
        sharedChildren.forEach(child => childUl.appendChild(buildTreeHTML(child, users)));
        topLi.appendChild(childUl);

        // Only the center (logged-in) admin card toggles the subtree
        const centerCard = triContainer.children[1];
        centerCard.addEventListener("click", () => {
          childUl.classList.toggle("collapsed");
          centerCard.classList.toggle("node-collapsed");
        });
      }

      ul.appendChild(topLi);
    } else {
      // For Manager / Team Lead â€” construct the complete downwards tree
      ul.appendChild(buildTreeHTML(rootNode, users));
    }
  }

  container.appendChild(ul);
}
function buildTreeHTML(node, usersList) {
  let children = [];
  if (node.isDummy) {
    children = [node.actualChild];
  } else if (node.isDual) {
    children = usersList.filter(u => u.reportingManagerId === "usr-mahakpreet");
  } else {
    // If the node is Shivangi or Shakcham, their children are the same as Sambhav's children
    const targetId = (node.id === "usr-shivangi" || node.id === "usr-shakcham") ? "usr-sambhav" : node.id;
    children = usersList.filter(u => u.reportingManagerId === targetId);
    if (node.id === "usr-parneet") {
      const hasMarketing = children.some(u => u.id === "usr-prabhroop" || u.id === "usr-mahakpreet");
      children = children.filter(u => u.id !== "usr-prabhroop" && u.id !== "usr-mahakpreet");
      if (hasMarketing) {
        children.push({
          id: "dual-marketing",
          isDual: true,
          parent1: usersList.find(u => u.id === "usr-mahakpreet"),
          parent2: usersList.find(u => u.id === "usr-prabhroop"),
          reportingManagerId: node.id
        });
      }
    }

    if (node.id === "usr-sambhav" || node.id === "usr-shivangi" || node.id === "usr-shakcham") {
      children = children.map(u => {
        if (u.id === "usr-spandan") {
          return {
            id: "dummy-" + u.id,
            fullname: "",
            role: "Dummy",
            isDummy: true,
            reportingManagerId: node.id,
            actualChild: u
          };
        }
        return u;
      });
    }
  }

  const hasChildren = children.length > 0;
  const li = document.createElement("li");

  if (node.isDual) {
    const dualContainer = document.createElement("div");
    dualContainer.className = "dual-node-container";
    
    const card1 = createNodeCard(node.parent1, usersList, false);
    const card2 = createNodeCard(node.parent2, usersList, hasChildren);
    
    dualContainer.appendChild(card1);
    dualContainer.appendChild(card2);
    li.appendChild(dualContainer);
    
    if (hasChildren) {
      const ul = document.createElement("ul");
      children.forEach(child => {
        ul.appendChild(buildTreeHTML(child, usersList));
      });
      li.appendChild(ul);
      
      card2.addEventListener("click", () => {
        ul.classList.toggle("collapsed");
        card2.classList.toggle("node-collapsed");
      });
    }
  } else {
    const nodeCard = createNodeCard(node, usersList, hasChildren);
    li.appendChild(nodeCard);

    if (hasChildren) {
      const ul = document.createElement("ul");
      children.forEach(child => {
        ul.appendChild(buildTreeHTML(child, usersList));
      });
      li.appendChild(ul);
      // Collapsible branch click handler
      if (!node.isDummy) {
        nodeCard.addEventListener("click", () => {
          ul.classList.toggle("collapsed");
          nodeCard.classList.toggle("node-collapsed");
        });
      }
    }
  }

  return li;
}

function getNodeDisplayDomain(node) {
  if (!node) return "N/A";
  
  if (node.id === "usr-rashika") {
    return "Head of technology";
  }
  if (node.id === "usr-tanveer") {
    return "AI & Full stack Executive";
  }
  
  if (node.fullname) {
    const match = node.fullname.match(/\(([^)]+)\)/);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return node.domain || "N/A";
}

function createNodeCard(node, usersList, hasChildren = false) {
  if (node.isDummy) {
    const div = document.createElement("div");
    div.className = "node-card dummy-node-card";
    div.style.opacity = "0";
    div.style.pointerEvents = "none";
    div.innerHTML = `
      <div class="node-avatar">&nbsp;</div>
      <div class="node-name">&nbsp;</div>
      <span class="node-role badge">&nbsp;</span>
      <div class="node-reports-to">&nbsp;</div>
    `;
    return div;
  }

  const roleInfo = getUserRoleInfo(node);
  const div = document.createElement("div");
  div.className = `node-card ${roleInfo.badgeClass}-node`;



  if (hasChildren) {



    div.classList.add("collapsible-node");



  }



  



  // Highlight self



  if (node.id === currentUser.id) {



    div.style.borderColor = "var(--border-focus)";



    div.style.boxShadow = "var(--shadow-accent)";



  }







  const cleanName = node.fullname.replace(/\s*\(.*\)\s*/g, "");



  const initial = cleanName.charAt(0);



  



  // Clean reports to name suffix as well



  let reportsToText = "Top Level";



  if (node.reportingManagerId) {



    const reportsToUser = usersList.find(u => u.id === node.reportingManagerId);



    if (reportsToUser) {



      const cleanMgrName = reportsToUser.fullname.replace(/\s*\(.*\)\s*/g, "");



      reportsToText = `Reports to: ${cleanMgrName.split(' ')[0]}`;



    }



  }







  div.innerHTML = `



    <div class="node-avatar">${initial}</div>



    <div class="node-name">${cleanName}</div>
    <span class="node-role badge badge-${roleInfo.badgeClass}">${getNodeDisplayDomain(node)}</span>



    <div class="node-reports-to">${reportsToText}</div>



  `;



  



  return div;



}







// --------------------------------------------------------------------------



// 6. Tab 3: Directory / User Management rendering (Admin Only)



// --------------------------------------------------------------------------







function renderEmployeesTab() {



  if (currentUser.role !== "Admin" && currentUser.role !== "Manager") return;







  const users = db.getUsers();



  const searchVal = document.getElementById("employee-search").value.toLowerCase();



  const roleFilter = document.getElementById("filter-role-select").value;



  const tbody = document.getElementById("employees-table-body");



  tbody.innerHTML = "";







  const filteredUsers = users.filter(u => {



    const matchesSearch = u.fullname.toLowerCase().includes(searchVal) || 



                          u.username.toLowerCase().includes(searchVal) || 



                          u.id.toLowerCase().includes(searchVal) ||



                          (u.gmail && u.gmail.toLowerCase().includes(searchVal)) ||



                          (u.phone && u.phone.includes(searchVal)) ||



                          (u.domain && u.domain.toLowerCase().includes(searchVal)) ||



                          (u.aadhar && u.aadhar.includes(searchVal));



    const matchesRole = roleFilter === "all" || u.role === roleFilter;



    return matchesSearch && matchesRole;



  });
  filteredUsers.forEach(u => {
    const roleInfo = getUserRoleInfo(u);
    const tr = document.createElement("tr");



    const reportingUser = users.find(mgr => mgr.id === u.reportingManagerId);



    const reportingText = reportingUser ? reportingUser.fullname : "None (Director)";



    



    // Checkbox action actions: edit and delete buttons (disable deleting/editing root admin, disable managers managing admins)



    const isRootAdmin = u.username === "admin";



    const canManage = currentUser.role === "Admin" || (currentUser.role === "Manager" && u.role !== "Admin");



    



    let actionButtons = "";



    if (canManage) {



      const editBtn = `<button class="btn btn-secondary btn-icon-only" onclick="openEditEmployeeModal('${u.id}')" title="Edit Profile" style="padding: 6px; margin-right: 6px; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;"><i data-lucide="edit" style="width:14px; height:14px;"></i></button>`;



      const deleteBtn = isRootAdmin 



        ? `<span class="text-muted" style="font-size: 0.85rem;">Protected</span>` 



        : `<button class="btn btn-danger btn-icon-only" onclick="deleteEmployee('${u.id}')" title="Delete Profile" style="padding: 6px; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>`;



      actionButtons = `<div style="display: flex; align-items: center;">${editBtn}${deleteBtn}</div>`;



    } else {



      actionButtons = `<span class="text-muted" style="font-size: 0.8rem;">No Permission</span>`;



    }







    tr.innerHTML = `



      <td><code>${u.id}</code></td>



      <td><strong>${u.fullname}</strong></td>



      <td>${u.gmail || "N/A"}</td>



      <td>${u.phone || "N/A"}</td>



      <td>${u.domain || "N/A"}</td>
      <td><code>${u.aadhar || "N/A"}</code></td>
      <td><span class="badge badge-${roleInfo.badgeClass}">${roleInfo.displayRole}</span></td>



      <td>${reportingText}</td>



      <td><span class="status-pill active-status">${u.status}</span></td>



      <td>${actionButtons}</td>



    `;



    tbody.appendChild(tr);



  });



  



  lucide.createIcons();



}







window.deleteEmployee = function(userId) {



  let users = db.getUsers();



  const employeeToDelete = users.find(u => u.id === userId);



  if (!employeeToDelete) return;







  // Safety check: Managers cannot delete Admin profiles



  if (currentUser.role === "Manager" && employeeToDelete.role === "Admin") {



    showToast("Access Denied: Managers cannot delete Administrator profiles.", "error");



    return;



  }







  if (confirm(`Are you sure you want to delete ${employeeToDelete.fullname}? This action is irreversible and will delete all their assigned tasks.`)) {



    let tasks = db.getTasks();







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







    db.logActivity(`Staff account '${employeeToDelete.fullname}' was deleted by ${currentUser.fullname}.`, "danger");



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



  document.getElementById("custom-domain-wrapper").classList.add("hidden");



  document.getElementById("new-custom-domain").required = false;







  // Reset autocomplete suggestion state



  const usernameInput = document.getElementById("new-username");



  const passwordInput = document.getElementById("new-password");



  const fullnameInput = document.getElementById("new-fullname");



  usernameInput.dataset.autoGenerated = "true";



  passwordInput.dataset.autoGenerated = "true";



  usernameInput.dataset.lastAuto = "";



  passwordInput.dataset.lastAuto = "";



  delete fullnameInput.dataset.passwordSuffix;







  // Reset password field visibility toggles



  passwordInput.setAttribute("type", "password");



  const eyeIcon = document.getElementById("toggle-new-password").querySelector("i");



  if (eyeIcon) {



    eyeIcon.setAttribute("data-lucide", "eye");



  }







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



  



  const gmail = document.getElementById("new-gmail").value.trim();



  const phone = document.getElementById("new-phone").value.trim();



  const domainSelect = document.getElementById("new-domain").value;



  const customDomain = document.getElementById("new-custom-domain").value.trim();



  const aadhar = document.getElementById("new-aadhar").value.trim();







  // Determine domain



  const domain = domainSelect === "Other" ? customDomain : domainSelect;







  // Validate Domain



  if (domainSelect === "Other" && !customDomain) {



    showToast("Please specify your custom domain.", "error");



    return;



  }







  // Validate Gmail



  if (!gmail.toLowerCase().endsWith("@gmail.com")) {



    showToast("Please enter a valid Gmail address (ending in @gmail.com).", "error");



    return;



  }







  // Format and Validate Aadhar



  const cleanedAadhar = aadhar.replace(/\s+/g, "");



  if (!/^\d{12}$/.test(cleanedAadhar)) {



    showToast("Aadhar card number must be exactly 12 digits.", "error");



    return;



  }



  const formattedAadhar = cleanedAadhar.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3");







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



    availabilityStatus: "Active",



    gmail,



    phone,



    domain,



    aadhar: formattedAadhar



  };







  users.push(newUser);



  db.saveUsers(users);







  db.logActivity(`New ${role} profile '${fullname}' added by Admin.`, "success");



  showToast(`${role} profile created successfully!`, "success");



  closeEmployeeModal();



  renderEmployeesTab();



}







window.openEditEmployeeModal = function(userId) {



  const modal = document.getElementById("edit-employee-modal");



  const users = db.getUsers();



  const user = users.find(u => u.id === userId);



  if (!user) return;







  document.getElementById("edit-user-id").value = user.id;



  document.getElementById("edit-fullname").value = user.fullname;



  document.getElementById("edit-username").value = user.username;



  document.getElementById("edit-gmail").value = user.gmail || "";



  document.getElementById("edit-phone").value = user.phone || "";



  document.getElementById("edit-aadhar").value = user.aadhar || "";



  



  const managerSelect = document.getElementById("edit-manager");



  managerSelect.innerHTML = "";



  const managers = users.filter(u => (u.role === "Admin" || u.role === "Manager") && u.id !== user.id);



  managers.forEach(m => {



    const opt = document.createElement("option");



    opt.value = m.id;



    opt.textContent = `${m.fullname} (${m.role})`;



    if (m.id === user.reportingManagerId) {



      opt.selected = true;



    }



    managerSelect.appendChild(opt);



  });







  const roleSelect = document.getElementById("edit-role");



  roleSelect.innerHTML = "";



  const roles = ["Manager", "Technical Lead", "Team Lead", "Employee"];



  if (currentUser.role === "Admin") {



    roles.unshift("Admin");



  }



  roles.forEach(r => {



    const opt = document.createElement("option");



    opt.value = r;



    opt.textContent = r;



    if (r === user.role) {



      opt.selected = true;



    }



    roleSelect.appendChild(opt);



  });







  const isCustomDomain = !["Tech", "Marketing", "R&D"].includes(user.domain);



  const domainSelect = document.getElementById("edit-domain");



  const customDomainInput = document.getElementById("edit-custom-domain");



  const customDomainWrapper = document.getElementById("edit-custom-domain-wrapper");







  if (isCustomDomain && user.domain) {



    domainSelect.value = "Other";



    customDomainInput.value = user.domain;



    customDomainWrapper.classList.remove("hidden");



    customDomainInput.required = true;



  } else {



    domainSelect.value = user.domain || "";



    customDomainInput.value = "";



    customDomainWrapper.classList.add("hidden");



    customDomainInput.required = false;



  }







  modal.classList.remove("hidden");



  lucide.createIcons();



};







window.closeEditEmployeeModal = function() {



  document.getElementById("edit-employee-modal").classList.add("hidden");



};







function handleEditEmployee(e) {



  e.preventDefault();







  const userId = document.getElementById("edit-user-id").value;



  const fullname = document.getElementById("edit-fullname").value.trim();



  const username = document.getElementById("edit-username").value.trim().toLowerCase();



  const role = document.getElementById("edit-role").value;



  const reportingManagerId = document.getElementById("edit-manager").value || "none";



  



  const gmail = document.getElementById("edit-gmail").value.trim();



  const phone = document.getElementById("edit-phone").value.trim();



  const domainSelect = document.getElementById("edit-domain").value;



  const customDomain = document.getElementById("edit-custom-domain").value.trim();



  const aadhar = document.getElementById("edit-aadhar").value.trim();







  const domain = domainSelect === "Other" ? customDomain : domainSelect;



  if (domainSelect === "Other" && !customDomain) {



    showToast("Please specify your custom domain.", "error");



    return;



  }







  if (!gmail.toLowerCase().endsWith("@gmail.com")) {



    showToast("Please enter a valid Gmail address (ending in @gmail.com).", "error");



    return;



  }







  const cleanedAadhar = aadhar.replace(/\s+/g, "");



  if (!/^\d{12}$/.test(cleanedAadhar)) {



    showToast("Aadhar card number must be exactly 12 digits.", "error");



    return;



  }



  const formattedAadhar = cleanedAadhar.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3");







  let users = db.getUsers();



  



  if (users.some(u => u.username === username && u.id !== userId)) {



    showToast("Username already exists. Try another.", "error");



    return;



  }







  const userIndex = users.findIndex(u => u.id === userId);



  if (userIndex !== -1) {



    const originalRole = users[userIndex].role;



    const isPromoted = originalRole !== role;







    users[userIndex].fullname = fullname;



    users[userIndex].username = username;



    users[userIndex].role = role;



    users[userIndex].reportingManagerId = reportingManagerId;



    users[userIndex].gmail = gmail;



    users[userIndex].phone = phone;



    users[userIndex].domain = domain;



    users[userIndex].aadhar = formattedAadhar;







    db.saveUsers(users);







    if (userId === currentUser.id) {



      currentUser = users[userIndex];



      sessionStorage.setItem("medastrax_current_user", JSON.stringify(currentUser));



      if (localStorage.getItem("medastrax_remembered_user")) {



        localStorage.setItem("medastrax_remembered_user", JSON.stringify(currentUser));



      }



      setupWorkspace();



    }







    let logMsg = `Profile details for '${fullname}' updated by ${currentUser.fullname}.`;



    if (isPromoted) {



      logMsg = `'${fullname}' promoted/transferred from ${originalRole} to ${role} by ${currentUser.fullname}.`;



    }



    db.logActivity(logMsg, "success");



    showToast("Employee profile updated successfully!", "success");



    



    closeEditEmployeeModal();



    renderEmployeesTab();



  }



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



let currentUploadedDeliverables = [];







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



  const deliverables = task.submittedDeliverables || [];



  if (deliverables.length === 0 && task.deliverableLink) {



    // Backwards compatibility migration



    deliverables.push({



      id: 'del-migrated',



      type: 'link',



      name: task.deliverableLink.replace(/https?:\/\/(www\.)?/, '').substring(0, 20) + '...',



      value: task.deliverableLink



    });



  }







  if (currentUser.role === "Employee" && task.status === "In Progress") {



    currentUploadedDeliverables = [...deliverables];



    let initialTab = 'photo';



    if (currentUploadedDeliverables.length > 0) {



      initialTab = currentUploadedDeliverables[0].type;



    }



    setTimeout(() => {



      renderDeliverableInputs(initialTab);



    }, 50);



  } else {



    if (deliverables.length > 0) {



      let deliverablesHtml = `<div style="display:flex; flex-direction:column; gap:8px;">`;



      deliverables.forEach(item => {



        if (item.type === 'photo') {



          deliverablesHtml += `



            <div style="border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; background: rgba(0,0,0,0.02); display: flex; flex-direction: column; gap: 4px;">



              <img src="${item.value}" alt="${item.name}" style="max-width: 100%; max-height: 120px; object-fit: contain; border-radius: 4px; display: block; cursor: zoom-in;" onclick="openDeliverableImageLightbox('${item.value}')">



              <div style="font-size: 0.7rem; color: var(--text-secondary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; font-weight: 500;">



                ðŸ“· ${item.name} ${item.size ? `(${item.size})` : ''}



              </div>



            </div>



          `;



        } else if (item.type === 'video') {



          deliverablesHtml += `



            <div style="border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; background: rgba(0,0,0,0.02); display: flex; flex-direction: column; gap: 4px;">



              <video src="${item.value}" controls style="max-width: 100%; max-height: 120px; border-radius: 4px; background: #000;"></video>



              <div style="font-size: 0.7rem; color: var(--text-secondary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; font-weight: 500;">



                ðŸŽ¥ ${item.name} ${item.size ? `(${item.size})` : ''}



              </div>



            </div>



          `;



        } else if (item.type === 'link') {



          deliverablesHtml += `



            <div style="display: flex; align-items: center; justify-content: space-between; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px; background: rgba(0,0,0,0.02); font-size: 0.8rem;">



              <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; display: flex; align-items: center; gap: 4px; flex-grow:1; min-width:0; margin-right:8px;">



                <i data-lucide="link" style="width:12px; height:12px; color:var(--color-primary); flex-shrink:0;"></i>



                <span style="overflow:hidden; text-overflow:ellipsis;">${item.name}</span>



              </div>



              <a href="${item.value}" target="_blank" class="btn btn-secondary btn-sm" style="padding: 2px 6px; font-size: 0.7rem; display: inline-flex; align-items: center; gap: 2px; flex-shrink:0;">



                <i data-lucide="external-link" style="width: 10px; height: 10px;"></i> Open



              </a>



            </div>



          `;



        }



      });



      deliverablesHtml += `</div>`;



      delLinkContainer.innerHTML = deliverablesHtml;



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



  if (!currentUploadedDeliverables || currentUploadedDeliverables.length === 0) {



    showToast("Please attach at least one deliverable (photo, video, or link) before submitting.", "error");



    return;



  }







  const tasks = db.getTasks();



  const taskIndex = tasks.findIndex(t => t.id === taskId);



  if (taskIndex !== -1) {



    tasks[taskIndex].status = "Under Review";



    tasks[taskIndex].submittedDeliverables = currentUploadedDeliverables;



    



    // Set first link or file name as fallback deliverableLink for compatibility



    const linkItem = currentUploadedDeliverables.find(item => item.type === 'link');



    if (linkItem) {



      tasks[taskIndex].deliverableLink = linkItem.value;



    } else {



      tasks[taskIndex].deliverableLink = currentUploadedDeliverables[0].name;



    }



    



    tasks[taskIndex].feedback = ""; // clear any previous feedback



    



    db.saveTasks(tasks);



    db.logActivity(`Task '${tasks[taskIndex].title}' submitted for review by ${currentUser.fullname}.`, "info");



    showToast("Task submitted successfully for review!", "success");







    currentUploadedDeliverables = [];







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



  



  // Allow all users (including lower-level Employee/Manager) to change their password



  passCard.classList.remove("hidden");



  statusCard.style.gridColumn = "";







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
  return toast;
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
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// 10.5. Leave Management Core Functionality
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function buildApprovalChain(user, usersList) {
  const chain = [];
  if (!user) return chain;

  const list = Array.isArray(usersList) ? usersList : [];

  // Co-founder IDs â€” appear in the chain as record-only (leave auto-approves when it reaches them)
  // Dynamically derive top-level heads: Admin role with no reporting manager — they appear as record-only
  const coFounderIds = list
    .filter(u => u.role === "Admin" && (!u.reportingManagerId || u.reportingManagerId === "none"))
    .map(u => u.id);

  // Custom hierarchy for Vibha and Rikhil (C-Level directly under founders)
  if (user.id === "usr-vibha" || user.id === "usr-rikhil") {
    const customApprovers = ["usr-sambhav", "usr-shakcham", "usr-shivangi"];
    customApprovers.forEach(approverId => {
      const manager = list.find(u => u.id === approverId);
      if (manager) {
        chain.push({
          approverId: manager.id,
          approverName: (manager.fullname || manager.username || "Approver").replace(/\s*\(.*\)\s*/g, ""),
          approverRole: (manager.fullname && manager.fullname.match(/\(([^)]+)\)/)) ? manager.fullname.match(/\(([^)]+)\)/)[1] : (manager.role || "Admin"),
          status: "Pending",
          actionDate: null,
          isRecord: false
        });
      }
    });
    return chain;
  }

  let current = user;
  const visited = new Set([user.id]);

  while (current && current.reportingManagerId && current.reportingManagerId !== "none") {
    const manager = list.find(u => u.id === current.reportingManagerId);
    if (manager && !visited.has(manager.id)) {
      visited.add(manager.id);
      chain.push({
        approverId: manager.id,
        approverName: (manager.fullname || manager.username || "Manager").replace(/\s*\(.*\)\s*/g, ""),
        approverRole: (manager.fullname && manager.fullname.match(/\(([^)]+)\)/)) ? manager.fullname.match(/\(([^)]+)\)/)[1] : (manager.role || "Manager"),
        status: "Pending",
        actionDate: null,
        isRecord: coFounderIds.includes(manager.id) // Co-founders: record only, no action needed
      });
      current = manager;
    } else {
      break;
    }
  }

  // No extra admin appended â€” chain naturally ends at co-founder level
  return chain;
}
function getWeekRange(dateString) {
  const parts = dateString.split('-');
  const date = parts.length === 3 
    ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
    : new Date(dateString);
  
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function validateLeaveDates(fromDateStr, toDateStr, userId) {
  console.log("=== LEAVE VALIDATION ===");
  console.log("From:", fromDateStr, "To:", toDateStr, "User:", userId);
  console.log("Current Leaves in Cache:", db.getLeaves());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const fParts = fromDateStr.split('-');
  const fromDate = fParts.length === 3
    ? new Date(Number(fParts[0]), Number(fParts[1]) - 1, Number(fParts[2]))
    : new Date(fromDateStr);
  fromDate.setHours(0, 0, 0, 0);
  
  const tParts = toDateStr.split('-');
  const toDate = tParts.length === 3
    ? new Date(Number(tParts[0]), Number(tParts[1]) - 1, Number(tParts[2]))
    : new Date(toDateStr);
  toDate.setHours(0, 0, 0, 0);

  const minStartDate = new Date(today);
  minStartDate.setDate(today.getDate() + 1);
  if (fromDate < minStartDate) {
    return { valid: false, message: "Leave applications must be submitted at least 1 day in advance (prior to the leave date)." };
  }

  if (toDate < fromDate) {
    return { valid: false, message: "End date cannot be earlier than start date." };
  }

  const diffTime = Math.abs(toDate - fromDate);
  const requestedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  if (requestedDays > 2) {
    return { valid: false, message: "A leave request cannot exceed 2 days (max 2 leaves in a week)." };
  }

  const { start, end } = getWeekRange(fromDateStr);
  const leaves = db.getLeaves() || [];
  let totalWeekDays = 0;

  for (const lv of leaves) {
    if (lv.userId === userId && lv.status !== "Rejected") {
      const lvParts = lv.fromDate.split('-');
      const lvFrom = lvParts.length === 3
        ? new Date(Number(lvParts[0]), Number(lvParts[1]) - 1, Number(lvParts[2]))
        : new Date(lv.fromDate);
      
      if (lvFrom >= start && lvFrom <= end) {
        totalWeekDays += lv.totalDays;
      }
    }
  }

  if (totalWeekDays + requestedDays > 2) {
    return { valid: false, message: "Not more than two (2) leaves shall be granted in a week. You already have requested/approved leaves for this week." };
  }

  return { valid: true, requestedDays };
}

async function openLeaveModal() {
  await initBackendCache();
  const modal = document.getElementById("apply-leave-modal");
  if (modal) {
    document.getElementById("leave-emp-name").value = currentUser.fullname.replace(/\s*\(.*\)\s*/g, "");
    document.getElementById("leave-emp-role").value = currentUser.role;
    document.getElementById("leave-emp-phone").value = currentUser.phone || "N/A";
    
    document.getElementById("leave-from-date").value = "";
    document.getElementById("leave-to-date").value = "";
    document.getElementById("leave-total-days").value = "";
    document.getElementById("leave-reason").value = "";
    
    modal.classList.remove("hidden");
  }
}

function updateLeaveTotalDays() {
  const fromVal = document.getElementById("leave-from-date").value;
  const toVal = document.getElementById("leave-to-date").value;
  const totalDaysInput = document.getElementById("leave-total-days");

  if (fromVal && toVal) {
    const fromDate = new Date(fromVal);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(toVal);
    toDate.setHours(0, 0, 0, 0);

    if (toDate >= fromDate) {
      const diffTime = Math.abs(toDate - fromDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      totalDaysInput.value = `${diffDays} Day(s)`;
    } else {
      totalDaysInput.value = "Invalid Date Range";
    }
  } else {
    totalDaysInput.value = "";
  }
}

function handleLeaveSubmit(e) {
  e.preventDefault();

  const fromDateStr = document.getElementById("leave-from-date").value;
  const toDateStr = document.getElementById("leave-to-date").value;
  const reason = document.getElementById("leave-reason").value.trim();

  if (!fromDateStr || !toDateStr || !reason) {
    showToast("Please fill all required fields.", "error");
    return;
  }

  const validation = validateLeaveDates(fromDateStr, toDateStr, currentUser.id);
  if (!validation.valid) {
    showToast(validation.message, "error");
    return;
  }

  const users = db.getUsers();
  const chain = buildApprovalChain(currentUser, users);
  
  let status = "Pending";
  let currentApproverId = null;

  if (chain.length > 0) {
    if (chain[0].isRecord === true) {
      // First step is co-founder record-only â€” auto-approve immediately
      chain[0].status = "Approved";
      chain[0].actionDate = new Date().toISOString();
      currentApproverId = null;
      status = "Approved";
    } else {
      currentApproverId = chain[0].approverId;
      status = "Pending";
    }
  } else {
    status = "Approved";
  }

  const newLeave = {
    id: "lv-" + Date.now(),
    userId: currentUser.id,
    employeeName: currentUser.fullname.replace(/\s*\(.*\)\s*/g, ""),
    designation: (currentUser.fullname.match(/\(([^)]+)\)/) || [])[1] || currentUser.role,
    contactNo: currentUser.phone || "N/A",
    fromDate: fromDateStr,
    toDate: toDateStr,
    totalDays: validation.requestedDays,
    reason: reason,
    status: status,
    currentApproverId: currentApproverId,
    approvalChain: chain,
    createdAt: new Date().toISOString()
  };

  const leaves = db.getLeaves() || [];
  leaves.push(newLeave);
  db.saveLeaves(leaves);

  db.logActivity(
    `${currentUser.fullname.replace(/\s*\(.*\)\s*/g, "")} submitted a leave application for ${validation.requestedDays} day(s) starting ${fromDateStr}.`,
    "info"
  );

  showToast("Leave application submitted successfully!", "success");
  
  document.getElementById("apply-leave-modal").classList.add("hidden");
  document.getElementById("leave-application-form").reset();

  renderLeavesTab();
}

function approveLeaveRequest(leaveId) {
  const leaves = db.getLeaves() || [];
  const leave = leaves.find(lv => lv.id === leaveId);
  if (!leave) return;

  if (leave.currentApproverId !== currentUser.id) {
    showToast("You are not authorized to approve this leave request.", "error");
    return;
  }

  const currentStep = leave.approvalChain.find(step => step.approverId === currentUser.id && step.status === "Pending");
  if (currentStep) {
    currentStep.status = "Approved";
    currentStep.actionDate = new Date().toISOString();
  }

  const nextStepIndex = leave.approvalChain.findIndex(step => step.status === "Pending");
  if (nextStepIndex !== -1) {
    if (leave.approvalChain[nextStepIndex].isRecord === true) {
      // Next step is co-founder record-only â€” auto-approve and finalize leave as Approved
      leave.approvalChain[nextStepIndex].status = "Approved";
      leave.approvalChain[nextStepIndex].actionDate = new Date().toISOString();
      leave.currentApproverId = null;
      leave.status = "Approved";
    } else {
      leave.currentApproverId = leave.approvalChain[nextStepIndex].approverId;
      leave.status = "Pending";
    }
  } else {
    leave.currentApproverId = null;
    leave.status = "Approved";
  }

  db.saveLeaves(leaves);

  db.logActivity(
    `Leave application for ${leave.employeeName} approved by ${currentUser.fullname.replace(/\s*\(.*\)\s*/g, "")}. Status: ${leave.status}.`,
    "success"
  );

  showToast("Leave application approved!", "success");
  renderLeavesTab();
}

function rejectLeaveRequest(leaveId) {
  const leaves = db.getLeaves() || [];
  const leave = leaves.find(lv => lv.id === leaveId);
  if (!leave) return;

  if (leave.currentApproverId !== currentUser.id) {
    showToast("You are not authorized to reject this leave request.", "error");
    return;
  }

  const currentStep = leave.approvalChain.find(step => step.approverId === currentUser.id && step.status === "Pending");
  if (currentStep) {
    currentStep.status = "Rejected";
    currentStep.actionDate = new Date().toISOString();
  }

  leave.currentApproverId = null;
  leave.status = "Rejected";

  db.saveLeaves(leaves);

  db.logActivity(
    `Leave application for ${leave.employeeName} rejected by ${currentUser.fullname.replace(/\s*\(.*\)\s*/g, "")}.`,
    "danger"
  );

  showToast("Leave application rejected.", "info");
  renderLeavesTab();
}

let currentLeavesSubtab = "my-leaves";

function renderLeavesTab() {
  const leaves = db.getLeaves() || [];
  const users = db.getUsers() || [];
  
  // 1. My Leave Applications
  const myLeavesCard = document.getElementById("my-leaves-card");
  const openApplyLeaveModalBtn = document.getElementById("open-apply-leave-modal");
  const teamHistoryCard = document.getElementById("team-leaves-history-card");
  
  const subtabsNav = document.getElementById("leaves-subtabs-nav");
  const subtabMyLeavesBtn = document.getElementById("subtab-my-leaves");
  const subtabTeamHistoryBtn = document.getElementById("subtab-team-history");

  const isManagerOrAdmin = currentUser.role === "Admin" || currentUser.role === "Manager" || currentUser.role === "Technical Lead" || currentUser.role === "Team Lead";

  // Dynamic Subtab Button Texts
  if (subtabMyLeavesBtn) {
    subtabMyLeavesBtn.innerHTML = isManagerOrAdmin 
      ? `<i data-lucide="user" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i>My Leaves`
      : `<i data-lucide="calendar" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i>Leave Application`;
  }
  if (subtabTeamHistoryBtn) {
    subtabTeamHistoryBtn.innerHTML = isManagerOrAdmin
      ? `<i data-lucide="history" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i>Team Leaves History`
      : `<i data-lucide="history" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i>Leave History`;
  }
  lucide.createIcons();

  if (currentUser.role === "Admin") {
    if (subtabsNav) subtabsNav.classList.add("hidden");
    if (myLeavesCard) myLeavesCard.classList.add("hidden");
    if (openApplyLeaveModalBtn) openApplyLeaveModalBtn.classList.add("hidden");
    if (teamHistoryCard) teamHistoryCard.classList.remove("hidden");
  } else {
    // Both managers and regular employees see subtabs now!
    if (subtabsNav) subtabsNav.classList.remove("hidden");
    if (openApplyLeaveModalBtn) openApplyLeaveModalBtn.classList.remove("hidden");

    // Toggle subtab buttons active styles and card visibility
    if (currentLeavesSubtab === "my-leaves") {
      if (myLeavesCard) myLeavesCard.classList.remove("hidden");
      if (teamHistoryCard) teamHistoryCard.classList.add("hidden");

      if (subtabMyLeavesBtn) {
        subtabMyLeavesBtn.style.border = "1px solid var(--accent-color)";
        subtabMyLeavesBtn.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
        subtabMyLeavesBtn.style.color = "#10b981";
        subtabMyLeavesBtn.style.fontWeight = "600";
      }
      if (subtabTeamHistoryBtn) {
        subtabTeamHistoryBtn.style.border = "1px solid var(--border-color)";
        subtabTeamHistoryBtn.style.backgroundColor = "var(--bg-primary)";
        subtabTeamHistoryBtn.style.color = "var(--text-muted)";
        subtabTeamHistoryBtn.style.fontWeight = "500";
      }
    } else {
      // For managers: hide myLeavesCard, show teamHistoryCard
      // For employees: show myLeavesCard, hide teamHistoryCard
      if (isManagerOrAdmin) {
        if (myLeavesCard) myLeavesCard.classList.add("hidden");
        if (teamHistoryCard) teamHistoryCard.classList.remove("hidden");
      } else {
        if (myLeavesCard) myLeavesCard.classList.remove("hidden");
        if (teamHistoryCard) teamHistoryCard.classList.add("hidden");
      }

      if (subtabTeamHistoryBtn) {
        subtabTeamHistoryBtn.style.border = "1px solid var(--accent-color)";
        subtabTeamHistoryBtn.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
        subtabTeamHistoryBtn.style.color = "#10b981";
        subtabTeamHistoryBtn.style.fontWeight = "600";
      }
      if (subtabMyLeavesBtn) {
        subtabMyLeavesBtn.style.border = "1px solid var(--border-color)";
        subtabMyLeavesBtn.style.backgroundColor = "var(--bg-primary)";
        subtabMyLeavesBtn.style.color = "var(--text-muted)";
        subtabMyLeavesBtn.style.fontWeight = "500";
      }
    }
  }

  // Dynamic Header Text for My Leaves Card
  if (myLeavesCard) {
    const myLeavesHeader = myLeavesCard.querySelector("h3");
    if (myLeavesHeader) {
      if (isManagerOrAdmin) {
        myLeavesHeader.innerHTML = `<i data-lucide="calendar" class="text-accent" style="color: #10b981;"></i> My Leave Applications`;
      } else {
        myLeavesHeader.innerHTML = currentLeavesSubtab === "my-leaves"
          ? `<i data-lucide="calendar" class="text-accent" style="color: #10b981;"></i> My Leave Applications`
          : `<i data-lucide="history" class="text-accent" style="color: #10b981;"></i> My Leaves History`;
      }
      lucide.createIcons();
    }
  }

  if (currentUser.role !== "Admin") {
    let myLeaves = [];
    if (isManagerOrAdmin) {
      myLeaves = leaves.filter(lv => lv.userId === currentUser.id);
    } else {
      if (currentLeavesSubtab === "my-leaves") {
        // Pending only
        myLeaves = leaves.filter(lv => lv.userId === currentUser.id && lv.status === "Pending");
      } else {
        // Approved or Rejected only
        myLeaves = leaves.filter(lv => lv.userId === currentUser.id && (lv.status === "Approved" || lv.status === "Rejected"));
      }
    }
    const myTableBody = document.getElementById("my-leaves-table-body");
    if (myTableBody) {
      myTableBody.innerHTML = "";
      if (myLeaves.length === 0) {
        myTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No leave applications found.</td></tr>`;
      } else {
        myLeaves.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
        myLeaves.forEach(lv => {
          let approverText = lv.status === "Pending" ? "Pending Approval" : lv.status;

          let statusClass = "badge-employee";
          if (lv.status === "Approved") statusClass = "badge-technical-lead";
          else if (lv.status === "Rejected") statusClass = "badge-admin";
          else statusClass = "badge-team-lead";

          myTableBody.innerHTML += `
            <tr>
              <td>${lv.fromDate}</td>
              <td>${lv.toDate}</td>
              <td>${lv.totalDays}</td>
              <td>${lv.reason}</td>
              <td><strong>${approverText}</strong></td>
              <td><span class="badge ${statusClass}">${lv.status}</span></td>
            </tr>
          `;
        });
      }
    }
  }

  // 2. Pending Team Leaves (shown ONLY to current level approver in hierarchy sequence)
  const pendingApprovalsCard = document.getElementById("pending-approvals-card");
  const pendingTableBody = document.getElementById("pending-leaves-table-body");
  
  if (pendingApprovalsCard && pendingTableBody) {
    const pendingLeaves = leaves.filter(lv => {
      if (lv.status !== "Pending") return false;
      // Strict hierarchy: Only show leave to the current active stage approver
      return lv.currentApproverId === currentUser.id;
    });
    
    if (pendingLeaves.length > 0) {
      pendingApprovalsCard.classList.remove("hidden");
      pendingTableBody.innerHTML = "";
      
      pendingLeaves.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      pendingLeaves.forEach(lv => {
        const chain = lv.approvalChain || [];
        const currentStepIndex = chain.findIndex(step => step.status === "Pending");
        const stageText = currentStepIndex !== -1 ? `Level ${currentStepIndex + 1} of ${chain.length}` : "Pending";
        
        pendingTableBody.innerHTML += `
          <tr>
            <td><strong>${lv.employeeName}</strong></td>
            <td>${lv.designation}</td>
            <td>From ${lv.fromDate} to ${lv.toDate}</td>
            <td>${lv.totalDays}</td>
            <td>${lv.reason}</td>
            <td><span class="badge badge-manager">${stageText}</span></td>
            <td>
              <div class="leave-action-btn-group">
                <button class="btn btn-primary btn-icon-only approve-leave-btn" data-id="${lv.id}" title="Approve Leave"><i data-lucide="check"></i></button>
                <button class="btn btn-danger btn-icon-only reject-leave-btn" data-id="${lv.id}" title="Reject Leave"><i data-lucide="x"></i></button>
              </div>
            </td>
          </tr>
        `;
      });

      document.querySelectorAll(".approve-leave-btn").forEach(btn => {
        btn.onclick = () => approveLeaveRequest(btn.getAttribute("data-id"));
      });
      document.querySelectorAll(".reject-leave-btn").forEach(btn => {
        btn.onclick = () => rejectLeaveRequest(btn.getAttribute("data-id"));
      });
      
      lucide.createIcons();
    } else {
      pendingApprovalsCard.classList.add("hidden");
      pendingTableBody.innerHTML = "";
    }
  }

  // 3. Team Leaves History (shown to everyone!)
  const teamHistoryBody = document.getElementById("team-leaves-history-table-body");
  const filterSelect = document.getElementById("history-leave-filter");

  if (teamHistoryCard && teamHistoryBody) {
    if (isManagerOrAdmin) {
      const isSubtabHistory = currentLeavesSubtab === "team-history" || currentUser.role === "Admin";
      if (isSubtabHistory) {
        teamHistoryCard.classList.remove("hidden");
      } else {
        teamHistoryCard.classList.add("hidden");
      }

      teamHistoryBody.innerHTML = "";

      const filterVal = filterSelect ? filterSelect.value : "all";
      if (filterSelect && !filterSelect.dataset.listenerBound) {
        filterSelect.onchange = () => renderLeavesTab();
        filterSelect.dataset.listenerBound = "true";
      }

      const filteredLeaves = leaves.filter(lv => {
        if (lv.userId === currentUser.id) return false;
        
        let hasAccess = false;
        const myStep = (lv.approvalChain || []).find(step => step.approverId === currentUser.id);

        if (currentUser.role === "Admin") {
          hasAccess = (lv.status === "Approved" || lv.status === "Rejected");
        } else {
          hasAccess = (myStep && (myStep.status === "Approved" || myStep.status === "Rejected")) ||
                      (lv.status === "Approved" || lv.status === "Rejected");
        }

        if (!hasAccess) return false;

        const isApproved = lv.status === "Approved" || (myStep && myStep.status === "Approved" && lv.status === "Pending");
        const isDeclined = lv.status === "Rejected" || (myStep && myStep.status === "Rejected");

        if (filterVal === "approved") return isApproved;
        if (filterVal === "declined") return isDeclined;
        return isApproved || isDeclined;
      });

      if (filteredLeaves.length === 0) {
        teamHistoryBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No matching leave history records found.</td></tr>`;
      } else {
        filteredLeaves.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
        filteredLeaves.forEach(lv => {
          const chain = lv.approvalChain || [];
          const currentStepIndex = chain.findIndex(s => s.status === "Pending");
          
          let stageText = "";
          let cellHtml = "";

          if (currentUser.role === "Admin") {
            stageText = currentStepIndex !== -1 ? `Level ${currentStepIndex + 1}/${chain.length} Pending` : "All Levels Approved";
            
            // Derive top-level heads dynamically
            const topHeadIds = users
              .filter(u => u.role === "Admin" && (!u.reportingManagerId || u.reportingManagerId === "none"))
              .map(u => u.id);
            const viewerIsHead = topHeadIds.includes(currentUser.id);
            const viewerDisplayName = (currentUser.fullname || currentUser.username).replace(/\s*\(.*\)\s*/g, "");
            const viewerDisplayRole = (currentUser.fullname && currentUser.fullname.match(/\(([^)]+)\)/))
                ? currentUser.fullname.match(/\(([^)]+)\)/)[1]
                : currentUser.role;

            if (lv.status === "Approved") {
              const approvedSteps = chain.filter(s => s.status === "Approved");
              if (approvedSteps.length > 0) {
                const names = approvedSteps.map(s => {
                  // For record-only steps: show current viewer's name if they are a top-level head
                  if (s.isRecord && viewerIsHead) return viewerDisplayName;
                  return s.approverName;
                }).join(" → ");
                stageText = `Approved by: ${names}`;
              } else {
                stageText = "Approved";
              }
            } else if (lv.status === "Rejected") {
              const rejectedStep = chain.find(s => s.status === "Rejected");
              stageText = rejectedStep ? `Declined by ${rejectedStep.approverName}` : "Declined";
            }

            const tooltipLines = chain.map(step => {
              const dateStr = step.actionDate ? new Date(step.actionDate).toLocaleString() : "N/A";
              let displayName = step.approverName;
              let displayRole = step.approverRole;
              if (step.isRecord && viewerIsHead) {
                  displayName = viewerDisplayName;
                  displayRole = viewerDisplayRole;
              }
              return `${displayName} (${displayRole}): ${step.status} on ${dateStr}`;
            }).join("\n");

            cellHtml = `
              <td title="${tooltipLines}">
                <span class="badge badge-manager hover-interactive" style="cursor: pointer; text-decoration: underline; white-space: normal; text-align: left; line-height: 1.4; padding: 6px 10px;" onclick="showLeaveChainModal('${lv.id}')">
                  ${stageText} <i data-lucide="info" style="width: 12px; height: 12px; display: inline-block; vertical-align: middle; margin-left: 4px;"></i>
                </span>
              </td>
            `;
          } else {
            if (lv.status === "Approved") {
              stageText = "All Levels Approved";
            } else if (lv.status === "Rejected") {
              stageText = "Declined";
            } else {
              stageText = "Pending Approval";
            }

            cellHtml = `
              <td>
                <span class="badge badge-manager" style="white-space: normal; text-align: left; line-height: 1.4; padding: 6px 10px;">
                  ${stageText}
                </span>
              </td>
            `;
          }

          let statusClass = "badge-team-lead"; // Pending
          if (lv.status === "Approved") statusClass = "badge-technical-lead";
          else if (lv.status === "Rejected") statusClass = "badge-admin";
          
          teamHistoryBody.innerHTML += `
            <tr>
              <td><strong>${lv.employeeName}</strong></td>
              <td>${lv.designation}</td>
              <td>${lv.fromDate} to ${lv.toDate}</td>
              <td>${lv.totalDays}</td>
              <td>${lv.reason}</td>
              ${cellHtml}
              <td><span class="badge ${statusClass}">${lv.status}</span></td>
            </tr>
          `;
        });
        
        lucide.createIcons();
      }
    } else {
      teamHistoryCard.classList.add("hidden");
    }
  }
}

function showLeaveChainModal(leaveId) {
  const leaves = db.getLeaves() || [];
  const leave = leaves.find(lv => lv.id === leaveId);
  if (!leave) return;

  const container = document.getElementById("leave-chain-flow-container");
  if (!container) return;

  container.innerHTML = "";

  // 1. Applicant node
  const applyDate = new Date(leave.createdAt).toLocaleString();
  let applicantHtml = `
    <div class="chain-node" style="position: relative;">
      <div class="chain-dot" style="position: absolute; left: -33px; top: 4px; width: 16px; height: 16px; border-radius: 50%; background-color: var(--accent-color); border: 3px solid var(--card-bg);"></div>
      <div class="chain-content">
        <h4 style="margin: 0; font-size: 0.95rem; color: var(--text-primary);">${leave.employeeName} (Applicant)</h4>
        <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: var(--text-muted);">Applied on ${applyDate}</p>
        <p style="margin: 2px 0 0 0; font-size: 0.8rem; font-style: italic; color: var(--text-muted);">"Reason: ${leave.reason}"</p>
      </div>
    </div>
  `;
  container.innerHTML += applicantHtml;

  // 2. Chain approval nodes
  const chain = leave.approvalChain || [];
  const users = db.getUsers() || [];

  // Top-level heads (no reporting manager, Admin role) — dynamically derived
  const topLevelHeadIds = users
    .filter(u => u.role === "Admin" && (!u.reportingManagerId || u.reportingManagerId === "none"))
    .map(u => u.id);

  // If the current viewer is a top-level head, they "own" all record-only steps
  const viewerIsHead = topLevelHeadIds.includes(currentUser.id);

  chain.forEach(step => {
    let dotColor = "var(--text-muted)";
    let statusColor = "var(--text-muted)";
    let displayStatus = step.status;

    // For isRecord steps: if viewer is a co-founder, show THEIR name (not the stored one)
    let displayName = step.approverName;
    let displayRole = step.approverRole;
    if (step.isRecord && viewerIsHead) {
      displayName = (currentUser.fullname || currentUser.username).replace(/\s*\(.*\)\s*/g, "");
      displayRole = (currentUser.fullname && currentUser.fullname.match(/\(([^)]+)\)/))
        ? currentUser.fullname.match(/\(([^)]+)\)/)[1]
        : currentUser.role;
    }

    if (step.isRecord && step.status === "Approved") {
      dotColor = "#3b82f6";
      statusColor = "#3b82f6";
      displayStatus = "On Record";
    } else if (step.status === "Approved") {
      dotColor = "#10b981";
      statusColor = "#10b981";
    } else if (step.status === "Rejected") {
      dotColor = "#ef4444";
      statusColor = "#ef4444";
    }

    const recordBadge = step.isRecord
      ? `<span style="font-size:0.68rem; background:#3b82f620; color:#3b82f6; padding:1px 7px; border-radius:4px; margin-left:6px; vertical-align:middle;">Record Only</span>`
      : "";

    const actionDate = step.actionDate ? new Date(step.actionDate).toLocaleString() : "Awaiting action";
    let stepHtml = `
      <div class="chain-node" style="position: relative;">
        <div class="chain-dot" style="position: absolute; left: -33px; top: 4px; width: 16px; height: 16px; border-radius: 50%; background-color: ${dotColor}; border: 3px solid var(--card-bg);"></div>
        <div class="chain-content">
          <h4 style="margin: 0; font-size: 0.95rem; color: var(--text-primary);">${displayName} (${displayRole})${recordBadge}</h4>
          <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: ${statusColor}; font-weight: 600;">Status: ${displayStatus}</p>
          <p style="margin: 2px 0 0 0; font-size: 0.8rem; color: var(--text-muted);">${actionDate}</p>
        </div>
      </div>
    `;
    container.innerHTML += stepHtml;
  });


  const modal = document.getElementById("leave-chain-modal");
  if (modal) modal.classList.remove("hidden");
  lucide.createIcons();
}
window.showLeaveChainModal = showLeaveChainModal;

function renderAttendanceTab() {
  let isHead = currentUser.role === "Admin" || currentUser.role === "Manager" || currentUser.role === "Technical Lead" || currentUser.role === "Team Lead";
  
  if (currentUser.domain === "Marketing") {
    if (!["usr-parneet", "usr-prabhroop", "usr-mahakpreet"].includes(currentUser.id)) {
      isHead = false;
    }
  }

  const toggleWrapper = document.getElementById("attendance-toggle-wrapper");
  const btnMyAttendance = document.getElementById("btn-toggle-my-attendance");
  const btnTeamAttendance = document.getElementById("btn-toggle-team-attendance");

  // Always show the employee's own attendance dashboard initially
  document.getElementById("attendance-employee-view").classList.remove("hidden");
  document.getElementById("attendance-manager-view").classList.add("hidden");
  
  if (toggleWrapper) {
    toggleWrapper.classList.add("hidden");
    toggleWrapper.style.display = "none";
  }

  renderEmployeeAttendanceDashboard();

  if (isHead) {
    if (toggleWrapper) {
      toggleWrapper.classList.remove("hidden");
      toggleWrapper.style.display = "flex";
      
      // Default state for Managers: Team Attendance
      document.getElementById("attendance-manager-view").classList.remove("hidden");
      document.getElementById("attendance-employee-view").classList.add("hidden");
      if (btnTeamAttendance) btnTeamAttendance.className = "btn btn-primary";
      if (btnMyAttendance) btnMyAttendance.className = "btn btn-secondary";

      if (btnMyAttendance) {
        btnMyAttendance.onclick = () => {
          document.getElementById("attendance-employee-view").classList.remove("hidden");
          document.getElementById("attendance-manager-view").classList.add("hidden");
          btnMyAttendance.className = "btn btn-primary";
          btnTeamAttendance.className = "btn btn-secondary";
        };
      }

      if (btnTeamAttendance) {
        btnTeamAttendance.onclick = () => {
          document.getElementById("attendance-manager-view").classList.remove("hidden");
          document.getElementById("attendance-employee-view").classList.add("hidden");
          btnTeamAttendance.className = "btn btn-primary";
          btnMyAttendance.className = "btn btn-secondary";
        };
      }
    }
    
    const dateInput = document.getElementById("attendance-date");
    if (!dateInput.value) {
      const todayStr = new Date().toISOString().split("T")[0];
      dateInput.value = todayStr;
    }

    const meetingSelect = document.getElementById("attendance-meeting-type");

    renderManagerAttendanceSheet();

    dateInput.onchange = () => {
      renderManagerAttendanceSheet();
    };
    meetingSelect.onchange = () => {
      renderManagerAttendanceSheet();
    };

    // Bind footer actions
    const btnSubmit = document.getElementById("btn-submit-attendance");
    if (btnSubmit) {
      btnSubmit.onclick = () => {
        submitManagerAttendance();
      };
    }

    const btnDownload = document.getElementById("btn-download-attendance");
    if (btnDownload) {
      btnDownload.onclick = () => {
        downloadAttendancePDF();
      };
    }
  } else {
    document.getElementById("attendance-manager-view").classList.add("hidden");
  }
}

function validateAttendanceDate(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedDate = new Date(dateStr);
  selectedDate.setHours(0, 0, 0, 0);

  // Check 1: Future date check
  if (selectedDate > today) {
    return { valid: false, message: "Attendance cannot be marked for future dates." };
  }

  // Check 2: Max 2 days in the past check
  const diffTime = today - selectedDate;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  if (diffDays > 2) {
    return { valid: false, message: "Attendance can only be marked up to 2 days after the target date." };
  }

  return { valid: true };
}

function renderManagerAttendanceSheet() {
  const selectedDate = document.getElementById("attendance-date").value;
  const selectedMeetingType = document.getElementById("attendance-meeting-type").value;
  const tbody = document.getElementById("attendance-subordinates-table-body");
  if (!tbody) return;

  const btnSubmit = document.getElementById("btn-submit-attendance");

  // Validate date constraints
  const dateValidation = validateAttendanceDate(selectedDate);
  if (!dateValidation.valid) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 32px; color: var(--color-danger); font-weight: 600;">
      <i data-lucide="lock" style="vertical-align: middle; margin-right: 8px;"></i> ${dateValidation.message}
    </td></tr>`;
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.style.opacity = 0.5;
      btnSubmit.style.cursor = "not-allowed";
    }
    lucide.createIcons();
    return;
  }

  // If valid, enable submit button
  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.style.opacity = 1;
    btnSubmit.style.cursor = "pointer";
  }

  tbody.innerHTML = "";

  const users = db.getUsers() || [];
  const attendance = db.getAttendance() || [];
  let subordinates = [];
  if (currentUser.role === "Admin") {
    subordinates = users.filter(u => u.id !== currentUser.id);
  } else {
    subordinates = getSubordinates(currentUser.id, users);
  }

  if (subordinates.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 24px; color: var(--text-secondary);">No team members found.</td></tr>`;
    return;
  }

  // Clear and initialize drafts state from database
  attendanceDrafts = {};
  subordinates.forEach(sub => {
    const subRoleInfo = getUserRoleInfo(sub);
    const record = attendance.find(a => a.userId === sub.id && a.date === selectedDate && a.meetingType === selectedMeetingType);
    
    // If database has record, load its status; otherwise default to Absent.
    const status = record ? record.status : "Absent";
    attendanceDrafts[sub.id] = status;

    const isPresent = status === "Present";

    tbody.innerHTML += `
      <tr>
        <td>
          <div class="user-info-cell">
            <div class="user-avatar-small" style="background-color: var(--primary-color); color: #fff; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.85rem;">
              ${sub.fullname.charAt(0)}
            </div>
            <div>
              <div class="user-fullname">${sub.fullname.replace(/\s*\(.*\)\s*/g, "")}</div>
              <div class="user-username">@${sub.username}</div>
            </div>
          </div>
        </td>
        <td><span class="role-badge role-${subRoleInfo.badgeClass}">${subRoleInfo.displayRole}</span></td>
        <td><span class="domain-badge">${sub.domain || "Other"}</span></td>
        <td>
          <label class="checkbox-container" style="margin-bottom:0;">
            <input type="checkbox" class="attendance-checkbox" data-uid="${sub.id}" ${isPresent ? 'checked' : ''}>
            <span class="checkbox-checkmark"></span>
            <span class="status-label" style="font-weight: 600; color: ${isPresent ? '#10b981' : '#ef4444'};">
              ${isPresent ? 'Present' : 'Absent'}
            </span>
          </label>
        </td>
      </tr>
    `;
  });

  // Bind change events to dynamically update local drafts mapping (without saving to server yet!)
  document.querySelectorAll(".attendance-checkbox").forEach(chk => {
    chk.onchange = () => {
      const uid = chk.getAttribute("data-uid");
      const status = chk.checked ? "Present" : "Absent";
      attendanceDrafts[uid] = status;

      // Update text and color label instantly in UI
      const label = chk.closest('label').querySelector('.status-label');
      if (label) {
        label.textContent = status;
        label.style.color = chk.checked ? "#10b981" : "#ef4444";
      }
    };
  });

  if (typeof renderTeamAttendanceChart === 'function') {
    renderTeamAttendanceChart();
  }
  lucide.createIcons();
}
async function submitManagerAttendance() {
  const selectedDate = document.getElementById("attendance-date").value;
  const selectedMeetingType = document.getElementById("attendance-meeting-type").value;
  
  const dateValidation = validateAttendanceDate(selectedDate);
  if (!dateValidation.valid) {
    showToast(dateValidation.message, "error");
    return;
  }
  
  const users = db.getUsers() || [];
  const subordinates = users.filter(u => {
    if (u.id === currentUser.id) return false;
    if (currentUser.role === "Admin") return true;
    return u.reportingManagerId === currentUser.id;
  });

  if (subordinates.length === 0) return;

  // Save all drafts to server/cache
  for (const sub of subordinates) {
    const status = attendanceDrafts[sub.id] || "Absent";
    const record = {
      id: "att-" + Date.now() + "-" + sub.id,
      userId: sub.id,
      date: selectedDate,
      meetingType: selectedMeetingType,
      status: status,
      markedById: currentUser.id,
      markedByName: currentUser.fullname.replace(/\s*\(.*\)\s*/g, "")
    };
    await db.saveAttendance(record);
  }

  showToast(`Attendance successfully submitted for ${selectedMeetingType} on ${selectedDate}!`, "success");
  
  // Refresh view
  renderManagerAttendanceSheet();
}

function downloadAttendancePDF() {
  const selectedDate = document.getElementById("attendance-date").value;
  const selectedMeetingType = document.getElementById("attendance-meeting-type").value;
  const users = db.getUsers() || [];
  
  const subordinates = users.filter(u => {
    if (u.id === currentUser.id) return false;
    if (currentUser.role === "Admin") return true;
    return u.reportingManagerId === currentUser.id;
  });

  let rowsHtml = "";
  subordinates.forEach((sub, index) => {
    const status = attendanceDrafts[sub.id] || "Absent";

    rowsHtml += `
      <tr>
        <td>${index + 1}</td>
        <td><strong>${sub.fullname.replace(/\s*\(.*\)\s*/g, "")}</strong></td>
        <td>${sub.role}</td>
        <td>${sub.domain || "Other"}</td>
        <td style="color: ${status === 'Present' ? '#10b981' : '#ef4444'}; font-weight: bold;">
          ${status}
        </td>
      </tr>
    `;
  });

  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <html>
      <head>
        <title>Attendance Sheet - ${selectedDate}</title>
        <style>
          body { font-family: 'Inter', sans-serif; color: #333; padding: 40px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #052f5f; padding-bottom: 20px; }
          .header h1 { color: #052f5f; margin: 0; font-size: 24px; }
          .header p { margin: 5px 0 0; color: #666; font-size: 14px; }
          .meta-grid { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; background: #f8fafc; padding: 12px; border-radius: 6px; }
          .meta-item strong { color: #052f5f; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #e2e8f0; padding: 12px; text-align: left; font-size: 14px; }
          th { background-color: #052f5f; color: white; font-weight: 600; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .footer { margin-top: 50px; text-align: right; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>MedAstraX Workspace Portal</h1>
          <p>Official Attendance Record Sheet</p>
        </div>
        <div class="meta-grid">
          <div class="meta-item"><strong>Date:</strong> ${selectedDate}</div>
          <div class="meta-item"><strong>Meeting Type:</strong> ${selectedMeetingType}</div>
          <div class="meta-item"><strong>Generated By:</strong> ${currentUser.fullname}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 50px;">S.No</th>
              <th>Employee Name</th>
              <th>Role</th>
              <th>Domain</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="footer">
          <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() {
              window.close();
            };
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function renderEmployeeAttendanceDashboard() {
  const tbody = document.getElementById("my-attendance-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  const attendance = db.getAttendance() || [];
  const myLogs = attendance.filter(a => a.userId === currentUser.id);

  myLogs.sort((a, b) => {
    const dateDiff = new Date(b.date) - new Date(a.date);
    if (dateDiff !== 0) return dateDiff;
    return b.meetingType.localeCompare(a.meetingType);
  });

  let presentCount = 0;
  let absentCount = 0;

  myLogs.forEach(log => {
    if (log.status === "Present") presentCount++;
    else absentCount++;

    const badgeClass = log.status === "Present" ? "badge-employee" : "badge-critical";

    tbody.innerHTML += `
      <tr>
        <td><strong>${log.date}</strong></td>
        <td><span class="badge badge-manager">${log.meetingType}</span></td>
        <td><span class="badge ${badgeClass}">${log.status}</span></td>
        <td>${log.markedByName || "System"}</td>
        <td>${new Date(log.createdAt || Date.now()).toLocaleTimeString()}</td>
      </tr>
    `;
  });

  if (myLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--text-secondary);">No attendance logs found.</td></tr>`;
  }

  document.getElementById("att-stats-present").innerText = presentCount;
  document.getElementById("att-stats-absent").innerText = absentCount;

  const totalDays = myLogs.length;
  const percentage = totalDays === 0 ? 0 : Math.round((presentCount / totalDays) * 100);
  document.getElementById("att-stats-rate").innerText = `${percentage}%`;

  // --- Chart.js Graph logic for Daily vs EOD Meetings ---
  const chartCanvas = document.getElementById("employee-attendance-chart");
  if (chartCanvas && typeof Chart !== 'undefined') {
    const dailyLogs = myLogs.filter(log => log.meetingType === "Daily Meeting");
    const dailyPresent = dailyLogs.filter(log => log.status === "Present").length;
    const dailyPercentage = dailyLogs.length === 0 ? 0 : Math.round((dailyPresent / dailyLogs.length) * 100);

    const eodLogs = myLogs.filter(log => log.meetingType === "EOD Meeting");
    const eodPresent = eodLogs.filter(log => log.status === "Present").length;
    const eodPercentage = eodLogs.length === 0 ? 0 : Math.round((eodPresent / eodLogs.length) * 100);

    if (window.employeeAttChart) {
      window.employeeAttChart.destroy();
    }

    const ctx = chartCanvas.getContext("2d");
    window.employeeAttChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Daily Meeting', 'EOD Meeting'],
        datasets: [{
          label: 'Attendance Percentage (%)',
          data: [dailyPercentage, eodPercentage],
          backgroundColor: ['#087f8c', '#10b981'],
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              stepSize: 20
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.parsed.y + '%';
              }
            }
          }
        }
      }
    });
  }
}

// ==================== MEETINGS PORTAL IMPLEMENTATION ====================
let notifiedMeetings = {};

function initMeetingsPortal() {
  const scheduleModal = document.getElementById("schedule-meeting-modal");
  const editModal = document.getElementById("edit-meeting-modal");
  if (!scheduleModal || !editModal) return;

  // Request browser notification permission if not asked yet
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }

  // Render scheduled meetings on portal initialization
  renderScheduledMeetings();
  
  // Trigger upcoming meeting check immediately
  checkUpcomingMeetings();
  
  // Open Schedule Modal
  const btnOpenSched = document.getElementById("btn-open-sched-modal");
  if (btnOpenSched) {
    btnOpenSched.onclick = () => {
      // Populate participants list with checkboxes for all other users
      const container = document.getElementById("sched-participants-list");
      if (container) {
        container.innerHTML = "";
        const users = db.getUsers() || [];
        
        // Sort users by name, exclude current user
        users.forEach(u => {
          if (u.id === currentUser.id) return;
          const displayName = u.fullname.replace(/\s*\(.*\)\s*/g, "");
          const div = document.createElement("div");
          div.style.display = "flex";
          div.style.alignItems = "center";
          div.style.gap = "8px";
          div.innerHTML = `
            <input type="checkbox" id="part-${u.id}" value="${u.id}" style="width: auto; margin: 0;">
            <label for="part-${u.id}" style="font-weight: normal; margin: 0; cursor: pointer; color: var(--text-primary); font-size: 13px;">${displayName} (${u.role})</label>
          `;
          container.appendChild(div);
        });
      }
      
      document.getElementById("sched-title").value = "";
      document.getElementById("sched-time").value = "";
      document.getElementById("sched-desc").value = "";
      document.getElementById("sched-room").value = "room-" + Math.random().toString(36).substring(2, 8);
      scheduleModal.classList.remove("hidden");
    };
  }

  // Close Modals
  document.getElementById("close-sched-modal").onclick = () => scheduleModal.classList.add("hidden");
  document.getElementById("cancel-sched-btn").onclick = () => scheduleModal.classList.add("hidden");
  document.getElementById("close-edit-mtg-modal").onclick = () => editModal.classList.add("hidden");
  document.getElementById("cancel-edit-mtg-btn").onclick = () => editModal.classList.add("hidden");

  // Handle Schedule Submit
  const scheduleForm = document.getElementById("schedule-meeting-form");
  if (scheduleForm) {
    scheduleForm.onsubmit = async (e) => {
      e.preventDefault();
      const canManage = currentUser.role === "Admin" || currentUser.id === "usr-vibha" || currentUser.id === "usr-rashika";
      if (!canManage) {
        showToast("Access denied: only Admins, Vibha, or Rashika can schedule meetings.", "error");
        return;
      }
      const title = document.getElementById("sched-title").value.trim();
      const time = document.getElementById("sched-time").value;
      const roomCode = document.getElementById("sched-room").value.trim();
      const description = document.getElementById("sched-desc").value.trim();
      
      // Get checked participants
      const participants = [currentUser.id];
      const checkboxes = document.querySelectorAll("#sched-participants-list input[type='checkbox']");
      checkboxes.forEach(cb => {
        if (cb.checked) {
          participants.push(cb.value);
        }
      });

      if (participants.length === 1) {
        showToast("Please select at least one participant.", "error");
        return;
      }

      const newMtg = {
        id: "mtg-" + Date.now(),
        title,
        time,
        participants,
        isFixed: false,
        roomCode,
        description
      };

      await db.saveMeeting(newMtg);
      scheduleModal.classList.add("hidden");
      showToast("Meeting scheduled successfully!", "success");
    };
  }

  // Handle Edit Submit
  const editForm = document.getElementById("edit-meeting-form");
  if (editForm) {
    editForm.onsubmit = async (e) => {
      e.preventDefault();
      const canManage = currentUser.role === "Admin" || currentUser.id === "usr-vibha" || currentUser.id === "usr-rashika";
      if (!canManage) {
        showToast("Access denied: only Admins, Vibha, or Rashika can change meeting times.", "error");
        return;
      }
      const id = document.getElementById("edit-mtg-id").value;
      const time = document.getElementById("edit-mtg-time").value;
      const description = document.getElementById("edit-mtg-desc").value.trim();
      
      const meetings = db.getMeetings() || [];
      const mtg = meetings.find(m => m.id === id);
      if (mtg) {
        const updatedMtg = { ...mtg, time, description };
        await db.updateMeeting(id, updatedMtg);
        editModal.classList.add("hidden");
        showToast("Meeting updated successfully!", "success");
      }
    };
  }

  // Start background 10-minute check
  setInterval(checkUpcomingMeetings, 30000);
}

function getTechTeamParticipants() {
  const users = db.getUsers() || [];
  const participantIds = new Set();
  
  // Include Vibha and Rashika specifically
  participantIds.add('usr-vibha');
  participantIds.add('usr-rashika');
  
  // Include anyone in Tech domain
  users.forEach(u => {
    if (u.domain === 'Tech') {
      participantIds.add(u.id);
    }
  });
  
  // Include anyone in the subordinates hierarchy of Vibha and Rashika
  if (typeof getSubordinates === 'function') {
    getSubordinates('usr-vibha', users).forEach(s => participantIds.add(s.id));
    getSubordinates('usr-rashika', users).forEach(s => participantIds.add(s.id));
  }
  
  return Array.from(participantIds);
}

function renderScheduledMeetings() {
  const listContainer = document.getElementById("scheduled-meetings-list");
  if (!listContainer) return;
  listContainer.innerHTML = "";

  if (!currentUser) return; // Prevent crashes when not logged in!

  const meetings = db.getMeetings() || [];
  const myMeetings = meetings.filter(m => {
    const participants = m.isFixed ? getTechTeamParticipants() : (m.participants || []);
    return participants.includes(currentUser.id);
  });

  // Enable/disable schedule button
  const canManage = currentUser.role === "Admin" || currentUser.id === "usr-vibha" || currentUser.id === "usr-rashika";
  const btnOpenSched = document.getElementById("btn-open-sched-modal");
  if (btnOpenSched) {
    if (canManage) {
      btnOpenSched.classList.remove("hidden");
    } else {
      btnOpenSched.classList.add("hidden");
    }
  }

  if (myMeetings.length === 0) {
    listContainer.innerHTML = `<div style="text-align: center; color: var(--text-secondary); font-size: 13px; padding: 12px 0;">No meetings scheduled.</div>`;
    return;
  }

  myMeetings.forEach(m => {
    const item = document.createElement("div");
    item.style.backgroundColor = "rgba(5, 47, 95, 0.03)";
    item.style.border = "1px solid var(--border-color)";
    item.style.borderRadius = "var(--radius-sm)";
    item.style.padding = "12px";
    item.style.display = "flex";
    item.style.flexDirection = "column";
    item.style.gap = "8px";

    // Format Time: 17:30 -> 05:30 PM
    const [hrs, mins] = m.time.split(':').map(Number);
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    const dispHrs = hrs % 12 || 12;
    const dispMins = mins < 10 ? '0' + mins : mins;
    const timeStr = `${dispHrs}:${dispMins} ${ampm}`;

    // Get participants names
    const participants = m.isFixed ? getTechTeamParticipants() : (m.participants || []);
    const participantNames = participants.map(pid => {
      const u = db.getUsers().find(x => x.id === pid);
      return u ? u.fullname.replace(/\s*\(.*\)\s*/g, "") : pid;
    }).join(", ");

    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: start; gap: 8px;">
        <div>
          <strong style="color: var(--text-primary); font-size: 14px; display: block;">${m.title}</strong>
          <span style="font-size: 12px; color: var(--text-secondary); display: flex; align-items: center; gap: 4px; margin-top: 2px;">
            <i data-lucide="clock" style="width: 12px; height: 12px;"></i> ${timeStr} ${m.isFixed ? '<span class="badge badge-lead" style="font-size: 9px; padding: 1px 4px; margin-left: 4px;">Fixed</span>' : ''}
          </span>
        </div>
        <button type="button" class="btn btn-primary btn-sm btn-join-mtg" data-room="${m.roomCode}" style="padding: 4px 8px; font-size: 12px; display: flex; align-items: center; gap: 4px;">
          <i data-lucide="video" style="width: 12px; height: 12px;"></i> Join
        </button>
      </div>
      ${m.description ? `
      <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.4; margin-top: 2px; padding: 4px 0;">
        ${m.description}
      </div>
      ` : ''}
      <div style="font-size: 11px; color: var(--text-secondary); border-top: 1px dashed var(--border-color); padding-top: 6px;">
        <strong>Team:</strong> <span title="${participantNames}">${participantNames.length > 40 ? participantNames.substring(0, 37) + "..." : participantNames}</span>
      </div>
      ${canManage ? `
        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
          <button type="button" class="btn-edit-mtg-time" data-id="${m.id}" data-title="${m.title}" data-time="${m.time}" style="background: none; border: none; color: var(--primary-color); font-size: 11px; font-weight: 500; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 2px;">
            <i data-lucide="edit-2" style="width: 10px; height: 10px;"></i> Change Time
          </button>
          ${!m.isFixed ? `
            <button type="button" class="btn-delete-mtg" data-id="${m.id}" style="background: none; border: none; color: var(--color-danger); font-size: 11px; font-weight: 500; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 2px;">
              <i data-lucide="trash-2" style="width: 10px; height: 10px;"></i> Delete
            </button>
          ` : ''}
        </div>
      ` : ''}
    `;

    listContainer.appendChild(item);
  });

  // Re-initialize click handlers for the list items
  listContainer.querySelectorAll(".btn-join-mtg").forEach(btn => {
    btn.onclick = () => {
      const room = btn.getAttribute("data-room");
      document.getElementById("meeting-room-input").value = room;
      document.getElementById("btn-join-meeting").click();
    };
  });

  if (canManage) {
    listContainer.querySelectorAll(".btn-edit-mtg-time").forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-id");
        const title = btn.getAttribute("data-title");
        const time = btn.getAttribute("data-time");
        
        const meetings = db.getMeetings() || [];
        const mtg = meetings.find(x => x.id === id);
        const desc = mtg ? (mtg.description || "") : "";
        
        document.getElementById("edit-mtg-id").value = id;
        document.getElementById("edit-mtg-title").value = title;
        document.getElementById("edit-mtg-time").value = time;
        document.getElementById("edit-mtg-desc").value = desc;
        
        document.getElementById("edit-meeting-modal").classList.remove("hidden");
      };
    });

    listContainer.querySelectorAll(".btn-delete-mtg").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.getAttribute("data-id");
        if (confirm("Are you sure you want to delete this custom meeting?")) {
          await db.deleteMeeting(id);
          showToast("Meeting deleted.", "info");
        }
      };
    });
  }

  // Refresh Lucide Icons in the newly rendered list
  lucide.createIcons();
}

function showBrowserNotification(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: '/medastrax_logo.png' });
  }
}

function checkUpcomingMeetings() {
  if (typeof currentUser === 'undefined' || !currentUser) return;
  const now = new Date();
  const todayStr = now.toDateString();
  const meetings = db.getMeetings() || [];
  
  meetings.forEach(m => {
    const participants = m.isFixed ? getTechTeamParticipants() : (m.participants || []);
    if (participants.includes(currentUser.id)) {
      const [hrs, mins] = m.time.split(':').map(Number);
      const targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hrs, mins, 0, 0);
      const diffMs = targetTime - now;
      const diffMins = Math.floor(diffMs / 60000);
      
      const key = `${m.id}-${m.time}-${todayStr}`;
      // Trigger when remaining time is 10 minutes or less, but meeting has not started
      if (diffMins <= 10 && diffMins >= 0 && !notifiedMeetings[key]) {
        notifiedMeetings[key] = true;
        
        const ampm = hrs >= 12 ? 'PM' : 'AM';
        const dispHrs = hrs % 12 || 12;
        const dispMins = mins < 10 ? '0' + mins : mins;
        const timeStr = `${dispHrs}:${dispMins} ${ampm}`;
        
        const msg = diffMins === 0 ? `Your "${m.title}" is starting now!` : `Your "${m.title}" is starting in ${diffMins} minutes (at ${timeStr})!`;
        
        // Show clickable Toast Notification to switch to Meetings tab
        const toastEl = showToast(`${msg} Click to join.`, "info");
        if (toastEl) {
          toastEl.style.cursor = "pointer";
          toastEl.onclick = () => {
            switchTab("meetings");
          };
        }
        
        // Play notification sound
        playNotificationBeep();

        // Show native browser notification
        showBrowserNotification(`Meeting Alert: ${m.title}`, msg);
      }
    }
  });
}

function playNotificationBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Beep 1
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
    gain1.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    osc1.start();
    osc1.stop(audioCtx.currentTime + 0.15);
    
    // Beep 2 (slightly delayed)
    setTimeout(() => {
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1046.5, audioCtx.currentTime); // C6 note
      gain2.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
      osc2.start();
      osc2.stop(audioCtx.currentTime + 0.2);
    }, 150);
  } catch (err) {
    console.error("Audio beep failed:", err);
  }
}

// --------------------------------------------------------------------------
// 11. Core Event Listeners Initialization



// --------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  // Check if loaded via file:// protocol
  if (window.location.protocol === "file:") {
    setTimeout(() => {
      showToast("Warning: Running via file://. Please use http://localhost:8000", "warning");
    }, 1000);
    const banner = document.createElement("div");
    banner.style.position = "fixed";
    banner.style.top = "0";
    banner.style.left = "0";
    banner.style.width = "100%";
    banner.style.backgroundColor = "#e11d48";
    banner.style.color = "#fff";
    banner.style.padding = "14px";
    banner.style.textAlign = "center";
    banner.style.fontWeight = "600";
    banner.style.zIndex = "999999";
    banner.style.fontSize = "14px";
    banner.style.fontFamily = "system-ui, sans-serif";
    banner.style.boxShadow = "0 4px 6px -1px rgba(0,0,0,0.2)";
    banner.innerHTML = `
      âš ï¸ Running directly from files. Database APIs are disabled. 
      Please open <a href="http://localhost:8000" target="_blank" style="color: #fff; text-decoration: underline; margin-left: 8px; font-weight: 700;">http://localhost:8000</a> in your browser.
    `;
    document.body.prepend(banner);
  }

  // Init Backend Cache from PostgreSQL
  await initBackendCache();

  // Init Meetings Portal
  initMeetingsPortal();







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







  // Custom Domain Toggle



  const domainSelect = document.getElementById("new-domain");



  const customDomainWrapper = document.getElementById("custom-domain-wrapper");



  const customDomainInput = document.getElementById("new-custom-domain");



  domainSelect.addEventListener("change", () => {



    if (domainSelect.value === "Other") {



      customDomainWrapper.classList.remove("hidden");



      customDomainInput.required = true;



    } else {



      customDomainWrapper.classList.add("hidden");



      customDomainInput.required = false;



      customDomainInput.value = "";



    }



  });







  // Username and Password Autocomplete / Suggestion from Full Name



  const fullnameInput = document.getElementById("new-fullname");



  const usernameInput = document.getElementById("new-username");



  const passwordInput = document.getElementById("new-password");







  usernameInput.addEventListener("input", () => {



    if (usernameInput.value !== usernameInput.dataset.lastAuto) {



      usernameInput.dataset.autoGenerated = "false";



    }



  });







  passwordInput.addEventListener("input", () => {



    if (passwordInput.value !== passwordInput.dataset.lastAuto) {



      passwordInput.dataset.autoGenerated = "false";



    }



  });







  fullnameInput.addEventListener("input", () => {



    const nameVal = fullnameInput.value.trim();



    const isUserAuto = usernameInput.dataset.autoGenerated !== "false";



    const isPassAuto = passwordInput.dataset.autoGenerated !== "false";







    if (!nameVal) {



      if (isUserAuto) {



        usernameInput.value = "";



        usernameInput.dataset.lastAuto = "";



      }



      if (isPassAuto) {



        passwordInput.value = "";



        passwordInput.dataset.lastAuto = "";



      }



      delete fullnameInput.dataset.passwordSuffix;



      return;



    }







    // Generate suggested username: e.g. "Rahul Sharma" -> "rahul_sharma"



    const baseUsername = nameVal.toLowerCase()



      .replace(/[^a-z0-9\s]/g, "")



      .replace(/\s+/g, "_");







    // Ensure uniqueness in the database



    const users = db.getUsers();



    let suggestedUsername = baseUsername;



    let counter = 1;



    while (users.some(u => u.username === suggestedUsername)) {



      suggestedUsername = `${baseUsername}${counter}`;



      counter++;



    }







    // Generate suggested password: e.g. "Rahul@3829"



    const nameParts = nameVal.split(/\s+/);



    const firstNameRaw = nameParts[0] || "";



    const firstName = firstNameRaw.charAt(0).toUpperCase() + firstNameRaw.slice(1).toLowerCase().replace(/[^a-z0-9]/gi, "");







    if (!fullnameInput.dataset.passwordSuffix) {



      fullnameInput.dataset.passwordSuffix = Math.floor(1000 + Math.random() * 9000);



    }



    const suffix = fullnameInput.dataset.passwordSuffix;



    const suggestedPassword = firstName ? `${firstName}@${suffix}` : "";







    if (isUserAuto) {



      usernameInput.value = suggestedUsername;



      usernameInput.dataset.lastAuto = suggestedUsername;



    }







    if (isPassAuto && suggestedPassword) {



      passwordInput.value = suggestedPassword;



      passwordInput.dataset.lastAuto = suggestedPassword;



    }



  });







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



      if (localStorage.getItem("medastrax_remembered_user")) {



        localStorage.setItem("medastrax_remembered_user", JSON.stringify(currentUser));



      }



      



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



      if (localStorage.getItem("medastrax_remembered_user")) {



        localStorage.setItem("medastrax_remembered_user", JSON.stringify(currentUser));



      }



      



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







  // Password Visibility Toggle for Add Employee Modal



  const toggleNewPassBtn = document.getElementById("toggle-new-password");



  const newPassInput = document.getElementById("new-password");



  if (toggleNewPassBtn && newPassInput) {



    toggleNewPassBtn.addEventListener("click", () => {



      const type = newPassInput.getAttribute("type") === "password" ? "text" : "password";



      newPassInput.setAttribute("type", type);



      const icon = toggleNewPassBtn.querySelector("i");



      icon.setAttribute("data-lucide", type === "password" ? "eye" : "eye-off");



      lucide.createIcons();



    });



  }







  // Edit Employee Modal Close Actions



  document.getElementById("close-edit-modal").addEventListener("click", closeEditEmployeeModal);



  document.getElementById("cancel-edit-btn").addEventListener("click", closeEditEmployeeModal);







  // Edit Employee Modal Form Submission



  document.getElementById("edit-employee-form").addEventListener("submit", handleEditEmployee);







  // Edit Custom Domain Toggle



  const editDomainSelect = document.getElementById("edit-domain");



  const editCustomDomainWrapper = document.getElementById("edit-custom-domain-wrapper");



  const editCustomDomainInput = document.getElementById("edit-custom-domain");



  if (editDomainSelect && editCustomDomainWrapper && editCustomDomainInput) {



    editDomainSelect.addEventListener("change", () => {



      if (editDomainSelect.value === "Other") {



        editCustomDomainWrapper.classList.remove("hidden");



        editCustomDomainInput.required = true;



      } else {



        editCustomDomainWrapper.classList.add("hidden");



        editCustomDomainInput.required = false;



        editCustomDomainInput.value = "";



      }



    });



  }
  // Leave Modal Open/Close Actions
  const openApplyLeaveModalBtn = document.getElementById("open-apply-leave-modal");
  const closeLeaveModalBtn = document.getElementById("close-leave-modal");
  const cancelLeaveBtn = document.getElementById("cancel-leave-btn");
  const leaveForm = document.getElementById("leave-application-form");
  const leaveFromInput = document.getElementById("leave-from-date");
  const leaveToInput = document.getElementById("leave-to-date");

  if (openApplyLeaveModalBtn) {
    openApplyLeaveModalBtn.addEventListener("click", openLeaveModal);
  }
  if (closeLeaveModalBtn) {
    closeLeaveModalBtn.addEventListener("click", () => {
      document.getElementById("apply-leave-modal").classList.add("hidden");
    });
  }
  if (cancelLeaveBtn) {
    cancelLeaveBtn.addEventListener("click", () => {
      document.getElementById("apply-leave-modal").classList.add("hidden");
    });
  }
  if (leaveForm) {
    leaveForm.addEventListener("submit", handleLeaveSubmit);
  }
  if (leaveFromInput && leaveToInput) {
    leaveFromInput.addEventListener("change", updateLeaveTotalDays);
    leaveToInput.addEventListener("change", updateLeaveTotalDays);
  }

  // Leave Subtabs Navigation Toggle Click Handlers
  const subtabMyLeavesBtn = document.getElementById("subtab-my-leaves");
  const subtabTeamHistoryBtn = document.getElementById("subtab-team-history");
  if (subtabMyLeavesBtn) {
    subtabMyLeavesBtn.onclick = () => {
      currentLeavesSubtab = "my-leaves";
      renderLeavesTab();
    };
  }
  if (subtabTeamHistoryBtn) {
    subtabTeamHistoryBtn.onclick = () => {
      currentLeavesSubtab = "team-history";
      renderLeavesTab();
    };
  }

  // Leave Hierarchy Timeline Modal Actions
  const closeLeaveChainModalBtn = document.getElementById("close-leave-chain-modal");
  const closeLeaveChainBtn = document.getElementById("close-leave-chain-btn");
  if (closeLeaveChainModalBtn) {
    closeLeaveChainModalBtn.onclick = () => {
      document.getElementById("leave-chain-modal").classList.add("hidden");
    };
  }
  if (closeLeaveChainBtn) {
    closeLeaveChainBtn.onclick = () => {
      document.getElementById("leave-chain-modal").classList.add("hidden");
    };
  }

  // Sidebar Collapse Toggle
  const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");



  const workspaceContainer = document.getElementById("workspace-container");



  if (sidebarToggleBtn && workspaceContainer) {



    sidebarToggleBtn.addEventListener("click", () => {



      workspaceContainer.classList.toggle("sidebar-collapsed");



    });



  }

  // Perform initial session auth check
  checkAuth();
});







// â”€â”€ Deliverable Selector Helpers (Photo / Video / Link) â”€â”€â”€â”€â”€â”€



window.renderDeliverableInputs = function(activeTab = 'photo') {



  const container = document.getElementById("detail-deliverable-link-container");



  if (!container) return;







  let html = `



    <div class="deliverable-tabs" style="display: flex; gap: 4px; margin-bottom: 8px; background: rgba(0,0,0,0.03); padding: 4px; border-radius: 6px;">



      <button type="button" class="del-tab-btn" id="btn-tab-photo" onclick="renderDeliverableInputs('photo')" style="flex: 1; padding: 6px; font-size: 0.72rem; border: none; border-radius: 4px; background: ${activeTab === 'photo' ? '#fff' : 'transparent'}; font-weight: 600; cursor: pointer; color: ${activeTab === 'photo' ? 'var(--color-primary)' : 'var(--text-secondary)'}; box-shadow: ${activeTab === 'photo' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'};">ðŸ“· Image</button>



      <button type="button" class="del-tab-btn" id="btn-tab-video" onclick="renderDeliverableInputs('video')" style="flex: 1; padding: 6px; font-size: 0.72rem; border: none; border-radius: 4px; background: ${activeTab === 'video' ? '#fff' : 'transparent'}; font-weight: 600; cursor: pointer; color: ${activeTab === 'video' ? 'var(--color-primary)' : 'var(--text-secondary)'}; box-shadow: ${activeTab === 'video' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'};">ðŸŽ¥ Video</button>



      <button type="button" class="del-tab-btn" id="btn-tab-link" onclick="renderDeliverableInputs('link')" style="flex: 1; padding: 6px; font-size: 0.72rem; border: none; border-radius: 4px; background: ${activeTab === 'link' ? '#fff' : 'transparent'}; font-weight: 600; cursor: pointer; color: ${activeTab === 'link' ? 'var(--color-primary)' : 'var(--text-secondary)'}; box-shadow: ${activeTab === 'link' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'};">ðŸ”— Link</button>



    </div>



    



    <div class="deliverable-inputs" style="margin-bottom: 8px;">



  `;







  if (activeTab === 'photo') {



    html += `



      <div style="display: flex; flex-direction: column; gap: 8px;">



        <input type="file" id="del-file-photo" accept="image/*" multiple onchange="handleDeliverableFileSelect(event, 'photo')" style="display: none;">



        <button type="button" class="btn btn-secondary" onclick="document.getElementById('del-file-photo').click()" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.8rem; padding: 6px;">



          <i data-lucide="image" style="width:14px; height:14px;"></i> Choose Images (Multiple)



        </button>



      </div>



    `;



  } else if (activeTab === 'video') {



    html += `



      <div style="display: flex; flex-direction: column; gap: 8px;">



        <input type="file" id="del-file-video" accept="video/*" multiple onchange="handleDeliverableFileSelect(event, 'video')" style="display: none;">



        <button type="button" class="btn btn-secondary" onclick="document.getElementById('del-file-video').click()" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.8rem; padding: 6px;">



          <i data-lucide="video" style="width:14px; height:14px;"></i> Choose Videos (Multiple)



        </button>



      </div>



    `;



  } else if (activeTab === 'link') {



    html += `



      <div style="display: flex; gap: 6px;">



        <input type="url" id="del-text-link" placeholder="https://example.com/..." style="flex-grow: 1; padding: 6px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); color: var(--text-primary); background: transparent; font-size: 0.8rem; height: 32px;">



        <button type="button" class="btn btn-primary" onclick="addDeliverableLink()" style="padding: 6px 12px; font-size: 0.8rem; height: 32px;">Add Link</button>



      </div>



    `;



  }







  html += `



    </div>



    <div id="del-preview-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 120px; overflow-y: auto; margin-top: 6px;">



    </div>



  `;







  container.innerHTML = html;



  lucide.createIcons();



  renderDeliverablePreviewList(activeTab);



};







window.handleDeliverableFileSelect = function(event, tabType) {



  const files = event.target.files;



  if (!files || files.length === 0) return;







  let filesLoaded = 0;



  for (let i = 0; i < files.length; i++) {



    const file = files[i];



    const reader = new FileReader();



    reader.onload = function(e) {



      const val = e.target.result;



      const type = file.type.startsWith('image/') ? 'photo' : 'video';







      currentUploadedDeliverables.push({



        id: 'del-' + Date.now() + '-' + Math.floor(Math.random() * 1000),



        type: type,



        name: file.name,



        size: (file.size / 1024).toFixed(1) + ' KB',



        value: val



      });







      filesLoaded++;



      if (filesLoaded === files.length) {



        renderDeliverablePreviewList(tabType);



      }



    };



    reader.readAsDataURL(file);



  }



};







window.addDeliverableLink = function() {



  const input = document.getElementById('del-text-link');



  const val = input ? input.value.trim() : "";



  if (!val) {



    showToast("Please enter a valid URL.", "error");



    return;



  }







  currentUploadedDeliverables.push({



    id: 'del-' + Date.now() + '-' + Math.floor(Math.random() * 100),



    type: 'link',



    name: val.replace(/https?:\/\/(www\.)?/, '').substring(0, 20) + '...',



    value: val



  });







  input.value = "";



  renderDeliverablePreviewList('link');



};







window.renderDeliverablePreviewList = function(activeTab) {



  const list = document.getElementById("del-preview-list");



  if (!list) return;



  list.innerHTML = "";







  if (currentUploadedDeliverables.length === 0) {



    list.innerHTML = `<span class="text-muted" style="font-size:0.75rem; text-align:center; display:block; padding:8px; border: 1px dashed var(--border-color); border-radius: 4px;">No deliverables selected</span>`;



    return;



  }







  currentUploadedDeliverables.forEach(item => {



    const div = document.createElement("div");



    div.style.display = "flex";



    div.style.alignItems = "center";



    div.style.justifyContent = "space-between";



    div.style.padding = "4px 6px";



    div.style.border = "1px solid var(--border-color)";



    div.style.borderRadius = "4px";



    div.style.fontSize = "0.75rem";



    div.style.background = "rgba(0,0,0,0.01)";







    let icon = "link";



    if (item.type === 'photo') icon = "image";



    if (item.type === 'video') icon = "video";







    div.innerHTML = `



      <div style="display:flex; align-items:center; gap:6px; min-width:0; flex-grow:1; margin-right: 6px;">



        <i data-lucide="${icon}" style="width:12px; height:12px; flex-shrink:0; color:var(--color-primary);"></i>



        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500;">${item.name}</span>



        ${item.size ? `<span class="text-muted" style="font-size:0.65rem; flex-shrink:0;">(${item.size})</span>` : ''}



      </div>



      <button type="button" onclick="removeDeliverableItem('${item.id}', '${activeTab}')" style="background:transparent; border:none; color:var(--color-danger); cursor:pointer; font-size:0.72rem; padding: 2px; font-weight:600;">Remove</button>



    `;



    list.appendChild(div);



  });



  lucide.createIcons();



};







window.removeDeliverableItem = function(itemId, activeTab) {



  currentUploadedDeliverables = currentUploadedDeliverables.filter(item => item.id !== itemId);



  renderDeliverablePreviewList(activeTab);



};







window.openDeliverableImageLightbox = function(src) {



  const overlay = document.createElement("div");



  overlay.style.position = "fixed";



  overlay.style.top = "0";



  overlay.style.left = "0";



  overlay.style.width = "100vw";



  overlay.style.height = "100vh";



  overlay.style.backgroundColor = "rgba(15, 23, 42, 0.85)";



  overlay.style.backdropFilter = "blur(6px)";



  overlay.style.zIndex = "99999";



  overlay.style.display = "flex";



  overlay.style.alignItems = "center";



  overlay.style.justifyContent = "center";



  overlay.style.cursor = "zoom-out";



  overlay.style.opacity = "0";



  overlay.style.transition = "opacity 0.2s ease-out";







  const img = document.createElement("img");



  img.src = src;



  img.style.maxWidth = "85%";



  img.style.maxHeight = "85%";



  img.style.borderRadius = "8px";



  img.style.boxShadow = "0 20px 40px rgba(0,0,0,0.5)";



  img.style.transition = "transform 0.2s ease-out";



  img.style.transform = "scale(0.95)";







  overlay.appendChild(img);



  document.body.appendChild(overlay);







  setTimeout(() => {



    overlay.style.opacity = "1";



    img.style.transform = "scale(1)";



  }, 10);







  const closeBtn = () => {



    img.style.transform = "scale(0.95)";



    overlay.style.opacity = "0";



    setTimeout(() => {



      document.body.removeChild(overlay);



    }, 200);



  };
  overlay.addEventListener("click", closeBtn);

};

// WebRTC and video calls variables
let sseVideoSource = null;
let localStream = null;
let currentRoom = null;
let peerConnections = {}; // targetUserId -> RTCPeerConnection
let isCamOn = true;
let isMicOn = true;
let isScreenSharing = false;

function initVideoSse() {
  if (!currentUser) return;
  if (sseVideoSource) sseVideoSource.close();

  sseVideoSource = new EventSource(`/api/video/events?userId=${currentUser.id}&username=${encodeURIComponent(currentUser.fullname)}`);

  sseVideoSource.onmessage = async (e) => {
    const event = JSON.parse(e.data);
    await handleVideoSseEvent(event);
  };

  sseVideoSource.onerror = (e) => {
    console.error("Video SSE error, attempting reconnect:", e);
  };
}

function renderMeetingsTab() {
  // Render the scheduled meetings card list initially
  renderScheduledMeetings();

  const roomInput = document.getElementById("meeting-room-input");
  const btnJoin = document.getElementById("btn-join-meeting");
  const btnLeave = document.getElementById("btn-leave-meeting");
  const mediaControls = document.getElementById("meeting-media-controls");
  const statusText = document.getElementById("meeting-status-text");
  const activeRoomDisplay = document.getElementById("meeting-active-room-display");
  const roomBadge = document.getElementById("meeting-room-badge");

  btnJoin.onclick = async () => {
    const room = roomInput.value.trim();
    if (!room) {
      showToast("Please enter a Room Code / ID", "error");
      return;
    }

    btnJoin.classList.add("hidden");
    btnLeave.classList.remove("hidden");
    mediaControls.classList.remove("hidden");
    statusText.textContent = "Connecting...";
    statusText.className = "badge badge-lead";
    activeRoomDisplay.classList.remove("hidden");
    roomBadge.textContent = room;

    await joinMeetingRoom(room);
  };

  btnLeave.onclick = async () => {
    await leaveMeetingRoom();
    
    btnJoin.classList.remove("hidden");
    btnLeave.classList.add("hidden");
    mediaControls.classList.add("hidden");
    statusText.textContent = "Not Connected";
    statusText.className = "badge badge-critical";
    activeRoomDisplay.classList.add("hidden");
  };

  // Media controls
  const btnCam = document.getElementById("btn-toggle-cam");
  const btnMic = document.getElementById("btn-toggle-mic");
  const btnShare = document.getElementById("btn-share-screen");

  btnCam.onclick = () => {
    if (localStream) {
      isCamOn = !isCamOn;
      localStream.getVideoTracks().forEach(track => track.enabled = isCamOn);
      btnCam.style.backgroundColor = isCamOn ? "var(--bg-secondary)" : "#ef4444";
      btnCam.style.color = isCamOn ? "var(--text-primary)" : "#fff";
      showToast(isCamOn ? "Webcam enabled" : "Webcam disabled", "info");
    }
  };

  btnMic.onclick = () => {
    if (localStream) {
      isMicOn = !isMicOn;
      localStream.getAudioTracks().forEach(track => track.enabled = isMicOn);
      btnMic.style.backgroundColor = isMicOn ? "var(--bg-secondary)" : "#ef4444";
      btnMic.style.color = isMicOn ? "var(--text-primary)" : "#fff";
      showToast(isMicOn ? "Microphone unmuted" : "Microphone muted", "info");
    }
  };

  btnShare.onclick = async () => {
    if (!localStream) return;
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        // Replace track in all peer connections
        for (const pc of Object.values(peerConnections)) {
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(screenTrack);
          }
        }

        // Update local video element
        const localVideo = document.getElementById("local-video-element");
        if (localVideo) {
          localVideo.srcObject = screenStream;
        }

        screenTrack.onended = () => {
          stopScreenSharing();
        };

        isScreenSharing = true;
        btnShare.style.backgroundColor = "#10b981";
        btnShare.style.color = "#fff";
        showToast("Screen sharing started", "success");
      } else {
        stopScreenSharing();
      }
    } catch (err) {
      console.error("Screen share error:", err);
      showToast("Could not share screen: " + err.message, "error");
    }
  };
}

function stopScreenSharing() {
  if (!isScreenSharing) return;
  isScreenSharing = false;
  const btnShare = document.getElementById("btn-share-screen");
  btnShare.style.backgroundColor = "var(--bg-secondary)";
  btnShare.style.color = "var(--text-primary)";

  // Switch back to camera video track
  if (localStream) {
    const camTrack = localStream.getVideoTracks()[0];
    for (const pc of Object.values(peerConnections)) {
      const senders = pc.getSenders();
      const videoSender = senders.find(s => s.track.kind === 'video');
      if (videoSender && camTrack) {
        videoSender.replaceTrack(camTrack);
      }
    }
    const localVideo = document.getElementById("local-video-element");
    if (localVideo) {
      localVideo.srcObject = localStream;
    }
  }
  showToast("Screen sharing stopped", "info");
}

async function joinMeetingRoom(room) {
  currentRoom = room;
  
  // Remove placeholder
  const placeholder = document.getElementById("video-grid-placeholder");
  if (placeholder) placeholder.classList.add("hidden");

  try {
    // Get local media
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    addLocalVideo();

    // Join room on signaling server
    const res = await fetch("/api/video/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id, username: currentUser.fullname, room })
    });
    
    const data = await res.json();
    const statusText = document.getElementById("meeting-status-text");
    statusText.textContent = "Connected";
    statusText.className = "badge badge-employee";

    // Establish connection with every existing user in room
    if (data.existingUsers) {
      for (const user of data.existingUsers) {
        createPeerConnection(user.userId, true);
      }
    }
  } catch (err) {
    console.error("Error joining room:", err);
    showToast("Failed to access camera/mic: " + err.message, "error");
    leaveMeetingRoom();
  }
}

async function leaveMeetingRoom() {
  if (currentRoom) {
    await fetch("/api/video/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: currentUser.id, room: currentRoom })
    });
  }

  // Stop screen sharing if active
  stopScreenSharing();

  // Close and cleanup local stream
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  // Close and cleanup peer connections
  for (const peerId of Object.keys(peerConnections)) {
    peerConnections[peerId].close();
    delete peerConnections[peerId];
  }

  currentRoom = null;

  // Reset UI video grid
  const grid = document.getElementById("video-grid");
  if (grid) {
    grid.innerHTML = `
      <div id="video-grid-placeholder" style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #94a3b8; height: 100%;">
        <i data-lucide="video" style="width: 48px; height: 48px; margin-bottom: 12px; color: #475569;"></i>
        <p style="margin: 0; font-weight: 500;">No active video stream.</p>
        <p style="margin: 4px 0 0; font-size: 0.85rem; color: #64748b;">Enter a room code and click Join to start.</p>
      </div>
    `;
  }
  lucide.createIcons();
}

function addLocalVideo() {
  const grid = document.getElementById("video-grid");
  if (!grid) return;

  // Create container
  const container = document.createElement("div");
  container.id = "video-container-local";
  container.style.position = "relative";
  container.style.borderRadius = "8px";
  container.style.overflow = "hidden";
  container.style.backgroundColor = "#1e293b";

  const video = document.createElement("video");
  video.id = "local-video-element";
  video.srcObject = localStream;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true; // local video must be muted to prevent echo!
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.objectFit = "cover";

  const label = document.createElement("div");
  label.textContent = "You";
  label.style.position = "absolute";
  label.style.bottom = "12px";
  label.style.left = "12px";
  label.style.background = "rgba(15, 23, 42, 0.75)";
  label.style.color = "#fff";
  label.style.padding = "4px 8px";
  label.style.borderRadius = "4px";
  label.style.fontSize = "0.75rem";
  label.style.fontWeight = "600";

  container.appendChild(video);
  container.appendChild(label);
  grid.appendChild(container);
}

function addRemoteVideo(peerId, stream) {
  const grid = document.getElementById("video-grid");
  if (!grid) return;

  // Check if remote video container already exists
  let container = document.getElementById(`video-container-${peerId}`);
  if (!container) {
    container = document.createElement("div");
    container.id = `video-container-${peerId}`;
    container.style.position = "relative";
    container.style.borderRadius = "8px";
    container.style.overflow = "hidden";
    container.style.backgroundColor = "#1e293b";

    const video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "cover";

    // Retrieve username from user database
    const users = db.getUsers() || [];
    const peerUser = users.find(u => u.id === peerId);
    const name = peerUser ? peerUser.fullname.replace(/\s*\(.*\)\s*/g, "") : "Participant";

    const label = document.createElement("div");
    label.textContent = name;
    label.style.position = "absolute";
    label.style.bottom = "12px";
    label.style.left = "12px";
    label.style.background = "rgba(15, 23, 42, 0.75)";
    label.style.color = "#fff";
    label.style.padding = "4px 8px";
    label.style.borderRadius = "4px";
    label.style.fontSize = "0.75rem";
    label.style.fontWeight = "600";

    container.appendChild(video);
    container.appendChild(label);
    grid.appendChild(container);
  } else {
    const video = container.querySelector("video");
    if (video) video.srcObject = stream;
  }
}

function createPeerConnection(peerId, initiator) {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  });

  peerConnections[peerId] = pc;

  // Add local stream tracks to pc
  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignal(peerId, "ice-candidate", event.candidate);
    }
  };

  // Handle remote track
  pc.ontrack = (event) => {
    addRemoteVideo(peerId, event.streams[0]);
  };

  if (initiator) {
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        sendSignal(peerId, "offer", pc.localDescription);
      })
      .catch(err => console.error("Error creating offer:", err));
  }

  return pc;
}

async function sendSignal(targetId, type, data) {
  try {
    await fetch("/api/video/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId: currentUser.id, targetId, type, data })
    });
  } catch (err) {
    console.error("Signaling error:", err);
  }
}

async function handleVideoSseEvent(event) {
  const { type, senderId, data } = event;
  
  switch (type) {
    case 'user-joined':
      createPeerConnection(senderId, true);
      showToast(`${event.username || "Someone"} joined the meeting!`, "info");
      break;

    case 'user-left':
      if (peerConnections[senderId]) {
        peerConnections[senderId].close();
        delete peerConnections[senderId];
      }
      const videoEl = document.getElementById(`video-container-${senderId}`);
      if (videoEl) videoEl.remove();
      break;

    case 'offer':
      let pcOffer = peerConnections[senderId];
      if (!pcOffer) {
        pcOffer = createPeerConnection(senderId, false);
      }
      await pcOffer.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pcOffer.createAnswer();
      await pcOffer.setLocalDescription(answer);
      sendSignal(senderId, "answer", pcOffer.localDescription);
      break;

    case 'answer':
      const pcAnswer = peerConnections[senderId];
      if (pcAnswer) {
        await pcAnswer.setRemoteDescription(new RTCSessionDescription(data));
      }
      break;

    case 'ice-candidate':
      const pcIce = peerConnections[senderId];
      if (pcIce) {
        await pcIce.addIceCandidate(new RTCIceCandidate(data));
      }
      break;
  }
}



let waActiveChat = null; // { id, type: 'direct'|'group', name, role, domain }
let waChatFilter = 'all';
let waSearchQuery = '';
let waEmployeesStatus = {};
let waUserPreferences = {};
let waAllEmployees = [];
let waAllGroups = [];
let waAllMessages = [];

async function renderChatTab() {
  const currentUserId = currentUser ? currentUser.id : '';
  const currentUserName = currentUser ? currentUser.fullname : 'Current User';
  const currentUserRole = currentUser ? currentUser.role : 'Employee';

  // Update Sidebar Header Current User Info
  const waInitialsEl = document.getElementById('wa-current-user-initials');
  const waNameEl = document.getElementById('wa-current-user-name');
  const waRoleEl = document.getElementById('wa-current-user-role');

  if (waInitialsEl) waInitialsEl.textContent = getInitials(currentUserName);
  if (waNameEl) waNameEl.textContent = currentUserName;
  if (waRoleEl) waRoleEl.textContent = currentUserRole;

  // Initialize UI event listeners once
  initWaChatEvents();

  // Load initial data
  await refreshWaChatData();
}

async function refreshWaChatData() {
  try {
    const currentUserId = currentUser ? currentUser.id : '';

    // Parallel fetch
    const [usersRes, groupsRes, statusRes, prefRes, msgRes] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/groups'),
      fetch('/api/employees/status'),
      fetch(`/api/chat/preferences?userId=${currentUserId}`),
      fetch('/api/messages')
    ]);

    waAllEmployees = await usersRes.json();
    waAllGroups = await groupsRes.json();
    waEmployeesStatus = await statusRes.json();

    const prefs = await prefRes.json();
    waUserPreferences = {};
    if (Array.isArray(prefs)) {
      prefs.forEach(p => { waUserPreferences[p.chatId] = p; });
    }

    waAllMessages = await msgRes.json();

    // Render list
    renderWaChatList();

    // Update active chat if selected
    if (waActiveChat) {
      loadWaActiveChatMessages();
    }
  } catch (err) {
    console.error("Error refreshing WhatsApp chat data:", err);
  }
}

function renderWaChatList() {
  const listContainer = document.getElementById('wa-chat-list');
  if (!listContainer) return;

  const currentUserId = currentUser ? currentUser.id : '';
  const currentUserName = currentUser ? currentUser.fullname : '';

  // Combine employees and groups
  let chatItems = [];

  // Add all company employees (everyone: CEO to developer)
  waAllEmployees.forEach(emp => {
    if (emp.id === currentUserId) return; // Don't list self as chat item

    const pref = waUserPreferences[emp.id] || {};
    const isArchived = !!pref.isArchived;

    // Get last message between currentUser and emp
    const chatMsgs = waAllMessages.filter(m => 
      (m.senderId === currentUserId && m.receiverId === emp.id) ||
      (m.senderId === emp.id && m.receiverId === currentUserId) ||
      (m.sender === currentUserName && (m.receiver === emp.fullname || m.receiver.includes(emp.fullname))) ||
      ((m.sender === emp.fullname || m.sender.includes(emp.fullname)) && m.receiver === currentUserName)
    );

    const lastMsg = chatMsgs.length > 0 ? chatMsgs[chatMsgs.length - 1] : null;

    // Calculate unread count
    const lastRead = pref.lastReadTimestamp ? new Date(pref.lastReadTimestamp) : new Date(0);
    const unreadMsgs = chatMsgs.filter(m => {
      if (m.senderId === currentUserId || m.sender === currentUserName) return false;
      const readBy = Array.isArray(m.readBy) ? m.readBy : [];
      if (readBy.includes(currentUserId)) return false;
      if (m.createdAt && new Date(m.createdAt) > lastRead) return true;
      return !readBy.includes(currentUserId);
    });

    const statusObj = waEmployeesStatus[emp.id] || { status: 'free', label: 'Free' };

    chatItems.push({
      id: emp.id,
      type: 'direct',
      name: emp.fullname,
      role: emp.role,
      domain: emp.domain || emp.role,
      status: statusObj.status,
      statusLabel: statusObj.label,
      lastMsg: lastMsg ? lastMsg.message : 'No messages yet',
      lastTime: lastMsg ? formatChatTime(lastMsg.createdAt) : '',
      lastTimestamp: lastMsg ? new Date(lastMsg.createdAt).getTime() : 0,
      unreadCount: unreadMsgs.length,
      isArchived: isArchived,
      empObj: emp
    });
  });

  // Add groups where user is member
  waAllGroups.forEach(grp => {
    const members = Array.isArray(grp.members) ? grp.members : [];
    if (!members.includes(currentUserId) && grp.createdById !== currentUserId) return;

    const pref = waUserPreferences[grp.id] || {};
    const isArchived = !!pref.isArchived;

    const groupMsgs = waAllMessages.filter(m => m.receiverId === grp.id || m.receiver === grp.name);
    const lastMsg = groupMsgs.length > 0 ? groupMsgs[groupMsgs.length - 1] : null;

    const lastRead = pref.lastReadTimestamp ? new Date(pref.lastReadTimestamp) : new Date(0);
    const unreadMsgs = groupMsgs.filter(m => {
      if (m.senderId === currentUserId || m.sender === currentUserName) return false;
      const readBy = Array.isArray(m.readBy) ? m.readBy : [];
      if (readBy.includes(currentUserId)) return false;
      if (m.createdAt && new Date(m.createdAt) > lastRead) return true;
      return false;
    });

    chatItems.push({
      id: grp.id,
      type: 'group',
      name: grp.name,
      role: `${members.length} members`,
      domain: 'Group Chat',
      status: 'free',
      statusLabel: 'Group',
      lastMsg: lastMsg ? `${lastMsg.sender.split(' ')[0]}: ${lastMsg.message}` : 'Group created',
      lastTime: lastMsg ? formatChatTime(lastMsg.createdAt) : formatChatTime(grp.createdAt),
      lastTimestamp: lastMsg ? new Date(lastMsg.createdAt).getTime() : new Date(grp.createdAt || 0).getTime(),
      unreadCount: unreadMsgs.length,
      isArchived: isArchived,
      grpObj: grp
    });
  });

  // Sort chat items by last message timestamp descending
  chatItems.sort((a, b) => b.lastTimestamp - a.lastTimestamp);

  // Calculate stats for badges
  const totalUnread = chatItems.reduce((acc, item) => acc + item.unreadCount, 0);
  const totalArchived = chatItems.filter(item => item.isArchived).length;

  const unreadBadge = document.getElementById('wa-unread-total-badge');
  if (unreadBadge) {
    if (totalUnread > 0) {
      unreadBadge.textContent = totalUnread;
      unreadBadge.classList.remove('hidden');
    } else {
      unreadBadge.classList.add('hidden');
    }
  }

  const archivedBanner = document.getElementById('wa-archived-banner');
  const archivedCountBadge = document.getElementById('wa-archived-count-badge');
  if (archivedBanner && archivedCountBadge) {
    if (totalArchived > 0) {
      archivedCountBadge.textContent = totalArchived;
      if (waChatFilter === 'all') {
        archivedBanner.classList.remove('hidden');
      } else {
        archivedBanner.classList.add('hidden');
      }
    } else {
      archivedBanner.classList.add('hidden');
    }
  }

  // Filter based on active tab pill & search query
  let filteredItems = chatItems.filter(item => {
    // Search query filter
    if (waSearchQuery) {
      const q = waSearchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchRole = item.role.toLowerCase().includes(q);
      const matchDomain = item.domain.toLowerCase().includes(q);
      if (!matchName && !matchRole && !matchDomain) return false;
    }

    // Filter pill tab
    if (waChatFilter === 'archived') {
      return item.isArchived;
    } else {
      if (item.isArchived) return false;
      if (waChatFilter === 'unread') return item.unreadCount > 0;
      if (waChatFilter === 'groups') return item.type === 'group';
      return true; // 'all'
    }
  });

  listContainer.innerHTML = '';

  if (filteredItems.length === 0) {
    listContainer.innerHTML = `
      <div style="padding: 30px 15px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
        <i data-lucide="search-x" style="width: 32px; height: 32px; margin-bottom: 8px; opacity: 0.5;"></i>
        <p>No chats found matching your query.</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  filteredItems.forEach(item => {
    const el = document.createElement('div');
    el.className = `wa-chat-item ${waActiveChat && waActiveChat.id === item.id ? 'active' : ''}`;
    
    let statusDotClass = 'free';
    let statusText = '🟢 Free';
    if (item.type === 'direct') {
      if (item.status === 'in_meeting') {
        statusDotClass = 'in_meeting';
        statusText = '🔴 (in meeting)';
      } else if (item.status === 'on_leave') {
        statusDotClass = 'on_leave';
        statusText = '🔴 (on leave)';
      }
    } else {
      statusText = '👥 Group';
    }

    el.innerHTML = `
      <div class="wa-avatar-wrapper">
        <div class="wa-item-avatar ${item.type === 'group' ? 'group' : ''}">
          ${getInitials(item.name)}
        </div>
        ${item.type === 'direct' ? `<span class="wa-status-dot ${statusDotClass}"></span>` : ''}
      </div>
      <div class="wa-chat-item-content">
        <div class="wa-chat-item-top">
          <span class="wa-chat-item-title">${item.name}</span>
          <span class="wa-chat-item-time">${item.lastTime}</span>
        </div>
        <div class="wa-chat-item-bottom">
          <span class="wa-chat-item-snippet">${item.lastMsg}</span>
          <div style="display: flex; align-items: center; gap: 4px;">
            ${item.type === 'direct' ? `<span class="wa-status-badge-inline ${statusDotClass}">${statusText}</span>` : ''}
            ${item.unreadCount > 0 ? `<span class="wa-unread-badge">${item.unreadCount}</span>` : ''}
          </div>
        </div>
      </div>
    `;

    el.onclick = () => selectWaChat(item);
    listContainer.appendChild(el);
  });

  lucide.createIcons();
}

function selectWaChat(chatItem) {
  waActiveChat = chatItem;
  
  // Hide empty state & show active chat UI
  const emptyState = document.getElementById('wa-empty-state');
  const activeChatUI = document.getElementById('wa-active-chat');
  if (emptyState) emptyState.classList.add('hidden');
  if (activeChatUI) activeChatUI.classList.remove('hidden');

  // Update Header
  const initialsEl = document.getElementById('wa-active-initials');
  const statusDotEl = document.getElementById('wa-active-status-dot');
  const titleEl = document.getElementById('wa-active-title');
  const statusBadgeEl = document.getElementById('wa-active-status-badge');
  const roleDomainEl = document.getElementById('wa-active-role-domain');

  if (initialsEl) initialsEl.textContent = getInitials(chatItem.name);
  if (titleEl) titleEl.textContent = chatItem.name;
  if (roleDomainEl) roleDomainEl.textContent = `${chatItem.role} • ${chatItem.domain}`;

  if (statusDotEl && statusBadgeEl) {
    statusDotEl.className = 'wa-status-dot';
    statusBadgeEl.className = 'wa-status-badge-inline';

    if (chatItem.type === 'direct') {
      statusDotEl.classList.remove('hidden');
      if (chatItem.status === 'in_meeting') {
        statusDotEl.classList.add('in_meeting');
        statusBadgeEl.classList.add('in_meeting');
        statusBadgeEl.textContent = '🔴 (in meeting)';
      } else if (chatItem.status === 'on_leave') {
        statusDotEl.classList.add('on_leave');
        statusBadgeEl.classList.add('on_leave');
        statusBadgeEl.textContent = '🔴 (on leave)';
      } else {
        statusDotEl.classList.add('free');
        statusBadgeEl.classList.add('free');
        statusBadgeEl.textContent = '🟢 Free';
      }
    } else {
      statusDotEl.classList.add('hidden');
      statusBadgeEl.classList.add('free');
      statusBadgeEl.textContent = '👥 Group Chat';
    }
  }

  // Mark chat as read locally & on server
  const currentUserId = currentUser ? currentUser.id : '';
  
  if (!waUserPreferences[chatItem.id]) {
    waUserPreferences[chatItem.id] = {};
  }
  waUserPreferences[chatItem.id].lastReadTimestamp = new Date().toISOString();

  waAllMessages.forEach(m => {
    const isTargetChat = (m.senderId === chatItem.id || m.receiverId === chatItem.id || m.sender === chatItem.name || m.receiver === chatItem.name);
    if (isTargetChat && m.senderId !== currentUserId) {
      if (!Array.isArray(m.readBy)) m.readBy = [];
      if (!m.readBy.includes(currentUserId)) {
        m.readBy.push(currentUserId);
      }
    }
  });

  chatItem.unreadCount = 0;
  renderWaChatList();

  fetch('/api/chat/mark-read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUserId, chatId: chatItem.id })
  });

  // Load messages for active chat
  loadWaActiveChatMessages();
}

function loadWaActiveChatMessages() {
  if (!waActiveChat) return;

  const container = document.getElementById('wa-messages-container');
  if (!container) return;

  const currentUserId = currentUser ? currentUser.id : '';
  const currentUserName = currentUser ? currentUser.fullname : '';

  // Filter messages for active chat
  let msgs = [];
  if (waActiveChat.type === 'direct') {
    msgs = waAllMessages.filter(m => 
      (m.senderId === currentUserId && m.receiverId === waActiveChat.id) ||
      (m.senderId === waActiveChat.id && m.receiverId === currentUserId) ||
      (m.sender === currentUserName && (m.receiver === waActiveChat.name || m.receiver.includes(waActiveChat.name))) ||
      ((m.sender === waActiveChat.name || m.sender.includes(waActiveChat.name)) && m.receiver === currentUserName)
    );
  } else {
    msgs = waAllMessages.filter(m => m.receiverId === waActiveChat.id || m.receiver === waActiveChat.name);
  }

  container.innerHTML = '';

  if (msgs.length === 0) {
    container.innerHTML = `
      <div style="margin: auto; text-align: center; color: var(--text-muted); font-size: 0.88rem; background: var(--bg-secondary); padding: 12px 20px; border-radius: 16px; border: 1px solid var(--border-color);">
         👋 Start of conversation with <strong>${waActiveChat.name}</strong>. Say hi!
      </div>
    `;
    return;
  }

  msgs.forEach(m => {
    const isOutgoing = (m.senderId === currentUserId || m.sender === currentUserName || m.sender === 'Current User');
    const bubble = document.createElement('div');
    bubble.className = `wa-msg-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`;

    let senderHeader = '';
    if (waActiveChat.type === 'group' && !isOutgoing) {
      senderHeader = `<div class="wa-msg-sender">${m.sender}</div>`;
    }

    bubble.innerHTML = `
      ${senderHeader}
      <div class="wa-msg-text">${escapeHtml(m.message)}</div>
      <div class="wa-msg-meta">
        <span>${formatChatTime(m.createdAt)}</span>
        ${isOutgoing ? `<span class="wa-msg-ticks">✓✓</span>` : ''}
      </div>
    `;

    container.appendChild(bubble);
  });

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

async function sendWaMessage() {
  const inputEl = document.getElementById('wa-message-input');
  if (!inputEl || !waActiveChat) return;

  const text = inputEl.value.trim();
  if (!text) return;

  const currentUserId = currentUser ? currentUser.id : '';
  const currentUserName = currentUser ? currentUser.fullname : 'Current User';

  inputEl.value = '';

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: currentUserName,
        receiver: waActiveChat.name,
        senderId: currentUserId,
        receiverId: waActiveChat.id,
        message: text,
        isGroup: waActiveChat.type === 'group'
      })
    });

    if (res.ok) {
      const newMsg = await res.json();
      if (!isMsgDuplicate(newMsg, waAllMessages)) {
        waAllMessages.push(newMsg);
        loadWaActiveChatMessages();
        renderWaChatList();
      }
    }
  } catch (err) {
    console.error("Error sending message:", err);
  }
}

function isMsgDuplicate(m, msgList) {
  return msgList.some(existing => 
    (existing.id && m.id && existing.id === m.id) ||
    (existing._id && m._id && existing._id === m._id) ||
    (existing.sender === m.sender && existing.receiver === m.receiver && existing.message === m.message && Math.abs(new Date(existing.createdAt || 0).getTime() - new Date(m.createdAt || 0).getTime()) < 4000)
  );
}

let waEventsInitialized = false;
function initWaChatEvents() {
  if (waEventsInitialized) return;
  waEventsInitialized = true;

  // Search input
  const searchInput = document.getElementById('wa-chat-search');
  const searchClear = document.getElementById('wa-search-clear');
  if (searchInput) {
    searchInput.oninput = (e) => {
      waSearchQuery = e.target.value;
      if (searchClear) {
        if (waSearchQuery) searchClear.classList.remove('hidden');
        else searchClear.classList.add('hidden');
      }
      renderWaChatList();
    };
  }
  if (searchClear) {
    searchClear.onclick = () => {
      if (searchInput) searchInput.value = '';
      waSearchQuery = '';
      searchClear.classList.add('hidden');
      renderWaChatList();
    };
  }

  // Filter Pills
  const pills = document.querySelectorAll('.wa-pill');
  pills.forEach(p => {
    p.onclick = function () {
      pills.forEach(x => x.classList.remove('active'));
      this.classList.add('active');
      waChatFilter = this.getAttribute('data-filter') || 'all';
      renderWaChatList();
    };
  });

  // Archived Banner Click
  const archivedBanner = document.getElementById('wa-archived-banner');
  if (archivedBanner) {
    archivedBanner.onclick = () => {
      pills.forEach(x => x.classList.remove('active'));
      const archivedPill = document.querySelector('.wa-pill[data-filter="archived"]');
      if (archivedPill) archivedPill.classList.add('active');
      waChatFilter = 'archived';
      renderWaChatList();
    };
  }

  // Menu Dropdown toggle
  const menuBtn = document.getElementById('wa-btn-more-options');
  const dropdown = document.getElementById('wa-menu-dropdown');
  if (menuBtn && dropdown) {
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    };
    document.addEventListener('click', () => {
      if (dropdown) dropdown.classList.add('hidden');
    });
  }

  // Mark all as read menu item
  const markAllReadBtn = document.getElementById('wa-menu-mark-all-read');
  if (markAllReadBtn) {
    markAllReadBtn.onclick = async () => {
      const currentUserId = currentUser ? currentUser.id : '';
      await fetch('/api/chat/mark-all-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId })
      });
      showToast("All chats marked as read", "success");
      await refreshWaChatData();
    };
  }

  // Archived menu item
  const viewArchivedBtn = document.getElementById('wa-menu-view-archived');
  if (viewArchivedBtn) {
    viewArchivedBtn.onclick = () => {
      pills.forEach(x => x.classList.remove('active'));
      const archivedPill = document.querySelector('.wa-pill[data-filter="archived"]');
      if (archivedPill) archivedPill.classList.add('active');
      waChatFilter = 'archived';
      renderWaChatList();
    };
  }

  // Archive / Unarchive Active Chat Toggle
  const toggleArchiveBtn = document.getElementById('wa-btn-toggle-archive');
  if (toggleArchiveBtn) {
    toggleArchiveBtn.onclick = async () => {
      if (!waActiveChat) return;
      const currentUserId = currentUser ? currentUser.id : '';
      const currentIsArchived = waActiveChat.isArchived;
      await fetch('/api/chat/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUserId, chatId: waActiveChat.id, isArchived: !currentIsArchived })
      });
      showToast(currentIsArchived ? "Chat unarchived" : "Chat archived", "info");
      await refreshWaChatData();
    };
  }

  // Meeting button in chat header -> jump to meeting tab
  const meetingBtn = document.getElementById('wa-btn-chat-meeting');
  if (meetingBtn) {
    meetingBtn.onclick = () => {
      switchTab('meetings');
    };
  }

  // Send message on click & enter key
  const sendBtn = document.getElementById('wa-btn-send');
  const msgInput = document.getElementById('wa-message-input');
  if (sendBtn) sendBtn.onclick = sendWaMessage;
  if (msgInput) {
    msgInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendWaMessage();
      }
    };
  }

  // Create Group Modal Triggers
  const btnNewGroup = document.getElementById('wa-btn-new-group');
  const menuNewGroup = document.getElementById('wa-menu-new-group');
  const groupModal = document.getElementById('create-group-modal');
  const closeGroupModal = document.getElementById('close-group-modal');
  const btnCancelGroup = document.getElementById('btn-cancel-group');
  const groupForm = document.getElementById('create-group-form');
  const groupSearch = document.getElementById('group-member-search');

  function openGroupModal() {
    if (groupModal) groupModal.classList.remove('hidden');
    populateGroupMembersList('');
  }
  function closeGroupModalFunc() {
    if (groupModal) groupModal.classList.add('hidden');
  }

  if (btnNewGroup) btnNewGroup.onclick = openGroupModal;
  if (menuNewGroup) menuNewGroup.onclick = openGroupModal;
  if (closeGroupModal) closeGroupModal.onclick = closeGroupModalFunc;
  if (btnCancelGroup) btnCancelGroup.onclick = closeGroupModalFunc;

  if (groupSearch) {
    groupSearch.oninput = (e) => {
      populateGroupMembersList(e.target.value);
    };
  }

  if (groupForm) {
    groupForm.onsubmit = async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('group-name-input');
      const groupName = nameInput ? nameInput.value.trim() : '';
      if (!groupName) return;

      const checkedBoxes = document.querySelectorAll('.group-member-checkbox:checked');
      const selectedMemberIds = Array.from(checkedBoxes).map(cb => cb.value);

      const currentUserId = currentUser ? currentUser.id : '';
      if (!selectedMemberIds.includes(currentUserId)) {
        selectedMemberIds.push(currentUserId);
      }

      if (selectedMemberIds.length < 2) {
        showToast("Please select at least one employee to create a group", "warning");
        return;
      }

      try {
        const res = await fetch('/api/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: groupName,
            createdById: currentUserId,
            members: selectedMemberIds
          })
        });

        if (res.ok) {
          showToast(`Group "${groupName}" created!`, "success");
          closeGroupModalFunc();
          if (nameInput) nameInput.value = '';
          await refreshWaChatData();
        }
      } catch (err) {
        console.error("Error creating group:", err);
      }
    };
  }

  // Real-time Socket.IO Listeners
  if (typeof socket !== 'undefined' && socket) {
    socket.on("newMessage", (msg) => {
      if (!isMsgDuplicate(msg, waAllMessages)) {
        waAllMessages.push(msg);
      }
      if (waActiveChat && (
        (waActiveChat.type === 'direct' && (msg.senderId === waActiveChat.id || msg.receiverId === waActiveChat.id || msg.sender === waActiveChat.name || msg.receiver === waActiveChat.name)) ||
        (waActiveChat.type === 'group' && (msg.receiverId === waActiveChat.id || msg.receiver === waActiveChat.name))
      )) {
        loadWaActiveChatMessages();
      }
      renderWaChatList();
    });

    socket.on("employeeStatusChanged", () => {
      fetch('/api/employees/status').then(res => res.json()).then(data => {
        waEmployeesStatus = data;
        renderWaChatList();
        if (waActiveChat && waActiveChat.type === 'direct') {
          const statusObj = waEmployeesStatus[waActiveChat.id] || { status: 'free', label: 'Free' };
          waActiveChat.status = statusObj.status;
          waActiveChat.statusLabel = statusObj.label;
          selectWaChat(waActiveChat);
        }
      });
    });

    socket.on("groupCreated", () => {
      refreshWaChatData();
    });

    socket.on("chatsMarkedRead", () => {
      refreshWaChatData();
    });

    socket.on("chatMarkedRead", ({ userId, chatId }) => {
      if (waUserPreferences[chatId]) {
        waUserPreferences[chatId].lastReadTimestamp = new Date().toISOString();
      }
      waAllMessages.forEach(m => {
        if ((m.senderId === chatId || m.receiverId === chatId) && m.senderId !== userId) {
          if (!Array.isArray(m.readBy)) m.readBy = [];
          if (!m.readBy.includes(userId)) m.readBy.push(userId);
        }
      });
      renderWaChatList();
    });
  }
}

function populateGroupMembersList(query) {
  const container = document.getElementById('group-members-list');
  if (!container) return;

  const currentUserId = currentUser ? currentUser.id : '';
  const q = query.toLowerCase();

  const filtered = waAllEmployees.filter(emp => {
    if (emp.id === currentUserId) return false;
    if (!q) return true;
    return emp.fullname.toLowerCase().includes(q) || emp.role.toLowerCase().includes(q);
  });

  container.innerHTML = '';
  filtered.forEach(emp => {
    const row = document.createElement('label');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer; border-bottom: 1px solid var(--border-color); font-size: 0.85rem; color: var(--text-primary);';
    row.innerHTML = `
      <input type="checkbox" class="group-member-checkbox" value="${emp.id}">
      <span><strong>${emp.fullname}</strong> (${emp.role})</span>
    `;
    container.appendChild(row);
  });
}

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatChatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
