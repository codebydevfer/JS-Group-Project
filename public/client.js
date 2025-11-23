// client-side logic
const socket = io();

const form = document.getElementById('form');
const input = document.getElementById('input');
const messages = document.getElementById('messages');
const usersList = document.getElementById('users');
const usernameInput = document.getElementById('username');
const typingDiv = document.getElementById('typing');
const currentRoomLabel = document.getElementById('currentRoom');

let username = 'Anonymous';
let currentRoom = 'main';
let typingTimeout = null;

// join when username changes or at load
function joinRoom(name = username, room = currentRoom) {
  username = (name || 'Anonymous').trim().slice(0,30) || 'Anonymous';
  currentRoom = room || 'main';
  currentRoomLabel.textContent = `Room: ${currentRoom}`;
  socket.emit('join', { username, room: currentRoom });
}

usernameInput.addEventListener('change', () => {
  joinRoom(usernameInput.value, currentRoom);
});

// initial join
joinRoom(usernameInput.value || 'Anonymous', 'main');

// handle room buttons
document.querySelectorAll('.roomBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    const newRoom = btn.dataset.room;
    if (newRoom === currentRoom) return;
    socket.emit('switch room', newRoom);
    currentRoom = newRoom;
    currentRoomLabel.textContent = `Room: ${currentRoom}`;
    messages.innerHTML = ''; // clear local view (server will send history)
  });
});

// form submit
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  socket.emit('chat message', { text });
  input.value = '';
  socket.emit('typing', false);
});

// incoming message (object with username, text, timestamp)
socket.on('chat message', (msg) => {
  appendMessage(msg);
});

// system messages (plain text)
socket.on('system message', (text) => {
  const li = document.createElement('li');
  li.className = 'system';
  li.textContent = text;
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
});

// history (array of messages)
socket.on('history', (msgs) => {
  messages.innerHTML = '';
  msgs.filter(m => m.room === currentRoom).forEach(appendMessage);
  messages.scrollTop = messages.scrollHeight;
});

// user list update
socket.on('user list', (users) => {
  usersList.innerHTML = '';
  users.forEach(u => {
    const li = document.createElement('li');
    li.textContent = u;
    usersList.appendChild(li);
  });
});

// typing indicator
socket.on('typing', ({ username: who, typing }) => {
  if (typing) {
    typingDiv.textContent = `${who} is typing...`;
  } else {
    typingDiv.textContent = '';
  }
});

// local typing event
input.addEventListener('input', () => {
  clearTimeout(typingTimeout);
  socket.emit('typing', true);
  typingTimeout = setTimeout(() => {
    socket.emit('typing', false);
  }, 900);
});

// helper to append message to UI
function appendMessage(msg) {
  // ensure it's for current room
  if (msg.room && msg.room !== currentRoom) return;
  const li = document.createElement('li');
  li.className = 'message';
  const time = new Date(msg.timestamp).toLocaleTimeString();
  li.innerHTML = `<span class="meta">${msg.username} <small>${time}</small></span>
                  <div class="text">${escapeHtml(msg.text)}</div>`;
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
}

// basic escaping
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
