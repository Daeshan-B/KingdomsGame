import { Window, BlockBar } from './Win95.jsx';
import { PixelIcon, JOB_ICON } from './PixelIcon.jsx';

function payoutText(yields) {
  if (!yields) return '';
  return Object.entries(yields)
    .map(([res, amount]) => `+${amount} ${res}`)
    .join(' ');
}

export default function JobsPanel({
  jobs = [],
  resources,
  effects = {},
  timers = {},
  cooldownFor,
  onJob,
}) {
  return (
    <Window title="Daily Work" icon="job-mine" bodyClassName="p-2 space-y-2">
      <p className="text-xs text-ash">
        Click a task. It pays the whole faction&apos;s stockpile, then rests. Markets cut the rest time.
      </p>

      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5">
        {jobs.map((job) => {
          const wait = cooldownFor(job.id);
          const timer = timers[job.id] ?? job.cooldownMs ?? 0;
          const yields = effects[job.id] || job.yields;
          const boosted =
            effects[job.id] &&
            Object.entries(effects[job.id]).some(([k, v]) => v > (job.yields[k] || 0));
          const cost = job.costs ? Object.entries(job.costs)[0] : null;
          const short = cost ? (resources?.[cost[0]] ?? 0) < cost[1] : false;
          const blocked = wait > 0 || short;

          return (
            <button
              key={job.id}
              onClick={() => onJob(job.id)}
              disabled={blocked}
              title={`${job.label} - ${(timer / 1000).toFixed(2)}s rest timer`}
              className="btn h-auto min-w-0 w-full whitespace-normal px-1 py-2 text-center"
            >
              <span className="icon-cell mx-auto">
                <PixelIcon name={JOB_ICON[job.id]} size={18} />
              </span>
              <span className="mt-1 block text-xs font-bold">
                <u>{job.label[0]}</u>
                {job.label.slice(1)}
              </span>
              <span className={`block text-xx ${blocked ? '' : boosted ? 'text-gold font-bold' : 'text-cyan'}`}>
                {payoutText(yields)}
              </span>
              {cost ? (
                <span className={`block text-xx ${blocked ? '' : 'text-blood'}`}>
                  needs {cost[1]} {cost[0]}
                </span>
              ) : null}
              <span className="mt-1 block">
                {wait > 0 ? (
                  <>
                    <BlockBar value={wait} max={timer || 1} width={10} color="#cd6a3f" track="#120d14" />
                    <span className="block text-xx tabular-nums">{(wait / 1000).toFixed(1)}s</span>
                  </>
                ) : (
                  <span className="ascii text-xx text-cyan">[READY]</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </Window>
  );
}
