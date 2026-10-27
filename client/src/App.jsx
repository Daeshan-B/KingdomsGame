import { useEffect, useState } from 'react';
import { useGame } from './hooks/useGame.js';
import { fetchConfig } from './services/api.js';
import JoinScreen from './components/JoinScreen.jsx';
import Header from './components/Header.jsx';
import ResourcesPanel from './components/ResourcesPanel.jsx';
import JobsPanel from './components/JobsPanel.jsx';
import BuildingsPanel from './components/BuildingsPanel.jsx';
import MarketPanel from './components/MarketPanel.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import WorldStatusPanel from './components/WorldStatusPanel.jsx';
import { Window, StatusCell, Marquee, Counter, RainbowRule } from './components/Win95.jsx';
import { PixelIcon, factionIcon } from './components/PixelIcon.jsx';

function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// A slim status strip under the window: current hold + a clock. Retro framing
// without lifting a specific desktop's taskbar wholesale.
function Taskbar({ faction, now }) {
  const clock = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return (
    <div className="menubar bw flex w-full max-w-[800px] items-center gap-1 p-[2px]">
      <span className="btn is-down min-w-0 flex-1 px-2 py-[2px] text-left text-xs">
        <span className="mr-1 inline-flex items-center">
          {faction ? <PixelIcon name={factionIcon(faction.id)} size={13} /> : null}
        </span>
        Kingdoms - {faction ? faction.id : 'World'}
      </span>
      <span className="bs-thin flex items-center gap-1 px-2 py-[2px] text-xs tabular-nums">{clock}</span>
    </div>
  );
}

export default function App() {
  const g = useGame();
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState('');

  useEffect(() => {
    let alive = true;
    fetchConfig()
      .then((data) => alive && setConfig(data))
      .catch((err) => alive && setConfigError(err.message));
    return () => {
      alive = false;
    };
  }, []);

  if (g.status === 'loading' && !g.player) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Window title="Please Wait" icon="ui-save" className="w-[320px]" bodyClassName="p-3 text-xs">
          <p>Reopening your kingdom...</p>
          <p className="ascii blink mt-2 text-cyan">&gt; load saved game_</p>
        </Window>
      </div>
    );
  }

  if (!g.player) {
    return (
      <JoinScreen
        factions={config?.factions || []}
        onJoin={g.join}
        status={g.status}
        error={g.error || (configError ? `Cannot reach the game server (${configError}). Run: npm run dev` : '')}
      />
    );
  }

  const myFaction =
    (g.world?.factions || []).find((f) => f.id === g.player.faction) || g.world?.factions?.[0];

  if (!myFaction) return null;

  const wagons = (g.caravans || []).filter((c) => c.status === 'traveling').length;
  const online = (g.presence || []).reduce((sum, p) => sum + (p.players?.length || 0), 0);

  return (
    <div className="flex min-h-screen flex-col items-center gap-2 p-3">
      <main className="window w-full max-w-[800px]">
        <Header faction={myFaction} presence={g.presence} onLeave={g.leave} flash={g.flash} />

        {/* MDI client area: dark dither, sunken into the application window */}
        <div
          className="bs flex flex-col gap-2 p-2 lg:flex-row lg:items-start"
          style={{ backgroundColor: '#221826' }}
        >
          <div className="min-w-0 flex-1 space-y-2">
            <JobsPanel
              jobs={g.world.jobs}
              resources={g.resources}
              effects={g.world.jobEffects}
              timers={g.world.jobTimers}
              cooldownFor={g.jobCooldown}
              onJob={g.doJob}
            />
            <BuildingsPanel buildings={g.buildings} faction={myFaction} onBuild={g.build} now={g.now} />
            <MarketPanel
              market={g.market}
              caravans={g.caravans}
              faction={myFaction}
              onSend={g.sendCaravan}
              now={g.now}
            />
            <ChatPanel
              faction={myFaction}
              messages={g.messages}
              onSend={g.chat}
              scanInMs={g.nextScanInMs}
            />
          </div>

          <div className="w-full space-y-2 lg:w-[292px] lg:flex-none">
            <ResourcesPanel
              faction={myFaction}
              resources={g.resources}
              otherResources={g.otherResources}
              diplomacy={g.diplomacy}
              factions={g.world?.factions || []}
              rates={g.market?.rates}
            />
            <WorldStatusPanel
              diplomacy={g.diplomacy}
              sentiments={g.sentiments}
              aiLog={g.aiLog}
              caravans={g.caravans}
              scan={g.scan}
              nextScanInMs={g.nextScanInMs}
              onScanNow={g.runScanNow}
              onSeed={g.seedChat}
              myFaction={myFaction}
            />
          </div>
        </div>

        <div className="statusbar">
          <StatusCell grow>
            <Marquee>
              {myFaction.motto} - the AI council re-reads every faction chat on its own schedule - wagons only
              roll while a trade deal is signed
            </Marquee>
          </StatusCell>
          <StatusCell className="tabular-nums">{online} on</StatusCell>
          <StatusCell className="tabular-nums">
            council {g.nextScanInMs !== null ? `in ${fmtClock(g.nextScanInMs)}` : 'in ?'}
          </StatusCell>
          <StatusCell className="tabular-nums">{wagons} wagon(s)</StatusCell>
        </div>
      </main>

      <Taskbar faction={myFaction} now={g.now} />

      <footer className="window w-full max-w-[800px] p-2 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            This page is under construction &#8212; <span className="link">sign my guestbook</span>
          </span>
          <span className="flex items-center gap-1">
            players served: <Counter value={online} digits={3} />
          </span>
          <span className="text-xx text-ash">Handmade pixel art - Dungeon-20 palette - best played at 800x600.</span>
        </div>
        <RainbowRule />
        <div className="hazard" />
      </footer>
    </div>
  );
}
