import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { MessageSquare } from 'lucide-react';
import type { ProjectorMessage as ProjectorMessageData } from '../hooks/usePairing';

type Props = {
  roomId: string | null;
  messages: ProjectorMessageData[];
};

type MessageCardProps = {
  message: ProjectorMessageData;
};

function MessageCard({ message }: MessageCardProps) {
  const [firstShownAt] = useState(Date.now);
  const fadeDelay = Math.max(0, Date.parse(message.expiresAt) - firstShownAt - 1_000);
  const style = { '--projector-fade-delay': `${fadeDelay}ms` } as CSSProperties;

  return (
    <aside className="projector-message-card" style={style}>
      <div className="projector-message-sender">
        <MessageSquare className="h-5 w-5" aria-hidden="true" />
        <span>{message.senderName}</span>
        <span className="projector-message-role">{message.senderRole === 'owner' ? 'Program Manager' : 'Counselor'}</span>
      </div>
      <p>{message.text}</p>
    </aside>
  );
}

export default function ProjectorMessage({ roomId, messages }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setNow(Date.now());
  }, [roomId, messages]);

  const latest = useMemo(() => messages
    .filter((message) => {
      const expiresAt = Date.parse(message.expiresAt);
      return Number.isFinite(expiresAt) && expiresAt > now;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null, [messages, now]);

  useEffect(() => {
    if (!latest) return;
    const delay = Math.max(0, Date.parse(latest.expiresAt) - Date.now());
    const timer = window.setTimeout(() => setNow(Date.now()), delay + 10);
    return () => window.clearTimeout(timer);
  }, [latest?.id, latest?.expiresAt]);

  return (
    <div className="projector-message-region" aria-live="polite" aria-atomic="true">
      {latest && (
        <MessageCard key={`${roomId}-${latest.id}`} message={latest} />
      )}
    </div>
  );
}