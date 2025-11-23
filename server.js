/**
 *chat server
 * Features:
 * - usernames
 * - rooms
 * - typing indicator
 * - online users tracking
 * - message history persisted to messages.json
 * Next Improvements:
 * -Link to a DB so the chat gets stored
 * -Add feature new chat button
 * -Enhance UI
 * -Deploy to Render, so the app goes online
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, 'messages.json');


const app = express();
const server = http.createServer(app);
const io = new Server(server);

// serve static files
app.use(express.static(path.join(__dirname, 'public')));

// utility to load/save messages
async function loadMessages() {
  try {
    const content = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') return []; // no file yet
    console.error('Error reading messages file:', err);
    return [];
  }
}

async function saveMessages(messages) {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(messages, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving messages:', err);
  }
}

// in-memory structures
const onlineUsers = new Map(); // socket.id => { username, room }

io.on('connection', async (socket) => {
  console.log('client connected', socket.id);

  // send recent history (last 50 messages)
  const allMessages = await loadMessages();
  const recent = allMessages.slice(-50);
  socket.emit('history', recent);

  // when a user sets their username and room
  socket.on('join', ({ username, room }) => {
    username = String(username || 'Anonymous').trim().slice(0, 30) || 'Anonymous';
    room = String(room || 'main').trim().slice(0, 30) || 'main';

    onlineUsers.set(socket.id, { username, room });
    socket.join(room);

    // notify others in room
    socket.to(room).emit('system message', `${username} joined the room`);

    // broadcast updated user list for that room
    broadcastUserList(room);
  });

  // chat message with metadata
  socket.on('chat message', async (payload) => {
    // payload should contain { text }
    const meta = onlineUsers.get(socket.id) || { username: 'Anonymous', room: 'main' };
    const msg = {
      id: uuidv4(),
      text: String(payload.text || '').slice(0, 1000),
      username: meta.username,
      room: meta.room,
      timestamp: new Date().toISOString()
    };

    // persist to file
    try {
      const msgs = await loadMessages();
      msgs.push(msg);
      await saveMessages(msgs);
    } catch (err) {
      console.error('Failed to persist message:', err);
    }

    // emit to room
    io.to(meta.room).emit('chat message', msg);
  });

  // typing indicator
  socket.on('typing', (isTyping) => {
    const meta = onlineUsers.get(socket.id) || { username: 'Anonymous', room: 'main' };
    socket.to(meta.room).emit('typing', { username: meta.username, typing: !!isTyping });
  });

  // switch rooms
  socket.on('switch room', (newRoom) => {
    const meta = onlineUsers.get(socket.id) || { username: 'Anonymous', room: 'main' };
    const oldRoom = meta.room;
    socket.leave(oldRoom);
    socket.join(newRoom);
    meta.room = newRoom;
    onlineUsers.set(socket.id, meta);

    socket.to(oldRoom).emit('system message', `${meta.username} left the room`);
    socket.to(newRoom).emit('system message', `${meta.username} joined the room`);
    broadcastUserList(oldRoom);
    broadcastUserList(newRoom);
  });

  socket.on('disconnect', () => {
    const meta = onlineUsers.get(socket.id);
    if (meta) {
      socket.to(meta.room).emit('system message', `${meta.username} disconnected`);
      onlineUsers.delete(socket.id);
      broadcastUserList(meta.room);
    }
    console.log('client disconnected', socket.id);
  });
});

// helper to broadcast user list for a room
function broadcastUserList(room) {
  const users = [];
  for (const [, v] of onlineUsers) {
    if (v.room === room) users.push(v.username);
  }
  io.to(room).emit('user list', users);
}

// ensure messages.json exists (optional)
(async () => {
  try {
    await fs.access(DATA_FILE);
  } catch (err) {
    // create empty file
    await saveMessages([]);
  }
})();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Chat server listening on http://localhost:${PORT}`));