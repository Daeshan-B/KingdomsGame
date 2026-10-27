// Holds the Socket.io server so any module can broadcast without circular imports.
let io = null;

export function setIo(instance) {
  io = instance;
}

export function getIo() {
  return io;
}

/** Send to every connected client. */
export function broadcastAll(event, payload) {
  if (io) io.emit(event, payload);
}

/** Send to one faction room (players of that faction only). */
export function broadcastFaction(faction, event, payload) {
  if (io) io.to(`faction:${faction}`).emit(event, payload);
}

/** Send to one faction room and everyone else's world feed. */
export function broadcastWorld(event, payload) {
  if (io) io.emit(event, payload);
}
