import { useEffect, useState, useRef } from 'react';
import { AlertCircle, Check, Clipboard, Loader2, LogIn, LogOut, QrCode, Radio, Shield, Trash2, Users, XCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { PairingSession, PairingStatus } from '../hooks/usePairing';

const GROUPS = [
  { id: 'ladybugs', name: 'Ladybugs', icon: '🐞' },
  { id: 'jellyfish', name: 'Jellyfish', icon: '🪼' },
  { id: 'tigers', name: 'Tigers', icon: '🐯' },
];

const parseJoinInput = (input: string) => {
  const value = input.trim();
  if (!value) return { code: '', fromInviteLink: false };

  try {
    const inviteUrl = new URL(value, window.location.href);
    const inviteCode = inviteUrl.searchParams.get('join')?.trim().toUpperCase() ?? '';
    if (/^[A-Z0-9]{1,10}$/.test(inviteCode)) {
      return { code: inviteCode, fromInviteLink: true };
    }
  } catch {}

  const code = value.toUpperCase();
  return {
    code: /^[A-Z0-9]{1,10}$/.test(code) ? code : '',
    fromInviteLink: false,
  };
};

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
  onCreate: (name: string, password: string, programManagerPassword: string) => Promise<boolean>;
  onJoin: (name: string, code: string, password: string, groupId: string | null) => Promise<boolean>;
  onUpdateAssignment: (groupId: string | null, memberId?: string) => Promise<void>;
  onRemoveMember: (memberId: string) => Promise<void>;
  onLeave: () => Promise<void>;
  onEnd: () => Promise<void>;
};

