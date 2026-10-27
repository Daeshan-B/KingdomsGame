import { useCallback, useEffect, useRef, useState } from 'react';
import {
  joinGame,
  fetchState,
  performJob,
  startBuild as apiStartBuild,
  sendCaravan as apiSendCaravan,
  scanNow as apiScanNow,
  seedChat as apiSeedChat,
} from '../services/api.js';
import { connectSocket, disconnectSocket, sendChat } from '../services/socket.js';

const STORAGE_KEY = 'kingdoms_player_id';
const MAX_CHAT = 60;

export function useGame() {
  const [player, setPlayer] = useState(null);
  const [world, setWorld] = useState(null); // jobs, factions, effects, timers
  const [resources, setResources] = useState(null);
  const [otherResources, setOtherResources] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [caravans, setCaravans] = useState([]);
  const [market, setMarket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [diplomacy, setDiplomacy] = useState([]);
  const [sentiments, setSentiments] = useState([]);
  const [aiLog, setAiLog] = useState([]);
  const [scan, setScan] = useState(null);
  const [presence, setPresence] = useState([]);
  const [cooldowns, setCooldowns] = useState({});
  const [cooldownStamp, setCooldownStamp] = useState(Date.now());
  const [now, setNow] = useState(Date.now());

  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const socketRef = useRef(null);

  const hydrate = useCallback((state) => {
    setPlayer(state.player);
    setWorld({
      factions: state.factions,
      jobs: state.jobs,
      jobEffects: state.jobEffects || {},
      jobTimers: state.jobTimers || {},
      buildingDefs: state.buildingDefs || [],
    });
    setResources(state.resources);
    setOtherResources(state.otherResources || []);
    setBuildings(state.buildings || []);
    setCaravans(state.caravans || []);
    setMarket(state.market || null);
    setMessages(state.messages || []);
    setDiplomacy(state.diplomacy || []);
    setSentiments(state.sentiments || []);
    setAiLog(state.aiLog || []);
    setScan(state.scan || null);
    setPresence(state.presence || []);
    setCooldowns(state.cooldowns || {});
    setCooldownStamp(Date.now());
    setStatus('ready');
  }, []);

  const refresh = useCallback(async () => {
    if (!player) return;
    try {
      const data = await fetchState(player.id);
      setBuildings(data.state.buildings || []);
      setResources(data.state.resources);
      setCaravans(data.state.caravans || []);
      setMarket(data.state.market || null);
      if (data.state.diplomacy) setDiplomacy(data.state.diplomacy);
      setCooldowns(data.state.cooldowns || {});
      setCooldownStamp(Date.now());
      if (data.state.jobTimers) setWorld((w) => ({ ...w, jobTimers: data.state.jobTimers }));
    } catch {
      /* transient - the socket will bring it back */
    }
  }, [player]);

  const restore = useCallback(async () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    setStatus('loading');
    try {
      const data = await fetchState(saved);
      hydrate(data.state);
      socketRef.current = connectSocket(saved);
    } catch (err) {
      localStorage.removeItem(STORAGE_KEY);
      setError(err.message);
      setStatus('idle');
    }
  }, [hydrate]);

  useEffect(() => {
    restore();
  }, [restore]);

  // Building events only tell us something changed; the authoritative snapshot comes
  // from the server. Refreshing keeps every member's progress bars identical instead of
  // patching one row and leaving the rest of the board stale.

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !player) return;

    const onResources = ({ faction, resources: next }) => {
      if (faction === player.faction) setResources(next);
      else setOtherResources((prev) => prev.map((r) => (r.faction === faction ? { ...r, ...next } : r)));
    };

    const onMessage = (msg) => setMessages((prev) => [...prev, msg].slice(-MAX_CHAT));
    const onPresence = (list) => setPresence(list || []);

    const onDiplomacy = ({ pairs, log }) => {
      if (pairs) setDiplomacy(pairs);
      if (log) setAiLog(log);
    };

    const onSentiment = ({ sentiments: s, changes, at }) => {
      if (s) setSentiments(s);
      if (at) {
        setScan((prev) => (prev ? { ...prev, lastFinishedAt: at, nextScanAt: at + prev.intervalMs } : prev));
      }
      if (changes?.length) {
        setFlash(changes[changes.length - 1].decision.reason);
        setTimeout(() => setFlash(''), 8000);
      }
    };

    const onBuildingStart = () => refresh();
    const onBuildingComplete = (row) => {
      setFlash(`${row.type} reached level ${row.level}`);
      setTimeout(() => setFlash(''), 5000);
      refresh();
    };
    const onBuildingsRefresh = () => refresh();

    // A wagon landing moves two stockpiles at once, so never patch locally here -
    // take the authoritative numbers from the server.
    const onCaravan = ({ event, caravan }) => {
      if (!caravan) return;
      if (event === 'sent' && caravan.receiver === player.faction) {
        setFlash(`${caravan.sender} sent ${caravan.cargoAmount} ${caravan.cargoResource} our way`);
      } else if (event === 'delivered') {
        setFlash(`Caravan landed: ${caravan.note}`);
      } else if (event === 'raided') {
        setFlash(`Caravan lost: ${caravan.note}`);
      } else {
        return; // our own outgoing wagon - the HTTP call already updated the panel
      }
      setTimeout(() => setFlash(''), 7000);
      refresh();
    };
    const onCaravansRefresh = () => refresh();

    socket.on('resources:update', onResources);
    socket.on('chat:message', onMessage);
    socket.on('presence:update', onPresence);
    socket.on('diplomacy:change', onDiplomacy);
    socket.on('sentiment:update', onSentiment);
    socket.on('building:start', onBuildingStart);
    socket.on('building:complete', onBuildingComplete);
    socket.on('buildings:refresh', onBuildingsRefresh);
    socket.on('caravan:update', onCaravan);
    socket.on('caravans:refresh', onCaravansRefresh);

    return () => {
      socket.off('resources:update', onResources);
      socket.off('chat:message', onMessage);
      socket.off('presence:update', onPresence);
      socket.off('diplomacy:change', onDiplomacy);
      socket.off('sentiment:update', onSentiment);
      socket.off('building:start', onBuildingStart);
      socket.off('building:complete', onBuildingComplete);
      socket.off('buildings:refresh', onBuildingsRefresh);
      socket.off('caravan:update', onCaravan);
      socket.off('caravans:refresh', onCaravansRefresh);
    };
  }, [player, refresh]);

  // One shared 1s tick drives every countdown in the UI.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Self-heal: if a project or a wagon's timer elapsed but no socket event landed,
  // ask for a fresh copy.
  useEffect(() => {
    const staleBuild = buildings.find((b) => b.building && b.completesAt && b.completesAt <= now);
    const staleWagon = caravans.find((c) => c.status === 'traveling' && c.arrivesAt <= now);
    if (staleBuild || staleWagon) refresh();
  }, [now, buildings, caravans, refresh]);

  useEffect(() => () => disconnectSocket(), []);

  const join = useCallback(
    async (username, faction) => {
      setStatus('loading');
      setError('');
      try {
        const state = await joinGame(username, faction);
        localStorage.setItem(STORAGE_KEY, state.player.id);
        hydrate(state);
        socketRef.current = connectSocket(state.player.id);
      } catch (err) {
        setError(err.message);
        setStatus('idle');
      }
    },
    [hydrate]
  );

  const leave = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    disconnectSocket();
    socketRef.current = null;
    setPlayer(null);
    setStatus('idle');
  }, []);

  const doJob = useCallback(
    async (jobType) => {
      if (!player) return;
      const result = await performJob(player.id, jobType);
      if (!result.ok) {
        setFlash(result.error || 'Job failed');
        setTimeout(() => setFlash(''), 4000);
        if (result.msRemaining) {
          setCooldowns((prev) => ({ ...prev, [jobType]: result.msRemaining }));
          setCooldownStamp(Date.now());
        }
        return;
      }
      setResources(result.resources);
      setCooldowns(result.cooldowns);
      setCooldownStamp(Date.now());
      if (result.jobTimers) setWorld((w) => ({ ...w, jobTimers: result.jobTimers }));
      if (result.job?.yields) {
        setWorld((w) => ({ ...w, jobEffects: { ...w.jobEffects, [jobType]: result.job.yields } }));
      }
    },
    [player]
  );

  const build = useCallback(
    async (type) => {
      if (!player) return;
      const result = await apiStartBuild(player.id, type);
      if (!result.ok) {
        setFlash(result.error || 'Cannot build that');
        setTimeout(() => setFlash(''), 4000);
        return;
      }
      setBuildings(result.buildings);
      setResources(result.resources);
    },
    [player]
  );

  /**
   * Load a wagon for a partner faction. The server answers with the fresh
   * caravan list and market, so a successful send needs no extra refresh.
   */
  const sendCaravan = useCallback(
    async (receiver, resource, amount, ask = 'auto') => {
      if (!player) return { ok: false };
      const result = await apiSendCaravan(player.id, receiver, resource, amount, ask);
      if (!result.ok) {
        setFlash(result.error || 'The wagon will not move');
        setTimeout(() => setFlash(''), 6000);
        refresh();
        return result;
      }
      setResources(result.resources);
      setCaravans(result.caravans || []);
      setMarket(result.market || null);
      return result;
    },
    [player, refresh]
  );

  const chat = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const ack = await sendChat(trimmed);
    if (!ack.ok) {
      setFlash(ack.error || 'Message not sent');
      setTimeout(() => setFlash(''), 4000);
    }
  }, []);

  const runScanNow = useCallback(async () => {
    const data = await apiScanNow();
    if (data.diplomacy) setDiplomacy(data.diplomacy);
    if (data.aiLog) setAiLog(data.aiLog);
    if (data.scan) setScan(data.scan);
    refresh();
  }, [refresh]);

  const seedChat = useCallback(
    async (faction, mood) => {
      const data = await apiSeedChat(faction, mood);
      if (data.ok && faction === player?.faction) {
        const fresh = await fetchState(player.id);
        setMessages(fresh.state.messages);
      }
      return data;
    },
    [player]
  );

  /** Ms left before a job is clickable again. */
  const jobCooldown = useCallback(
    (jobType) => Math.max(0, (cooldowns[jobType] || 0) - (now - cooldownStamp)),
    [cooldowns, cooldownStamp, now]
  );

  const nextScanInMs = scan ? Math.max(0, scan.nextScanAt - now) : null;

  return {
    player,
    world,
    resources,
    otherResources,
    buildings,
    caravans,
    market,
    messages,
    diplomacy,
    sentiments,
    aiLog,
    scan,
    presence,
    status,
    error,
    flash,
    now,
    join,
    leave,
    doJob,
    build,
    sendCaravan,
    chat,
    runScanNow,
    seedChat,
    refresh,
    jobCooldown,
    nextScanInMs,
    setFlash,
  };
}
