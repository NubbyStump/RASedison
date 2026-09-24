import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, MessageSquare, Send, X } from 'lucide-react';

type Props = {
  open: boolean;
  connected: boolean;
  onClose: () => void;
  onSend: (text: string) => Promise<unknown>;
};

export default function MessageComposer({ open, connected, onClose, onSend }: Props) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setFeedback(null);
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, pending]);

  if (!open) return null;

  const trimmedDraft = draft.trim();
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmedDraft || pending || !connected) return;
    setPending(true);
    setFeedback(null);
    try {
      await onSend(trimmedDraft);
      setDraft('');
      setFeedback({ kind: 'success', text: 'Message sent to the projector.' });
    } catch (error) {
      setFeedback({
        kind: 'error',
        text: (error as Error).message || 'Message could not be sent. Your draft is still here.',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !pending) onClose();
    }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="projector-message-title"
        aria-describedby="projector-message-description"
        className="w-full max-w-lg max-h-[94vh] rounded-3xl border border-cyan-500/35 bg-slate-900 shadow-2xl overflow-y-auto pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-gradient-to-br from-cyan-500/10 to-emerald-500/5 p-5">
          <div>
            <h2 id="projector-message-title" className="flex items-center gap-2 text-xl font-black text-white">
              <MessageSquare className="w-5 h-5 text-cyan-400" /> Message the projector
            </h2>
            <p id="projector-message-description" className="mt-1 text-sm leading-relaxed text-slate-400">
              Messages stay visible for about 20 seconds. The latest message replaces the previous one.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={pending} aria-label="Close message composer" className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={send} className="p-5 space-y-4">
          <div>
            <label htmlFor="projector-message-text" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-300">
              Projector message
            </label>
            <textarea
              ref={textareaRef}
              id="projector-message-text"
              value={draft}
              disabled={pending}
              maxLength={240}
              rows={4}
              onChange={(event) => {
                setDraft(event.target.value);
                if (feedback) setFeedback(null);
              }}
              placeholder="Write a short message for the room…"
              className="w-full resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
              aria-describedby="projector-message-count projector-message-status"
            />
            <div id="projector-message-count" className="mt-1.5 text-right text-xs font-semibold text-slate-400">
              {240 - draft.length} characters remaining
            </div>
          </div>

          {!connected && (
            <div className="flex gap-2 rounded-xl border border-amber-500/35 bg-amber-950/35 p-3 text-sm text-amber-100">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              Reconnecting to the live session. Sending will be available when the connection returns.
            </div>
          )}

          <div id="projector-message-status" aria-live="polite" aria-atomic="true" className="min-h-5">
            {feedback && (
              <p role={feedback.kind === 'error' ? 'alert' : 'status'} className={`flex items-center gap-2 text-sm font-bold ${feedback.kind === 'success' ? 'text-emerald-300' : 'text-red-300'}`}>
                {feedback.kind === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {feedback.text}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} disabled={pending} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-400 hover:text-white disabled:opacity-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!trimmedDraft || pending || !connected}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-black text-slate-950 shadow-lg transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {pending ? 'Sending…' : 'Send to projector'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}