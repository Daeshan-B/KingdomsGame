import { io } from 'socket.io-client';

let socket = null;

/** Connect (or reconnect) and announce the player to the server. */
export function connectSocket(playerId) {
  if (socket) socket.disconnect();
  socket = io({ transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    socket.emit('player:hello', { playerId });
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) socket.disconnect();
  socket = null;
}

/** Send a chat message; resolves with the server ack. */
export function sendChat(content) {
  return new Promise((resolve) => {
    if (!socket || !socket.connected) return resolve({ ok: false, error: 'Not connected' });
    socket.emit('chat:send', { content }, (ack) => resolve(ack || { ok: false }));
  });
}