export default function PairingPanel(props: Props) {
  const { open, mode, session, status, error, busy, today, needsDailyAssignment } = props;
  const [path, setPath] = useState<'home' | 'create' | 'join'>('home');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [programManagerPassword, setProgramManagerPassword] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [joinInputError, setJoinInputError] = useState('');
  const [group, setGroup] = useState('unassigned');
  const [assignment, setAssignment] = useState('');
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteCopyError, setInviteCopyError] = useState(false);
  const [showInviteQr, setShowInviteQr] = useState(false);
  const [joiningFromInvite, setJoiningFromInvite] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [memberAssignmentEdits, setMemberAssignmentEdits] = useState<Record<string, string>>({});
  const [memberAssignmentErrors, setMemberAssignmentErrors] = useState<Record<string, string>>({});
  const [savingAssignmentMemberId, setSavingAssignmentMemberId] = useState<string | null>(null);
  const [assignmentSaveError, setAssignmentSaveError] = useState('');
  const inviteLinkRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || mode !== 'startup') return;
    const invite = parseJoinInput(window.location.href);
    if (status === 'local' && !session && invite.fromInviteLink && invite.code) {
      setPath('join');
      setJoinInput(window.location.href);
      setJoinInputError('');
      setJoiningFromInvite(true);
    } else {
      setPath('home');
      setJoiningFromInvite(false);
    }
  }, [open, mode, session, status]);
  useEffect(() => {
    if (open && mode === 'controls' && session) {
      setAssignment(needsDailyAssignment ? '' : (
        session.role === 'owner'
          ? (session.groupId || 'coordinator')
          : (session.groupId || 'unassigned')
      ));
    }
  }, [open, mode, session?.memberId, session?.groupId, needsDailyAssignment]);
  if (!open) return null;

  const groupName = (id: string | null) => GROUPS.find((item) => item.id === id)?.name || 'Program Manager';
  const clearPassword = () => {
    setPassword('');
    setProgramManagerPassword('');
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim() && password.length >= 4 && programManagerPassword) {
      const ok = await props.onCreate(name.trim(), password, programManagerPassword);
      if (ok) clearPassword();
    }
  };
  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedInput = parseJoinInput(joinInput);
    if (!parsedInput.code) {
      setJoinInputError('Enter a room code or paste the full invite link from the host.');
      return;
    }
    setJoinInputError('');
    if (name.trim() && group && password.length >= 4) {
      const ok = await props.onJoin(name.trim(), parsedInput.code, password, group === 'unassigned' ? null : group);
      if (ok) {
        clearPassword();
        setJoiningFromInvite(false);
        setJoinInput('');
        const url = new URL(window.location.href);
        if (url.searchParams.has('join')) {
          url.searchParams.delete('join');
          window.history.replaceState(window.history.state, '', url.toString());
        }
      }
    }
  };

  const inviteUrl = session
    ? (() => {
        const url = new URL(window.location.href);
        url.searchParams.set('join', session.code);
        return url.toString();
      })()
    : '';

  const handleCopyInviteLink = async () => {
    if (!session) return;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(inviteUrl);
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 1500);
        return;
      } catch {}
    }
    setInviteCopyError(true);
    inviteLinkRef.current?.focus();
    inviteLinkRef.current?.select();
    setTimeout(() => setInviteCopyError(false), 4000);
  };

  const saveMemberAssignment = async (event: React.FormEvent<HTMLFormElement>, memberId: string) => {
    event.preventDefault();
    const target = session?.members.find((member) => member.id === memberId);
    if (!session || session.role !== 'owner' || !target || target.role !== 'counselor') return;
    const selectedGroup = memberAssignmentEdits[memberId] ?? (
      target.assignmentDate === today && target.groupId ? target.groupId : 'unassigned'
    );
    setMemberAssignmentErrors((current) => ({ ...current, [memberId]: '' }));
    setSavingAssignmentMemberId(memberId);
    try {
      await props.onUpdateAssignment(selectedGroup === 'unassigned' ? null : selectedGroup, memberId);
      setMemberAssignmentEdits((current) => {
        const next = { ...current };
        delete next[memberId];
        return next;
      });
    } catch (assignmentError) {
      setMemberAssignmentErrors((current) => ({
        ...current,
        [memberId]: (assignmentError as Error).message || 'Unable to update this counselor’s group.',
      }));
    } finally {
      setSavingAssignmentMemberId(null);
    }
  };
  const saveOwnAssignment = async () => {
    setAssignmentSaveError('');
    try {
      await props.onUpdateAssignment(
        assignment === 'coordinator' || assignment === 'unassigned' ? null : assignment,
      );
    } catch (assignmentError) {
      setAssignmentSaveError((assignmentError as Error).message || 'Unable to update your group.');
    }
  };

  return (
    <div className={`ras-pairing-overlay fixed inset-0 z-[80] backdrop-blur-md flex items-center justify-center p-3 sm:p-6 ${mode === 'startup' ? 'ras-pairing-startup' : 'ras-pairing-controls'}`} role="dialog" aria-modal="true" aria-labelledby="session-title">
      <div className="w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl pb-[env(safe-area-inset-bottom)]">
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
              {!session && (status === 'connecting' || status === 'reconnecting') ? (
                <div className="w-full rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5" role="status">
                  <span className="flex items-center gap-2 text-emerald-300 font-black"><Loader2 className="w-4 h-4 animate-spin" /> Restoring live session…</span>
                  <span className="block text-xs text-slate-400 mt-1">You’ll enter the shared dashboard automatically. No name or password is needed.</span>
                </div>
              ) : <>
              <button onClick={() => setPath('create')} className="w-full text-left rounded-2xl border border-purple-500/30 bg-slate-800 p-4 hover:border-purple-400">
                <span className="flex items-center gap-2 text-white font-black"><Shield className="w-5 h-5 text-purple-400" /> Create Live Session</span>
                <span className="block text-xs text-slate-400 mt-1">Host as Program Manager. Start with zero points and no past stats; keep your scramble library.</span>
              </button>
              <button onClick={() => setPath('join')} className="w-full text-left rounded-2xl border border-cyan-500/30 bg-slate-800 p-4 hover:border-cyan-400">
                <span className="flex items-center gap-2 text-white font-black"><LogIn className="w-5 h-5 text-cyan-400" /> Join Live Session</span>
                <span className="block text-xs text-slate-400 mt-1">Open or paste an invite link, or enter a room code and session password.</span>
              </button>
              <button onClick={props.onOffline} disabled={busy} className="w-full rounded-2xl border border-slate-700 py-3 text-slate-300 font-bold hover:bg-slate-800 disabled:opacity-50">Continue Offline</button>
              </>}
            </div>
          )}

          {mode === 'startup' && path !== 'home' && (
            <form onSubmit={path === 'create' ? create : join} className="space-y-4">
              <button type="button" onClick={() => { setPath('home'); clearPassword(); }} className="text-sm text-slate-400 hover:text-white">← Back to choices</button>
              <h3 className="text-xl font-black text-white">{path === 'create' ? 'Create as Host / Program Manager' : 'Join as Counselor'}</h3>
              <Field label="Your name"><input required maxLength={60} autoComplete="name" autoCapitalize="words" value={name} onChange={e => setName(e.target.value)} className="field" placeholder="Your name" /></Field>
              {path === 'join' && <>
                <Field label="Your group today">
                  <select required value={group} onChange={e => setGroup(e.target.value)} className="field">
                    <option value="">Choose a group or view-only</option>
                    <option value="unassigned">Unassigned — view only</option>
                    {GROUPS.map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
                  </select>
                </Field>
                {group === 'unassigned' && (
                  <p className="text-xs text-slate-400 -mt-2">
                    You can choose a group later in session controls. Until then, you can view the dashboard and chat but can’t make changes or send messages.
                  </p>
                )}
                {joiningFromInvite ? (
                  <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-3 text-sm text-cyan-100">
                    This invite link selected the room. Enter your name, assignment, and session password to join.
                    <button type="button" onClick={() => { setJoiningFromInvite(false); setJoinInput(''); setJoinInputError(''); }} className="block mt-2 text-xs font-bold text-cyan-300 underline underline-offset-2">Use a different invite link or room code</button>
                  </div>
                ) : (
                  <Field label="Invite link or room code">
                    <input
                      required
                      maxLength={2048}
                      autoCapitalize="none"
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck="false"
                      value={joinInput}
                      onChange={event => {
                        const value = event.target.value;
                        setJoinInput(value);
                        setJoinInputError('');
                        setJoiningFromInvite(parseJoinInput(value).fromInviteLink);
                      }}
                      className="field"
                      placeholder="Paste the host’s invite link or enter a room code"
                    />
                  </Field>
                )}
                {joinInputError && <p role="alert" className="text-sm font-bold text-rose-300">{joinInputError}</p>}
              </>}
              {path === 'create' && (
                <Field label="Program Manager access password">
                  <input
                    required
                    maxLength={128}
                    type="password"
                    autoComplete="off"
                    value={programManagerPassword}
                    onChange={event => setProgramManagerPassword(event.target.value)}
                    className="field"
                  />
                </Field>
              )}
              <Field label="Session password / PIN (4–128 characters)"><input required minLength={4} maxLength={128} type="password" autoComplete={path === 'create' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} className="field" /></Field>
              <button disabled={busy || !name.trim() || password.length < 4 || (path === 'create' && !programManagerPassword) || (path === 'join' && (!joinInput.trim() || !group))} className={`w-full py-3 rounded-xl font-black text-slate-950 disabled:opacity-50 ${path === 'create' ? 'bg-purple-400' : 'bg-cyan-400'}`}>{busy ? 'Connecting…' : path === 'create' ? 'Create Live Session' : 'Join Live Session'}</button>
            </form>
          )}

          {mode === 'controls' && session && (
            <div className="space-y-5">
              {session.role === 'owner' && (
                <section className="rounded-2xl bg-slate-800 border border-slate-700 p-4">
                  <h3 className="text-xs uppercase font-bold tracking-wide text-slate-300">Invite counselors</h3>
                  <p className="mt-1 text-xs text-slate-400">Share this link or QR code. Counselors won’t need to type the room code; they’ll still need the session password.</p>
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <input
                      ref={inviteLinkRef}
                      aria-label="Counselor invite link"
                      readOnly
                      value={inviteUrl}
                      onFocus={event => event.currentTarget.select()}
                      className="field min-w-0 flex-1 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleCopyInviteLink}
                      className="shrink-0 px-4 py-2.5 rounded-xl bg-cyan-400 text-slate-950 font-black flex items-center justify-center gap-2"
                    >
                      {inviteCopied ? <Check className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
                      {inviteCopied ? 'Copied' : 'Copy invite link'}
                    </button>
                  </div>
                  {inviteCopyError && <div role="status" className="mt-2 text-xs text-amber-300 font-medium bg-amber-950/40 border border-amber-500/30 px-2 py-1.5 rounded-md">Clipboard unavailable. The invite link is selected for manual copying.</div>}
                  <button
                    type="button"
                    onClick={() => setShowInviteQr(value => !value)}
                    aria-expanded={showInviteQr}
                    aria-controls="counselor-invite-qr"
                    className="mt-3 px-3 py-2 rounded-xl border border-slate-600 text-slate-200 font-bold text-sm flex items-center gap-2 hover:bg-slate-700"
                  >
                    <QrCode className="w-4 h-4" /> {showInviteQr ? 'Hide QR code' : 'Show QR code'}
                  </button>
                  {showInviteQr && (
                    <div id="counselor-invite-qr" role="img" aria-label="QR code for counselor invite link" className="mt-4 flex justify-center rounded-xl bg-white p-4">
                      <QRCodeSVG value={inviteUrl} size={220} level="M" aria-hidden="true" />
                    </div>
                  )}
                </section>
              )}
              <div className="rounded-2xl bg-slate-800 border border-slate-700 p-4"><div className="text-xs uppercase font-bold text-slate-400">Connection</div><div className="mt-2 font-bold text-white capitalize">{status}</div><div className="text-xs text-slate-400">{session.role === 'owner' ? 'Host / Program Manager' : 'Counselor'}</div></div>
              <div>
                <label className="text-xs uppercase tracking-wide font-bold text-slate-400">Your assigned group today</label>
                <div className="flex flex-col sm:flex-row gap-2 mt-2">
                  <select value={assignment} onChange={e => setAssignment(e.target.value)} disabled={busy} className="field">
                    <option value="">Choose today’s group</option>
                    {session.role === 'counselor' && <option value="unassigned">Unassigned — view only</option>}
                    {session.role === 'owner' && <option value="coordinator">Program Manager / all groups</option>}
                    {GROUPS.map(g => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
                  </select>
                  <button disabled={busy || !assignment} onClick={() => void saveOwnAssignment()} className="shrink-0 px-4 py-3 rounded-xl bg-emerald-400 text-slate-950 font-black disabled:opacity-50">Save for today</button>
                </div>
                {assignmentSaveError && <p role="alert" className="text-red-300 text-xs mt-2">{assignmentSaveError}</p>}
                {needsDailyAssignment && <p className="text-amber-300 text-xs mt-2">Your previous assignment is stale. Choose today’s group or remain unassigned in view-only mode.</p>}
              </div>
              <div>
                <h3 className="font-black text-white flex items-center gap-2"><Users className="w-5 h-5 text-cyan-400" /> Session roster</h3>
                {session.role === 'owner' && <p className="mt-1 text-xs text-slate-400">Change any counselor’s group assignment for today. Leaving them unassigned keeps their session view-only.</p>}
                <div className="mt-2 divide-y divide-slate-700 rounded-2xl border border-slate-700 overflow-hidden">
                  {session.members.map(member => {
                    const canReassign = session.role === 'owner' && member.role === 'counselor';
                    const canRemove = session.role === 'owner' && member.role === 'counselor' && member.id !== session.memberId;
                    const removing = removingMemberId === member.id;
                    const memberGroup = memberAssignmentEdits[member.id] ?? (
                      member.assignmentDate === today && member.groupId ? member.groupId : 'unassigned'
                    );
                    const savingAssignment = savingAssignmentMemberId === member.id;
                    return <div key={member.id} className="p-3 bg-slate-800 space-y-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="font-bold text-white">{member.name}{member.id === session.memberId ? ' (You)' : ''}</span>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <span className="text-slate-400 text-right">{member.role === 'owner' ? 'Program Manager' : member.assignmentDate === today ? (member.groupId ? groupName(member.groupId) : 'Unassigned · view only') : `No group for ${today}`}</span>
                        {canRemove && <button
                          type="button"
                          disabled={busy || Boolean(removingMemberId)}
                          onClick={async () => {
                            if (!confirm(`Remove ${member.name} from this session? They will be signed out on their device.`)) return;
                            setRemovingMemberId(member.id);
                            try {
                              await props.onRemoveMember(member.id);
                            } finally {
                              setRemovingMemberId(null);
                            }
                          }}
                          className="p-2 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-950 disabled:opacity-50"
                          aria-label={`Remove ${member.name} from session`}
                        >{removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}</button>}
                        </div>
                      </div>
                      {canReassign && (
                        <form onSubmit={(event) => void saveMemberAssignment(event, member.id)} className="rounded-xl border border-cyan-500/25 bg-slate-900/70 p-3">
                          <label className="block text-xs font-bold text-slate-300">
                            Counselor group
                            <select
                              aria-label={`Group assignment for ${member.name}`}
                              value={memberGroup}
                              disabled={busy || savingAssignment}
                              onChange={(event) => setMemberAssignmentEdits((current) => ({
                                ...current,
                                [member.id]: event.target.value,
                              }))}
                              className="field mt-1.5"
                            >
                              <option value="unassigned">Unassigned — view only</option>
                              {GROUPS.map((item) => (
                                <option key={item.id} value={item.id}>{item.icon} {item.name}</option>
                              ))}
                            </select>
                          </label>
                          {memberAssignmentErrors[member.id] && <p role="alert" className="mt-2 text-xs font-bold text-red-300">{memberAssignmentErrors[member.id]}</p>}
                          <button
                            type="submit"
                            disabled={busy || savingAssignment}
                            className="mt-3 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50"
                          >{savingAssignment ? 'Saving…' : 'Save group assignment'}</button>
                        </form>
                      )}
                    </div>;
                  })}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button disabled={busy} onClick={async () => { if (confirm('Log out of this live session and return to this device’s offline data?')) await props.onLeave(); }} className="flex-1 py-3 rounded-xl border border-slate-600 font-bold text-slate-200 flex justify-center gap-2"><LogOut className="w-5 h-5" /> Log out of session</button>
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