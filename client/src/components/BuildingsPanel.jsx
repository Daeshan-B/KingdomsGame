import { Window, BlockBar } from './Win95.jsx';
import { PixelIcon, BUILDING_ICON } from './PixelIcon.jsx';

function costText(cost) {
  if (!cost) return '';
  return Object.entries(cost)
    .map(([res, amount]) => `${amount} ${res}`)
    .join(' + ');
}

function Pips({ level, max }) {
  return (
    <span className="ascii text-xs" title={`level ${level} of ${max}`}>
      <span className="text-gold">{'\u2588'.repeat(Math.max(0, level))}</span>
      <span className="text-shade">{'\u2591'.repeat(Math.max(0, max - level))}</span>
    </span>
  );
}

export default function BuildingsPanel({ buildings = [], faction, onBuild, now = Date.now() }) {
  return (
    <Window title="Faction Projects" icon="building-mine" bodyClassName="p-2">
      <p className="text-xs text-ash">
        Projects burn the surplus the stockpile keeps collecting. The whole faction pays up front, so argue
        about priorities in chat.
      </p>

      <table className="tbl mt-2 text-xs">
        <thead>
          <tr>
            <th>Project</th>
            <th>Level</th>
            <th>Next cost</th>
            <th>Status</th>
            <th>&nbsp;</th>
          </tr>
        </thead>
        <tbody>
          {buildings.map((b) => {
            const remaining = b.building && b.completesAt ? Math.max(0, b.completesAt - now) : 0;
            const done = b.totalMs > 0 ? b.totalMs - remaining : 0;
            return (
              <tr key={b.id}>
                <td>
                  <span className="inline-flex items-center gap-1">
                    <PixelIcon name={BUILDING_ICON[b.id]} size={16} />
                    <b>{b.label}</b>
                  </span>
                  <div className="text-xx text-ash">{b.effect}</div>
                </td>
                <td className="whitespace-nowrap">
                  <Pips level={b.level} max={b.maxLevel} />
                  <span className="tabular-nums"> {b.level}/{b.maxLevel}</span>
                </td>
                <td className="tabular-nums">
                  {b.maxed ? <span className="text-ash">--</span> : costText(b.cost)}
                </td>
                <td>
                  {b.building ? (
                    <>
                      <BlockBar value={done} max={b.totalMs} width={12} color="#cd6a3f" track="#120d14" />
                      <span className="block tabular-nums text-ash">
                        {Math.ceil(remaining / 1000)}s left
                        {b.builder ? ` - ${b.builder}` : ''}
                      </span>
                    </>
                  ) : b.maxed ? (
                    <span className="font-bold text-cyan">COMPLETE</span>
                  ) : (
                    <span className="text-ash">
                      {b.affordable ? `takes ${b.seconds}s` : `short of ${costText(b.cost)}`}
                    </span>
                  )}
                </td>
                <td>
                  {b.maxed || b.building ? null : (
                    <button
                      type="button"
                      className="btn min-w-0 px-2 py-1"
                      disabled={!b.affordable}
                      onClick={() => onBuild(b.id)}
                      title={`Raise ${b.label} to level ${b.level + 1}`}
                    >
                      Build
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Window>
  );
}
