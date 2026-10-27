import { useState } from 'react';
import { Window, Group, Btn, Counter, RainbowRule } from './Win95.jsx';
import { PixelIcon, factionIcon } from './PixelIcon.jsx';

export default function JoinScreen({ factions = [], onJoin, status, error }) {
  const [username, setUsername] = useState('');
  const [faction, setFaction] = useState(null);
  const busy = status === 'loading';

  function submit(e) {
    e.preventDefault();
    if (!username.trim() || !faction) return;
    onJoin(username.trim(), faction);
  }

  return (
    <div className="min-h-screen flex items-start justify-center p-4 pt-8">
      <div className="w-full max-w-[640px]">
        <Window title="Kingdoms - Enter the World" icon="ui-castle" bodyClassName="p-3 space-y-3">
          <div className="sunken p-3 text-center">
            <h1 className="text-hero font-bold tracking-wide text-gold">KINGDOMS</h1>
            <p className="mt-1 text-sm text-bone">
              Three factions. One world. An AI council that reads your chat and decides who to trade with and
              who to fight.
            </p>
            <p className="mt-2 text-xx text-ash">
              no character movement - menu driven - persistent multiplayer
            </p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <Group label="Choose a faction">
              <table className="tbl text-xs">
                <thead>
                  <tr>
                    <th>&nbsp;</th>
                    <th>Faction</th>
                    <th>Motto</th>
                    <th>Sigil</th>
                  </tr>
                </thead>
                <tbody>
                  {factions.map((f) => (
                    <tr key={f.id} onClick={() => setFaction(f.id)}>
                      <td className="w-5 text-center">
                        <input
                          type="radio"
                          name="faction"
                          value={f.id}
                          checked={faction === f.id}
                          onChange={() => setFaction(f.id)}
                        />
                      </td>
                      <td className="font-bold">{f.id}</td>
                      <td className="italic text-moss">{f.motto}</td>
                      <td>
                        <span className="icon-cell">
                          <PixelIcon name={factionIcon(f.id)} size={18} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Group>

            <Group label="Player name">
              <div className="flex items-center gap-2">
                <label htmlFor="username" className="text-xs">
                  Name:
                </label>
                <input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. Warden"
                  maxLength={24}
                  size={24}
                  className="field flex-1 text-xs"
                />
              </div>
              <p className="mt-1 text-xx text-ash">
                No password yet. Your name and faction are remembered in this browser. Open more tabs to join
                as more players.
              </p>
            </Group>

            {error ? (
              <div className="bs flex items-start gap-2 bg-blood p-2 text-xs text-bone">
                <span className="icon-cell h-5 w-5 bg-face font-bold text-gold">!</span>
                <span className="font-bold">{error}</span>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Btn type="submit" primary disabled={busy || !username.trim() || !faction}>
                {busy ? 'Entering...' : 'OK'}
              </Btn>
              <Btn onClick={() => { setUsername(''); setFaction(null); }}>Cancel</Btn>
            </div>
          </form>

          <RainbowRule />

          <div className="flex items-center justify-between gap-2 text-xx text-ash">
            <span>Visitors since launch:</span>
            <Counter value={factions.length * 1337 + 7} />
            <span>Best played at 800x600</span>
          </div>
          <div className="hazard" />
        </Window>
      </div>
    </div>
  );
}
