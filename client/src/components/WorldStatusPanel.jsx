import { useState } from 'react';
import { Window, Group, BlockBar, Btn } from './Win95.jsx';

const STATE_STYLE = {
  war: { text: 'AT WAR', bg: '#b5505a', fg: '#e3e6de' },
  trade: { text: 'TRADE', bg: '#57c7d0', fg: '#120d14' },
  neutral: { text: 'NEUTRAL', bg: '#211a28', fg: '#a8b0a0' },
};

const MOODS = [
  { key: 'aggression', label: 'Aggression', color: '#b5505a' },
  { key: 'cooperation', label: 'Cooperation', color: '#57c7d0' },
  { key: 'fear', label: 'Fear', color: '#cd6a3f' },
];

function clockOf(ts) {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function WorldStatusPanel({
  diplomacy = [],
  sentiments = [],
  aiLog = [],
  caravans = [],
  scan,
  nextScanInMs,
  onScanNow,
  onSeed,
  myFaction,
}) {
  const [seeding, setSeeding] = useState(false);

  async function seed(mood) {
    setSeeding(true);
    try {
      await onSeed(myFaction.id, mood);
    } finally {
      setSeeding(false);
    }
  }

  const wagonsBetween = (a, b) =>
    caravans.filter(
      (c) =>
        c.status === 'traveling' &&
        ((c.sender === a && c.receiver === b) || (c.sender === b && c.receiver === a))
    ).length;

  return (
    <Window title="World Status" icon="ui-council" bodyClassName="p-2 space-y-2">
      <div className="flex items-center justify-between bg-face px-1 text-xs">
        <span>Next AI reading:</span>
        <span className="ascii font-bold tabular-nums text-gold">
          {nextScanInMs !== null ? fmtClock(nextScanInMs) : '--:--'}
        </span>
      </div>

      <table className="tbl text-xs">
        <thead>
          <tr>
            <th>Relations</th>
            <th>State</th>
            <th>Road</th>
          </tr>
        </thead>
        <tbody>
          {diplomacy.map((p) => {
            const style = STATE_STYLE[p.state] || STATE_STYLE.neutral;
            const wagons = wagonsBetween(p.faction_a, p.faction_b);
            return (
              <tr key={`${p.faction_a}-${p.faction_b}`} title={p.reason}>
                <td>
                  {p.faction_a} / {p.faction_b}
                </td>
                <td>
                  <span className="badge" style={{ backgroundColor: style.bg, color: style.fg }}>
                    {style.text}
                  </span>
                </td>
                <td className="tabular-nums">{p.state === 'trade' ? `${wagons} wagon(s) en route` : 'closed'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Group label="Council Readings">
        {sentiments.length === 0 ? (
          <p className="text-xs">The council has not spoken yet.</p>
        ) : null}
        <div className="space-y-2">
          {sentiments.map((s) => (
            <div key={s.id} className="bw-thin bg-face p-1">
              <div className="flex items-center justify-between text-xs">
                <b>{s.faction}</b>
                <span className="text-ash">
                  {s.target_faction ? `focus: ${s.target_faction}` : 'no focus'} [{s.source}]
                </span>
              </div>
              {MOODS.map((m) => (
                <div key={m.key} className="flex items-center gap-1 text-xx">
                  <span className="w-20">{m.label}</span>
                  <BlockBar value={s[m.key] || 0} max={10} width={16} color={m.color} track="#141a21" />
                  <span className="tabular-nums w-4 text-right">{s[m.key] || 0}</span>
                </div>
              ))}
              <p className="mt-1 text-xx text-moss italic">{s.summary}</p>
            </div>
          ))}
        </div>
      </Group>

      {aiLog.length > 0 ? (
        <Group label="Council Decrees">
          <div className="sunken max-h-28 overflow-y-auto p-1 font-mono text-xx leading-4">
            {aiLog.slice(0, 12).map((row) => (
              <p key={row.id}>
                <span className="text-slate">[{clockOf(row.created_at)}]</span>{' '}
                <span className="text-cyan">{row.faction}:</span> <span className="text-bone">{row.detail || row.action}</span>
              </p>
            ))}
          </div>
        </Group>
      ) : null}

      <Group label="Try the AI">
        <p className="text-xs">
          Push a mood into {myFaction.id} chat and watch the next council reading react.
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          <Btn className="min-w-0 px-2 py-1 text-xs" onClick={() => seed('war')} disabled={seeding}>
            Whisper war
          </Btn>
          <Btn className="min-w-0 px-2 py-1 text-xs" onClick={() => seed('trade')} disabled={seeding}>
            Suggest trade
          </Btn>
          <Btn className="min-w-0 px-2 py-1 text-xs" onClick={() => seed('fear')} disabled={seeding}>
            Spread fear
          </Btn>
          <Btn className="min-w-0 px-2 py-1 text-xs" onClick={onScanNow}>
            Read council now
          </Btn>
        </div>
      </Group>
    </Window>
  );
}
