import { Window, Group, BlockBar } from './Win95.jsx';
import { PixelIcon, RESOURCE_ICON, factionIcon } from './PixelIcon.jsx';

const LABELS = {
  iron: 'Iron',
  food: 'Food',
  wood: 'Wood',
  tools: 'Tools',
};

const FALLBACK_RATES = { iron: 3, food: 1, wood: 2, tools: 9 };

const STATE_STYLE = {
  war: { text: 'WAR', bg: '#b5505a', fg: '#e3e6de' },
  trade: { text: 'TRADE', bg: '#57c7d0', fg: '#120d14' },
  neutral: { text: 'NEUTRAL', bg: '#211a28', fg: '#a8b0a0' },
};

export default function ResourcesPanel({
  faction,
  resources,
  otherResources = [],
  diplomacy = [],
  factions = [],
  rates = FALLBACK_RATES,
}) {
  if (!resources) return null;

  const keys = Object.keys(LABELS);
  const myValue = keys.reduce((sum, k) => sum + (resources[k] ?? 0) * (rates[k] ?? 1), 0);
  const rivalValue = (r) => keys.reduce((sum, k) => sum + (r[k] ?? 0) * (rates[k] ?? 1), 0);
  const richest = Math.max(myValue, ...otherResources.map(rivalValue), 1);

  const stateOf = (name) => {
    const pair = diplomacy.find((p) => p.faction_a === name || p.faction_b === name);
    return pair?.state || 'neutral';
  };
  const sigilOf = (name) => (factions.find((f) => f.id === name) ? factionIcon(name) : 'ui-shield');

  return (
    <Window title="Stockpile" icon="res-iron" bodyClassName="p-2 space-y-2">
      <table className="tbl text-xs">
        <thead>
          <tr>
            <th>Good</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Worth</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k}>
              <td>
                <span className="inline-flex items-center gap-1">
                  <PixelIcon name={RESOURCE_ICON[k]} size={14} /> {LABELS[k]}
                </span>
              </td>
              <td className="text-right tabular-nums font-bold">{resources[k] ?? 0}</td>
              <td className="text-right tabular-nums text-ash">{rates[k] ?? 1}</td>
              <td className="text-right tabular-nums">{(resources[k] ?? 0) * (rates[k] ?? 1)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="text-right font-bold">
              TOTAL CART VALUE: <span className="tabular-nums text-gold">{myValue}</span>
            </td>
          </tr>
        </tfoot>
      </table>

      <Group label="Rival Holds">
        <table className="tbl text-xs">
          <thead>
            <tr>
              <th>Faction</th>
              <th>Status</th>
              <th>Hoard</th>
              <th>Wealth</th>
            </tr>
          </thead>
          <tbody>
            {otherResources.map((r) => {
              const style = STATE_STYLE[stateOf(r.faction)] || STATE_STYLE.neutral;
              const value = rivalValue(r);
              return (
                <tr key={r.faction}>
                  <td>
                    <span className="inline-flex items-center gap-1">
                      <PixelIcon name={sigilOf(r.faction)} size={14} /> {r.faction}
                    </span>
                  </td>
                  <td>
                    <span className="badge" style={{ backgroundColor: style.bg, color: style.fg }}>
                      {style.text}
                    </span>
                  </td>
                  <td className="ascii tabular-nums">{keys.map((k) => r[k] ?? 0).join('/')}</td>
                  <td>
                    <BlockBar value={value} max={richest} width={10} color="#5696b4" track="#141a21" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-1 text-xx text-ash">Hoard order: iron / food / wood / tools</p>
      </Group>
    </Window>
  );
}
