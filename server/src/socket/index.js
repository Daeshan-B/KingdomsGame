import { FACTION_IDS, WORLD } from '../config.js';
import { getPlayer, addMessage, getMessages } from '../db/queries.js';
import { setIo, broadcastAll, broadcastFaction } from './hub.js';

const online = new Map(); // socketId -> { playerId, username, faction }

export function presence() {
  const seen = new Set();
  const list = [];
  for (const entry of online.values()) {
    if (seen.has(entry.playerId)) continue;
    seen.add(entry.playerId);
    list.push(entry);
  }
  return FACTION_IDS.map((faction) => ({
    faction,
    players: list.filter((p) => p.faction === faction),
  }));
}

function announcePresence() {
  broadcastAll('presence:update', presence());
}

export function attachSocket(io) {
  setIo(io);

  io.on('connection', (socket) => {
    // Client announces who it is right after connecting.
    socket.on('player:hello', (payload = {}) => {
      const player = getPlayer(payload.playerId);
      if (!player) {
        socket.emit('hello:error', { error: 'Unknown player' });
        return;
      }
      socket.data.player = { playerId: player.id, username: player.username, faction: player.faction };
      online.set(socket.id, socket.data.player);
      socket.join(`faction:${player.faction}`);
      socket.join(`player:${player.id}`);
      socket.emit('hello:ok', { player, presence: presence() });
      announcePresence();
    });

    socket.on('chat:send', (payload = {}, ack) => {
      const who = socket.data.player;
      if (!who || !payload.content || !String(payload.content).trim()) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Nothing to send' });
        return;
      }
      try {
        const message = addMessage({
          faction: who.faction,
          playerId: who.playerId,
          username: who.username,
          content: payload.content,
        });
        broadcastFaction(who.faction, 'chat:message', message);
        if (typeof ack === 'function') ack({ ok: true, message });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
      }
    });

    socket.on('chat:history', (payload = {}, ack) => {
      if (typeof ack !== 'function') return;
      const faction = FACTION_IDS.includes(payload.faction) ? payload.faction : null;
      if (!faction) return ack({ ok: false, error: 'Unknown faction' });
      ack({ ok: true, messages: getMessages(faction, 40) });
    });

    socket.on('disconnect', () => {
      const gone = online.get(socket.id);
      online.delete(socket.id);
      if (gone) announcePresence();
    });
  });
}
