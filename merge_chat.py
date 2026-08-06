import os

with open('D:/employee_dashboard/app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

socket_logic = '''
const socket = io();

let activeChatEmployee = null;
const renderedMessageIds = new Set();

socket.on("connect", () => {
  console.log("SOCKET CONNECTED:", socket.id);
});

socket.on("newMessage", (msg) => {
  console.log("REAL-TIME MESSAGE RECEIVED:", msg);
  if (!activeChatEmployee) return;

  const currentUserName = (typeof currentUser !== 'undefined' && currentUser && currentUser.fullname) ? currentUser.fullname : "Current User";
  const isCurrentConversation =
    (msg.sender === currentUserName && (msg.receiver === activeChatEmployee || msg.receiver.includes(activeChatEmployee))) ||
    ((msg.sender === activeChatEmployee || msg.sender.includes(activeChatEmployee)) && msg.receiver === currentUserName) ||
    (msg.sender === "Current User" && (msg.receiver === activeChatEmployee || msg.receiver.includes(activeChatEmployee))) ||
    ((msg.sender === activeChatEmployee || msg.sender.includes(activeChatEmployee)) && msg.receiver === "Current User");

  if (!isCurrentConversation) return;

  const chatMessages = document.querySelector(".chat-messages");
  if (!chatMessages) return;

  if (msg._id && renderedMessageIds.has(msg._id)) return;
  if (msg._id) renderedMessageIds.add(msg._id);

  const emptyMsg = chatMessages.querySelector(".empty-chat-message");
  if (emptyMsg) emptyMsg.remove();

  appendSingleMessage(chatMessages, msg, currentUserName);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

function appendSingleMessage(container, msg, currentUserName) {
  const isSentByMe = msg.sender === currentUserName || msg.sender === "Current User";
  const messageEl = document.createElement("div");
  messageEl.className = \message-bubble \\;
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

'''

render_chat_tab = '''
function renderChatTab() {
  const chatUsers = document.querySelectorAll(".chat-user");
  const chatHeader = document.querySelector(".chat-header strong");
  const chatMessages = document.querySelector(".chat-messages");
  const chatInput = document.querySelector(".chat-input input");
  const sendButton = document.querySelector(".chat-input button");

  const currentUserName = (typeof currentUser !== 'undefined' && currentUser && currentUser.fullname) ? currentUser.fullname : "Current User";

  chatUsers.forEach(user => {
    user.onclick = async function () {
      chatUsers.forEach(u => u.classList.remove("active"));
      this.classList.add("active");
      const strongEl = this.querySelector("strong");
      activeChatEmployee = strongEl ? strongEl.textContent.trim() : this.textContent.trim();
      chatHeader.textContent = activeChatEmployee;
      await loadMessages();
    };
  });

  async function loadMessages() {
    if (!activeChatEmployee) return;
    try {
      const response = await fetch("/api/messages");
      const messages = await response.json();
      chatMessages.innerHTML = "";
      renderedMessageIds.clear();

      const employeeMessages = messages.filter(msg =>
        (msg.sender === currentUserName && (msg.receiver === activeChatEmployee || msg.receiver.includes(activeChatEmployee))) ||
        ((msg.sender === activeChatEmployee || msg.sender.includes(activeChatEmployee)) && msg.receiver === currentUserName) ||
        (msg.sender === "Current User" && (msg.receiver === activeChatEmployee || msg.receiver.includes(activeChatEmployee))) ||
        ((msg.sender === activeChatEmployee || msg.sender.includes(activeChatEmployee)) && msg.receiver === "Current User")
      );

      if (employeeMessages.length === 0) {
        const emptyMessage = document.createElement("div");
        emptyMessage.className = "empty-chat-message";
        emptyMessage.textContent = "No messages yet. Say hello!";
        chatMessages.appendChild(emptyMessage);
        return;
      }

      employeeMessages.forEach(msg => {
        if (msg._id) renderedMessageIds.add(msg._id);
        appendSingleMessage(chatMessages, msg, currentUserName);
      });
      chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  }

  async function sendMessage() {
    const messageText = chatInput.value.trim();
    if (!activeChatEmployee) {
      alert("Please select an employee first.");
      return;
    }
    if (!messageText) return;

    try {
      chatInput.value = "";
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: "Current User", receiver: activeChatEmployee, message: messageText })
      });
      const newMessage = await response.json();
      if (!response.ok) {
        console.error("Error saving message:", newMessage);
        return;
      }
      if (newMessage._id && !renderedMessageIds.has(newMessage._id)) {
        renderedMessageIds.add(newMessage._id);
        const emptyMsg = chatMessages.querySelector(".empty-chat-message");
        if (emptyMsg) emptyMsg.remove();
        appendSingleMessage(chatMessages, newMessage, currentUserName);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Could not connect to chat server.");
    }
  }

  sendButton.onclick = sendMessage;
  if (chatInput) {
    chatInput.onkeydown = function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
      }
    };
  }
}
'''

app_js = app_js.replace('const DEFAULT_USERS = [];', socket_logic + '\\nconst DEFAULT_USERS = [];')
app_js = app_js + '\\n' + render_chat_tab

old_switch_tab = '''else if (tabId === "attendance") {
    renderAttendanceTab();
  }'''
new_switch_tab = '''else if (tabId === "attendance") {
    renderAttendanceTab();
  }
  else if (tabId === "chat") {
    renderChatTab();
  }'''
app_js = app_js.replace(old_switch_tab, new_switch_tab)

with open('D:/employee_dashboard/app.js', 'w', encoding='utf-8') as f:
    f.write(app_js)

print("Patched app.js with chat UI logic")

