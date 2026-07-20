import { useEffect, useRef, useState } from 'react';

function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function MessageBubble({ message, currentUserId }) {
  const isAgent = message.sender_type === 'agent';
  const isMine = !isAgent && message.user_id === currentUserId;
  const displayName = isAgent ? 'Agent' : message.user_name || 'Unknown';

  return (
    <div className={`flex gap-2.5 ${isMine ? 'flex-row-reverse' : ''}`}>
      <div
        className={[
          'w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-medium',
          isAgent ? 'bg-accent text-white' : 'bg-border text-text',
        ].join(' ')}
      >
        {isAgent ? '●' : initials(displayName)}
      </div>
      <div className={`flex flex-col gap-0.5 max-w-[80%] ${isMine ? 'items-end' : 'items-start'}`}>
        <span className="text-xs text-text-secondary px-1">{displayName}</span>
        <div
          className={[
            'rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
            isAgent
              ? 'bg-accent/[0.08] text-text border border-accent/20'
              : isMine
              ? 'bg-accent text-white'
              : 'bg-bg border border-border text-text',
          ].join(' ')}
        >
          {message.type === 'file' ? `📎 ${message.content}` : message.content}
        </div>
      </div>
    </div>
  );
}

export default function ConversationPanel({
  messages,
  currentUserId,
  onSend,
  onUploadFile,
  sending,
}) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    const content = draft;
    setDraft('');
    await onSend(content);
  }

  async function handleFilePicked(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await onUploadFile(file);
  }

  return (
    <div className="h-full flex flex-col bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-text">Conversation</h2>
        <p className="text-xs text-text-secondary">Shared with everyone on this project</p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {messages.length === 0 && (
          <p className="text-sm text-text-secondary text-center py-8">
            No messages yet. Describe the job, paste site visit notes, or upload a file to get started.
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} currentUserId={currentUserId} />
        ))}
        {sending && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 shrink-0 rounded-full bg-accent text-white flex items-center justify-center text-xs">
              ●
            </div>
            <div className="rounded-lg px-3 py-2 text-sm text-text-secondary bg-bg border border-border">
              Thinking…
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border p-3 flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Attach a file"
          className="shrink-0 w-9 h-9 rounded-md border border-border text-text-secondary hover:text-text hover:bg-black/[0.03] flex items-center justify-center transition-colors"
        >
          📎
        </button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePicked} />
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="shrink-0 text-sm font-medium px-3 py-2 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-50 text-white transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
