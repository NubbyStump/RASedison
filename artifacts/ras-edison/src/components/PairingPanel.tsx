import { useEffect, useState } from 'react';
import { AlertCircle, Check, Clipboard, Loader2, LogIn, LogOut, Radio, Shield, Users, XCircle } from 'lucide-react';
import type { PairingSession, PairingStatus } from '../hooks/usePairing';

const GROUPS = [
  { id: 'ladybugs', name: 'Ladybugs', icon: '🐞' },
  { id: 'jellyfish', name: 'Jellyfish', icon: '🪼' },
  { id: 'tigers', name: 'Tigers', icon: '🐯' },
];

type Props = {
  open: boolean;
  mode: 'startup' | 'controls';
  session: PairingSession | null;
  status: PairingStatus;
  error: string;
  busy: boolean;
  today: string;
  needsDailyAssignment: boolean;
  onClose: () => void;
  onOffline: () => Promise<void>;
  onCreate: (name: string, password: string) => Promise<boolean>;
  onJoin: (name: string, code: string, password: string, groupId: string) => Promise<boolean>;
  onUpdateAssignment: (groupId: string | null) => Promise<void>;
  onLeave: () => Promise<void>;
  onEnd: () => Promise<void>;
};

export default function PairingPanel(props: Props) {
  const { open, mode, session, status, error, busy, today, needsDailyAssignment } = props;
  const [path, setPath] = useState<'home' | 'create' | 'join'>('home');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [group, setGroup] = useState('');
  const [assignment, setAssignment] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && mode === 'startup') setPath('home');
  }, [open, mode]);
  useEffect(() => {
    if (open && mode === 'controls' && session) {
      setAssignment(needsDailyAssignment ? '' : (session.groupId || 'coordinator'));
    }
  }, [open, mode, session?.memberId, session?.groupId, needsDailyAssignment]);
  if (!open) return null;

  const groupName = (id: string | null) => GROUPS.find((item) => item.id === id)?.name || 'Program Manager';
  const clearPassword = () => setPassword('');
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim() && password.length >= 4) {
      const ok = await props.onCreate(name.trim(), password);
      if (ok) clearPassword();
    }
  };
  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim() && code.trim() && group && password.length >= 4) {
      const ok = await props.onJoin(name.trim(), code.trim(), password, group);
      if (ok) clearPassword();
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="session-title">
      <div className="w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="p-5 sm:p-7 border-b border-slate-800 bg-gradient-to-br from-emerald-500/10 to-cyan-500/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-emerald-400 text-xs font-black uppercase tracking-widest flex items-center gap-2"><Radio className="w-4 h-4" /> RAS Edison Live</div>
              <h2 id="session-title" className="text-2xl sm:text-3xl font-black text-white mt-1">{mode === 'startup' ? 'Welcome to today’s program' : 'Live session controls'}</h2>
              <p className="text-sm text-slate-400 mt-2">{mode === 'startup' ? 'Choose how you want to use the program dashboard.' : 'Manage your assignment and see who is in this session.'}</p>
            </div>
            {mode === 'controls' && !needsDailyAssignment && <button onClick={props.onClose} aria-label="Close session controls" className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"><XCircle /></button>}
          </div>
        </div>

        <div className="p-5 sm:p-7 space-y-5">
          {error && <div role="alert" className="rounded-2xl border border-red-500/40 bg-red-950/50 text-red-100 p-4 flex gap-3 text-sm"><AlertCircle className="w-5 h-5 shrink-0 text-red-400" />{error}</div>}

          {mode === 'startup' && path === 'home' && (
            <div className="space-y-3">
              {(session || status === 'connecting' || status === 'reconnecting') && (
                <button disabled={!session || busy} onClick={props.onClose} className="w-full text-left rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 hover:bg-emerald-500/15 disabled:opacity-60">
                  <span className="flex items-center gap-2 text-emerald-300 font-black">{status !== 'connected' && <Loader2 className="w-4 h-4 animate-spin" />} Resume Live Session</span>
                  <span className="block text-xs text-slate-400 mt-1">{session ? `Room ${session.code} · ${session.role === 'owner' ? 'Host / Program Manager' : groupName(session.groupId)}` : 'Restoring your authenticated session…'}</span>
                </button>
              )}
              <button onClick={() => setPath('create')} className="w-full text-left rounded-2xl border border-purple-500/30 bg-slate-800 p-4 hover:border-purple-400">
                <span className="flex items-center gap-2 text-white font-black"><Shield className="w-5 h-5 text-purple-400" /> Create Live Session</span>
                <span className="block text-xs text-slate-400 mt-1">Host as Program Manager and share your current dashboard.</span>
              </button>
              <button onClick={() => setPath('join')} className="w-full text-left rounded-2xl border border-cyan-500/30 bg-slate-800 p-4 hover:border-cyan-400">
                <span className="flex items-center gap-2 text-white font-black"><LogIn className="w-5 h-5 text-cyan-400" /> Join Live Session</span>
                <span className="block text-xs text-slate-400 mt-1">Join as a counselor with a room code and password.</span>
              </button>
              <button onClick={props.onOffline} disabled={busy} className="w-full rounded-2xl border border-slate-700 py-3 text-slate-300 font-bold hover:bg-slate-800 disabled:opacity-50">Continue Offline</button>
            </div>
          )}

          {mode === 'startup' && path !== 'home' && (
            <form onSubmit={path === 'create' ? create : join} className="space-y-4">
              <button type="button" onClick={() => { setPath('home'); clearPassword(); }} className="text-sm text-slate-400 hover:text-white">← Back to choices</button>
              <h3 className="text-xl font-black text-white">{path === 'create' ? 'Create as Host / Program Manager' : 'Join as Counselor'}</h3>
              <Field label="Your name"><input required maxLength={60} autoComplete="name" value={name} onChange={e => setName(e.target.value)} className="field" placeholder="Your name" /></Field>
              {path === 'join' && <>
                <Field label="Your group"><select required value={group} onChange={e => setGroup(e.target.value)} className="field"><option value="">Choose today’s group</option>{GROUPS.map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}</select></Field>
                <Field label="Room code"><input required maxLength={10} autoCapitalize="characters" autoComplete="off" value={code} onChange={e => setCode(e.target.value.toUpperCase())} className="field font-mono uppercase tracking-widest" /></Field>
              </>}
              <Field label="Session password / PIN (4–128 characters)"><input required minLength={4} maxLength={128} type="password" autoComplete={path === 'create' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} className="field" /></Field>
              <button disabled={busy || !name.trim() || password.length < 4 || (path === 'join' && (!code.trim() || !group))} className={`w-full py-3 rounded-xl font-black text-slate-950 disabled:opacity-50 ${path === 'create' ? 'bg-purple-400' : 'bg-cyan-400'}`}>{busy ? 'Connecting…' : path === 'create' ? 'Create Live Session' : 'Join Live Session'}</button>
            </form>
          )}

          {mode === 'controls' && session && (
            <div className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-800 border border-slate-700 p-4"><div className="text-xs uppercase font-bold text-slate-400">Room code</div><div className="mt-1 flex items-center gap-3"><strong className="font-mono text-2xl text-purple-300 tracking-wider">{session.code}</strong><button aria-label="Copy room code" onClick={async () => { await navigator.clipboard.writeText(session.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="p-2 bg-slate-700 rounded-lg">{copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Clipboard className="w-4 h-4" />}</button></div></div>
                <div className="rounded-2xl bg-slate-800 border border-slate-700 p-4"><div className="text-xs uppercase font-bold text-slate-400">Connection</div><div className="mt-2 font-bold text-white capitalize">{status}</div><div className="text-xs text-slate-400">{session.role === 'owner' ? 'Host / Program Manager' : 'Counselor'}</div></div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide font-bold text-slate-400">Your assigned group today</label>
                <div className="flex flex-col sm:flex-row gap-2 mt-2">
                  <select value={assignment} onChange={e => setAssignment(e.target.value)} disabled={busy} className="field">
                    <option value="">Choose today’s group</option>
                    {session.role === 'owner' && <option value="coordinator">Program Manager / all groups</option>}
                    {GROUPS.map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
                  </select>
                  <button disabled={busy || !assignment} onClick={() => void props.onUpdateAssignment(assignment === 'coordinator' ? null : assignment)} className="shrink-0 px-4 py-3 rounded-xl bg-emerald-400 text-slate-950 font-black disabled:opacity-50">Save for today</button>
                </div>
                {needsDailyAssignment && <p className="text-amber-300 text-xs mt-2">Your previous assignment is stale. Choose today’s group to continue.</p>}
              </div>
              <div>
                <h3 className="font-black text-white flex items-center gap-2"><Users className="w-5 h-5 text-cyan-400" /> Session roster</h3>
                <div className="mt-2 divide-y divide-slate-700 rounded-2xl border border-slate-700 overflow-hidden">
                  {session.members.map(member => <div key={member.id} className="p-3 bg-slate-800 flex justify-between gap-3 text-sm"><span className="font-bold text-white">{member.name}{member.id === session.memberId ? ' (You)' : ''}</span><span className="text-slate-400 text-right">{member.role === 'owner' ? 'Host' : member.assignmentDate === today ? groupName(member.groupId) : `No group for ${today}`}</span></div>)}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button disabled={busy} onClick={async () => { if (confirm('Leave this live session and restore this device’s offline data?')) await props.onLeave(); }} className="flex-1 py-3 rounded-xl border border-slate-600 font-bold text-slate-200 flex justify-center gap-2"><LogOut className="w-5 h-5" /> Leave Session</button>
                {session.role === 'owner' && <button disabled={busy} onClick={async () => { if (confirm('End this session for everyone? All connected members will be revoked.')) await props.onEnd(); }} className="flex-1 py-3 rounded-xl bg-red-950 border border-red-500/50 font-black text-red-300">End Session for Everyone</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs font-bold text-slate-300 mb-1.5">{label}</span>{children}</label>;
}