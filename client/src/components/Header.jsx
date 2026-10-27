import { Marquee } from './Win95.jsx';
import { PixelIcon, factionIcon } from './PixelIcon.jsx';

// A thin app bar: sigil, world name, a couple of neutral tabs, live user count.
const TABS = [
  { label: 'World', key: 'W' },
  { label: 'Faction', key: 'F' },
  { label: 'Help', key: 'H' },
];

export default function Header({ faction, presence, onLeave, flash }) {
  const online = (presence || []).reduce((sum, p) => sum + (p.players?.length || 0), 0);

  return (
    <header className="bw-thin">
      <div className="titlebar text-md">
        <span className="icon-cell h-4 w-4">
          {faction ? <PixelIcon name={factionIcon(faction.id)} size={14} /> : <PixelIcon name="ui-council" size={14} />}
        </span>
        <span className="flex-1 truncate">
          KINGDOMS - {faction ? `${faction.id} Hold` : 'Not Connected'}
        </span>
        <button type="button" className="tbtn" onClick={onLeave} title="Leave the world">
          ×
        </button>
      </div>

      <nav className="menubar bs-thin flex items-center border-b border-shade">
        {TABS.map((t) => (
          <span key={t.label} className="menubar-item text-xs">
            <u>{t.key}</u>
            {t.label.slice(1)}
          </span>
        ))}
        <span className="ml-auto px-2 text-xs tabular-nums">{online} explorer(s) online</span>
      </nav>

      {flash ? (
        <div className="flex items-center gap-2 border-b border-shade bg-gold px-2 py-1 text-xs font-bold text-wdark">
          <span className="blink">&#9670;</span>
          <Marquee className="flex-1">{flash}</Marquee>
          <span className="blink">&#9670;</span>
        </div>
      ) : null}
    </header>
  );
}
