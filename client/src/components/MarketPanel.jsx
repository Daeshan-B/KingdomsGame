import { useState } from 'react';
import { Window, Group, BlockBar, Btn } from './Win95.jsx';
import { PixelIcon, RESOURCE_ICON } from './PixelIcon.jsx';

const GOODS = {
  iron: { name: 'Iron' },
  food: { name: 'Food' },
  wood: { name: 'Wood' },
  tools: { name: 'Tools' },
};
const GOODS_KEYS = Object.keys(GOODS);
const FALLBACK_RATES = { iron: 3, food: 1, wood: 2, tools: 9 };

function goodsLine(resource, amount) {
  const meta = GOODS[resource];
  return `${amount} ${meta ? meta.name.toLowerCase() : resource}`;
}

function fmtCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total >= 3600) return `${Math.floor(total / 3600)}h${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}m`;
  if (total >= 60) return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, '0')}s`;
  return `${total}s`;
}

function riskColor(risk) {
  if (risk >= 0.2) return { bg: '#b5505a', fg: '#e3e6de' };
  if (risk >= 0.1) return { bg: '#cd6a3f', fg: '#120d14' };
  return { bg: '#57c7d0', fg: '#120d14' };
}

// ---------------------------------------------------------------------------
// One partner: deal, road danger, and the manifest form.
// ---------------------------------------------------------------------------
function PartnerForm({ partner, market, myFaction, onSend }) {
  const [cargo, setCargo] = useState(partner.suggestions?.[0]?.cargo || 'food');
  const [amount, setAmount] = useState(12);
  const [ask, setAsk] = useState('auto');
  const [busy, setBusy] = useState(false);

  const rates = market.rates || FALLBACK_RATES;
  const have = market.resources[cargo] ?? 0;
  const value = Math.round((rates[cargo] || 1) * Number(amount || 0));
  const askRate = ask === 'auto' ? null : rates[ask];
  const askNeed = askRate ? Math.floor(value / askRate) : null;
  const askHave = askRate ? partner.stock[ask] ?? 0 : null;

  const tooSmall = value < market.minValue;
  const tooBig = value > market.maxValue;
  const badAmount = !Number.isFinite(Number(amount)) || Number(amount) < 1 || Number(amount) > have;
  const cannotPay = askNeed !== null && askHave < askNeed;
  const blocked = busy || !partner.canSend || badAmount || tooSmall || tooBig || cannotPay;

  async function submit() {
    setBusy(true);
    try {
      await onSend(partner.faction, cargo, Number(amount), ask);
    } finally {
      setBusy(false);
    }
  }

  function prefill(s) {
    setCargo(s.cargo);
    setAmount(s.cargoAmount);
    setAsk(s.ask);
  }

  if (!partner.dealActive) {
    return (
      <Group label={partner.faction}>
        <p className="text-xs">
          {partner.state === 'war'
            ? 'AT WAR - the road is shut and wagons are fair game.'
            : `NO DEAL - the council signs one when ${myFaction.id} chat turns friendly toward ${partner.faction}.`}
        </p>
        <p className="mt-1 text-xx text-ash">
          Rival hoard: {GOODS_KEYS.map((k) => partner.stock[k] ?? 0).join(' / ')} (iron/food/wood/tools)
        </p>
      </Group>
    );
  }

  const road = riskColor(partner.roadRisk);

  return (
    <Group label={`${partner.faction} - road open`}>
      <table className="tbl text-xs">
        <tbody>
          <tr>
            <td>Deal ends</td>
            <td className="tabular-nums font-bold">{fmtCountdown(partner.remainingMs)}</td>
            <td>Road risk</td>
            <td>
              <span className="badge" style={{ backgroundColor: road.bg, color: road.fg }}>
                {Math.round(partner.roadRisk * 100)}%
              </span>
              <span className="ml-1 text-xx">{partner.roadLabel}</span>
            </td>
          </tr>
          <tr>
            <td>Ledger</td>
            <td className="tabular-nums">
              {partner.delivered} ok / {partner.raided} lost
            </td>
            <td>Traded</td>
            <td className="tabular-nums font-bold">{partner.volume} value</td>
          </tr>
          <tr>
            <td>On road</td>
            <td className="tabular-nums">{partner.travelingOut} out</td>
            <td>Inbound</td>
            <td className="tabular-nums">{partner.travelingIn} in</td>
          </tr>
        </tbody>
      </table>

      {partner.suggestions.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {partner.suggestions.map((s) => (
            <Btn key={`${s.cargo}-${s.ask}`} className="min-w-0 px-2 py-1 text-xx" onClick={() => prefill(s)}>
              sell {goodsLine(s.cargo, s.cargoAmount)} for {goodsLine(s.ask, s.askAmount)}
            </Btn>
          ))}
        </div>
      ) : null}

      <table className="mt-2 text-xs">
        <tbody>
          <tr>
            <td className="whitespace-nowrap pr-2">
              <label htmlFor={`cargo-${partner.faction}`}>Load</label>
            </td>
            <td className="pr-2">
              <select
                id={`cargo-${partner.faction}`}
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
                className="field w-full text-xs"
              >
                {GOODS_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {GOODS[k].name} [{rates[k]}] - have {market.resources[k] ?? 0}
                  </option>
                ))}
              </select>
            </td>
            <td className="whitespace-nowrap pr-2">
              <label htmlFor={`units-${partner.faction}`}>Units</label>
            </td>
            <td className="pr-2">
              <input
                id={`units-${partner.faction}`}
                type="number"
                min={1}
                max={Math.max(1, have)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                size={5}
                className="field w-16 text-right tabular-nums text-xs"
              />
            </td>
          </tr>
          <tr>
            <td className="whitespace-nowrap pr-2 pt-1">
              <label htmlFor={`ask-${partner.faction}`}>Ask for</label>
            </td>
            <td className="pr-2 pt-1">
              <select
                id={`ask-${partner.faction}`}
                value={ask}
                onChange={(e) => setAsk(e.target.value)}
                className="field w-full text-xs"
              >
                <option value="auto">AUTO - what we lack</option>
                {GOODS_KEYS.filter((k) => k !== cargo).map((k) => (
                  <option key={k} value={k}>
                    {GOODS[k].name} [{rates[k]}] - they hold {partner.stock[k] ?? 0}
                  </option>
                ))}
              </select>
            </td>
            <td className="whitespace-nowrap pr-2 pt-1">Cargo worth</td>
            <td className="pt-1 tabular-nums font-bold">{value}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xx">
          {askNeed === null ? (
            <span>payment picked for you from whatever {partner.faction} can spare</span>
          ) : cannotPay ? (
            <span className="font-bold text-blood">
              they hold {askHave} {ask} - wagon needs {askNeed}
            </span>
          ) : (
            <span>
              lands as <b className="tabular-nums">{askNeed} {ask}</b> in{' '}
              <span className="tabular-nums">{Math.round((market.travelMs || 0) / 1000)}s</span>
            </span>
          )}
          {tooSmall ? <span className="ml-1 font-bold text-blood">min {market.minValue} value</span> : null}
          {tooBig ? <span className="ml-1 font-bold text-blood">max {market.maxValue} per wagon</span> : null}
        </p>
        <Btn primary onClick={submit} disabled={blocked} className="min-w-0 px-3 py-1 text-xs">
          {busy ? 'Loading...' : 'Send wagon'}
        </Btn>
      </div>
    </Group>
  );
}

// ---------------------------------------------------------------------------
// A single wagon, drawn like a line out of a log file.
// ---------------------------------------------------------------------------
function WagonLine({ wagon, now }) {
  const incoming = !wagon.mine;
  const partner = incoming ? wagon.sender : wagon.receiver;
  const traveling = wagon.status === 'traveling';
  const remaining = traveling ? Math.max(0, wagon.arrivesAt - now) : 0;
  const done = traveling ? Math.max(0, wagon.totalMs - remaining) : wagon.totalMs;
  const tone =
    wagon.status === 'raided'
      ? { bg: '#b5505a', fg: '#e3e6de' }
      : wagon.status === 'delivered'
        ? { bg: '#57c7d0', fg: '#120d14' }
        : { bg: '#211a28', fg: '#a8b0a0' };

  return (
    <li className="bw-thin bg-face p-1">
      <div className="flex items-center gap-1 text-xx">
        <b className="ascii w-16">{incoming ? '<== IN' : '==> OUT'}</b>
        <span className="w-24 truncate font-bold">{partner}</span>
        <span className="flex-1 truncate">
          {goodsLine(wagon.cargoResource, wagon.cargoAmount)} for{' '}
          {goodsLine(wagon.askResource, wagon.askAmount)}
        </span>
        {traveling ? (
          <span className="ascii tabular-nums text-gold">{fmtCountdown(remaining)}</span>
        ) : (
          <span className="badge" style={{ backgroundColor: tone.bg, color: tone.fg }}>
            {wagon.status.toUpperCase()}
          </span>
        )}
      </div>
      {traveling ? (
        <BlockBar value={done} max={wagon.totalMs || 1} width={44} color="#508da0" track="#2e222f" />
      ) : null}
      {!traveling && wagon.note ? (
        <p className={`text-xx ${wagon.status === 'raided' ? 'font-bold text-blood' : 'text-cyan'}`}>
          {wagon.note}
        </p>
      ) : null}
      {wagon.initiator ? <p className="text-xx text-ash">by {wagon.initiator}</p> : null}
    </li>
  );
}

export default function MarketPanel({ market, caravans = [], faction, onSend, now = Date.now() }) {
  if (!market) return null;

  const rates = market.rates || FALLBACK_RATES;
  const onRoad = caravans.filter((c) => c.status === 'traveling');
  const recent = caravans.filter((c) => c.status !== 'traveling').slice(0, 6);

  return (
    <Window title="Caravan Routes" icon="ui-wagon" bodyClassName="p-2 space-y-2">
      <div className="flex items-center justify-between gap-2 bg-face px-1 text-xx">
        <span className="ascii">
          {Object.entries(rates).map(([k, v]) => `${k.toUpperCase()}=${v}`).join(' ')}
        </span>
        <span className="font-bold tabular-nums">
          [ {market.inFlight} / {market.maxInFlight} ON ROAD ]
        </span>
      </div>

      {market.partners.map((partner) => (
        <PartnerForm
          key={partner.faction}
          partner={partner}
          market={market}
          myFaction={faction}
          onSend={onSend}
        />
      ))}

      {onRoad.length > 0 ? (
        <Group label="On the road">
          <ul className="space-y-1">
            {onRoad.map((wagon) => (
              <WagonLine key={wagon.id} wagon={wagon} now={now} />
            ))}
          </ul>
        </Group>
      ) : null}

      {recent.length > 0 ? (
        <Group label="Last trips">
          <ul className="space-y-1">
            {recent.map((wagon) => (
              <WagonLine key={wagon.id} wagon={wagon} now={now} />
            ))}
          </ul>
        </Group>
      ) : null}

      <p className="text-xx">
        Prices are identical in both directions, so a wagon only ever converts surplus into shortage - trade
        cannot invent goods. Cargo is escrowed when the wagon rolls; if either partner goes to war the road
        closes and wagons in transit are lost.
      </p>
    </Window>
  );
}
