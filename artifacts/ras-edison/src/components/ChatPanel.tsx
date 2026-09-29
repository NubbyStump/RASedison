import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, MessageCircle, Radio, Send, WifiOff } from 'lucide-react';
import type { ChatMessage, PairingSession, PairingStatus } from '../hooks/usePairing';

type Props = {
  session: PairingSession | null;
  status: PairingStatus;
  onOpenLobby: () => void;
  onSend: (text: string) => Promise<unknown>;
};

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

function messageTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : timeFormatter.format(date);
}

function roleName(role: ChatMessage['senderRole']) {
  return role === 'owner' ? 'Program Manager' : 'Counselor';
}

export default function ChatPanel({ session, status, onOpenLobby, onSend }: Props) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const previousLastIdRef = useRef<string | null>(null);
  const announcedLastIdRef = useRef<string | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const messages = session?.chatMessages ?? [];
  const lastMessage = messages[messages.length - 1];

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !session) return;
    const roomChanged = roomIdRef.current !== session.roomId;
    if (roomChanged) {
      roomIdRef.current = session.roomId;
      nearBottomRef.current = true;
      previousLastIdRef.current = null;
      announcedLastIdRef.current = lastMessage?.id ?? null;
    }
    const previousId = previousLastIdRef.current;
    const nextId = lastMessage?.id ?? null;
    if (previousId === null || (nextId !== previousId && nearBottomRef.current)) {
      scroller.scrollTop = scroller.scrollHeight;
    }
    previousLastIdRef.current = nextId;
  }, [lastMessage?.id, session?.roomId]);

  useEffect(() => {
    if (!lastMessage || lastMessage.id === announcedLastIdRef.current) return;
    const isFirstMessageSeen = announcedLastIdRef.current === null;
    announcedLastIdRef.current = lastMessage.id;
    if (!isFirstMessageSeen && lastMessage.senderId !== session?.memberId) {
      setAnnouncement(`New message from ${lastMessage.senderName}.`);
    }
  }, [lastMessage?.id, lastMessage?.senderId, lastMessage?.senderName, session?.memberId]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || pending || status !== 'connected' || !session) return;
    setPending(true);
    setError('');
    try {
      await onSend(text);
      setDraft('');
      nearBottomRef.current = true;
    } catch (sendError) {
      setError((sendError as Error).message || 'Message could not be sent. Your draft is still here.');
    } finally {
      setPending(false);
    }
  };

  if (!session) {
    return (
      <section className="ras-chat-panel mx-auto max-w-3xl overflow-hidden rounded-3xl border border-slate-700 bg-slate-800/80 shadow-xl">
        <div className="border-b border-slate-700 bg-gradient-to-br from-cyan-500/10 to-emerald-500/5 p-6">
          <h2 className="flex items-center gap-2 text-2xl font-black text-white">
            <MessageCircle className="h-6 w-6 text-cyan-400" /> Room chat
          </h2>
        </div>
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-slate-900 text-slate-400">
            <WifiOff className="h-7 w-7" />
          </span>
          <h3 className="text-xl font-black text-white">Chat is available in a live session</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
            Create or join a room to talk with your Program Manager and counselors.
          </p>
          <button
            type="button"
            onClick={onOpenLobby}
            className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 font-black text-slate-950 transition hover:bg-cyan-300"
          >
            <Radio className="h-5 w-5" /> Join a live session
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="ras-chat-panel mx-auto flex h-[calc(100vh-11rem)] min-h-[30rem] max-h-[52rem] max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-800/80 shadow-xl sm:h-[calc(100vh-12rem)] supports-[height:100dvh]:h-[calc(100dvh-11rem)] sm:supports-[height:100dvh]:h-[calc(100dvh-12rem)]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-700 bg-gradient-to-br from-cyan-500/10 to-emerald-500/5 px-5 py-4 sm:px-6">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-white">
            <MessageCircle className="h-5 w-5 text-cyan-400" /> Room chat
          </h2>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            Room {session.code} · {session.members.length} {session.members.length === 1 ? 'member' : 'members'}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${
          status === 'connected'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        }`}>
          {status === 'connected' ? 'Live' : 'Reconnecting'}
        </span>
      </div>

      <div
        ref={scrollerRef}
        onScroll={(event) => {
          const node = event.currentTarget;
          nearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 96;
        }}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6"
        aria-label="Room chat history"
      >
        {messages.length === 0 ? (
          <div className="grid min-h-56 place-items-center text-center">
            <div>
              <MessageCircle className="mx-auto h-8 w-8 text-slate-600" />
              <p className="mt-3 font-bold text-slate-300">No messages yet</p>
              <p className="mt-1 text-sm text-slate-500">Start the conversation with your room.</p>
            </div>
          </div>
        ) : messages.map((message) => {
          const own = message.senderId === session.memberId;
          return (
            <article key={message.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[86%] sm:max-w-[75%] ${own ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className="mb-1 flex flex-wrap items-baseline gap-x-2 px-1 text-xs">
                  <strong className={own ? 'text-cyan-300' : 'text-slate-200'}>{own ? 'You' : message.senderName}</strong>
                  <span className="text-slate-500">{roleName(message.senderRole)}</span>
                  <time className="text-slate-500" dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
                </div>
                <p className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm ${
                  own
                    ? 'rounded-br-md bg-cyan-400 text-slate-950'
                    : 'rounded-bl-md border border-slate-700 bg-slate-900 text-slate-100'
                }`}>
                  {message.text}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
      <form onSubmit={send} className="border-t border-slate-700 bg-slate-900/90 p-3 sm:p-4">
        {status !== 'connected' && (
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-300">
            <AlertCircle className="h-4 w-4" /> Reconnecting. Your draft will stay here.
          </p>
        )}
        {error && <p role="alert" className="mb-2 text-sm font-bold text-red-300">{error}</p>}
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="chat-message" className="sr-only">Message the room</label>
            <textarea
              id="chat-message"
              value={draft}
              maxLength={240}
              rows={1}
              disabled={pending}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError('');
              }}
              placeholder="Message the room…"
              className="block min-h-[44px] max-h-32 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-base text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-60"
              aria-describedby="chat-message-count chat-send-status"
            />
            <div id="chat-message-count" className="mt-1 px-1 text-right text-[11px] font-semibold text-slate-500">
              {draft.length}/240
            </div>
          </div>
          <button
            type="submit"
            disabled={!draft.trim() || pending || status !== 'connected'}
            className="mb-5 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-cyan-400 px-4 font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-45"
            aria-label={pending ? 'Sending message' : 'Send message'}
          >
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
        <div id="chat-send-status" className="sr-only" aria-live="polite">
          {pending ? 'Sending message' : error}
        </div>
      </form>
    </section>
  );
}