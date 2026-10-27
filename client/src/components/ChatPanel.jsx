import { useEffect, useRef, useState } from 'react';
import { Window } from './Win95.jsx';

function clockOf(ts) {
  return new Date(ts).toLocaleTimeString([], { hour12: false });
}

export default function ChatPanel({ faction, messages = [], onSend, scanInMs }) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  function submit(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(draft);
    setDraft('');
  }

  return (
    <Window
      title={`${faction.id} Chat`}
      icon="ui-chat"
      className="flex flex-col"
      bodyClassName="flex flex-col p-1 gap-1 min-h-0"
    >
      <div className="flex items-center justify-between bg-face px-1 text-xx">
        <span className="blink font-bold text-gold">&#9670; NEW &#9670;</span>
        <span className="text-ash">This channel is read by the AI council</span>
        <span className="blink font-bold text-gold">&#9670; NEW &#9670;</span>
      </div>

      <div className="sunken h-56 overflow-y-auto p-2 font-mono text-xs leading-5">
        {messages.length === 0 ? (
          <p className="text-ash">
            Quiet in the halls. Say something - the council is listening.
          </p>
        ) : null}
        {messages.map((m) => (
          <p key={m.id} className="break-words">
            <span className="text-slate">[{clockOf(m.created_at)}]</span>{' '}
            <span className="font-bold text-cyan">{m.username}:</span> <span className="text-bone">{m.content}</span>
          </p>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={submit} className="flex items-stretch gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            scanInMs ? `council reads again in ${Math.ceil(scanInMs / 1000)}s` : `message to ${faction.id}...`
          }
          maxLength={300}
          className="field flex-1 text-xs"
        />
        <button type="submit" disabled={!draft.trim()} className="btn btn-default min-w-0 px-3">
          Send
        </button>
      </form>

      <p className="px-1 text-xx text-ash">
        {messages.length} line(s) in view - 300 characters max per message
      </p>
    </Window>
  );
}
