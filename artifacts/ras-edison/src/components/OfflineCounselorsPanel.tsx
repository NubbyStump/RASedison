import { useEffect, useState } from 'react';
import { Bot, Plus, Sparkles, Trash2, Users } from 'lucide-react';

const STORAGE_KEY = 'ras_edison_ai_counselors_v1';

type Group = {
  id: string;
  name: string;
  icon?: string;
};

type AICounselor = {
  id: string;
  name: string;
  groupId: string;
};

function readCounselors(): AICounselor[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const saved: unknown = JSON.parse(raw);
    if (!Array.isArray(saved)) return [];

    return saved.filter((item): item is AICounselor => (
      item !== null
      && typeof item === 'object'
      && typeof item.id === 'string'
      && typeof item.name === 'string'
      && typeof item.groupId === 'string'
    ));
  } catch {
    return [];
  }
}

export default function OfflineCounselorsPanel({ groups }: { groups: Group[] }) {
  const [counselors, setCounselors] = useState<AICounselor[]>(readCounselors);
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    if (!groups.some((group) => group.id === groupId)) {
      setGroupId(groups[0]?.id ?? '');
    }
  }, [groups, groupId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(counselors));
      setStorageError('');
    } catch {
      setStorageError('Changes are available for this visit but could not be saved on this device.');
    }
  }, [counselors]);

  const addCounselor = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Enter a name for this AI counselor.');
      return;
    }
    if (!groups.some((group) => group.id === groupId)) {
      setError('Choose a group before adding an AI counselor.');
      return;
    }
    if (counselors.some((counselor) => counselor.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase())) {
      setError('An AI counselor with that name already exists.');
      return;
    }

    setCounselors((current) => [
      ...current,
      { id: crypto.randomUUID(), name: trimmedName, groupId },
    ]);
    setName('');
    setError('');
  };

  const updateCounselorGroup = (counselorId: string, nextGroupId: string) => {
    setCounselors((current) => current.map((counselor) => (
      counselor.id === counselorId ? { ...counselor, groupId: nextGroupId } : counselor
    )));
  };

  const removeCounselor = (counselorId: string) => {
    const counselor = counselors.find((item) => item.id === counselorId);
    if (!counselor || !window.confirm(`Remove ${counselor.name} from the offline counselor roster?`)) return;
    setCounselors((current) => current.filter((item) => item.id !== counselorId));
  };

  return (
    <section className="mx-auto max-w-4xl space-y-5" aria-labelledby="offline-counselors-title">
      <header className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-violet-700">Offline tools</p>
            <h2 id="offline-counselors-title" className="mt-1 text-2xl font-black text-slate-900">
              AI Counselor Profiles
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Add virtual counselor profiles and assign each one to a group. Profiles are saved on this device.
              AI chat and activity suggestions are not enabled yet.
            </p>
          </div>
        </div>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="add-ai-counselor-title">
        <div className="mb-4 flex items-center gap-2">
          <Plus className="h-5 w-5 text-cyan-700" aria-hidden="true" />
          <h3 id="add-ai-counselor-title" className="text-lg font-black text-slate-900">Add an AI counselor</h3>
        </div>
        <form onSubmit={addCounselor} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.8fr)_auto] sm:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">Counselor name</span>
            <input
              required
              maxLength={60}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError('');
              }}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
              placeholder="e.g. Coach Nova"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">Assigned group</span>
            <select
              required
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              disabled={groups.length === 0}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              {groups.length === 0 && <option value="">No groups available</option>}
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.icon ? `${group.icon} ` : ''}{group.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={groups.length === 0}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 text-sm font-black text-white transition hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add counselor
          </button>
        </form>
        {error && <p className="mt-3 text-sm font-bold text-rose-700" role="alert">{error}</p>}
        {storageError && <p className="mt-3 text-sm font-bold text-amber-700" role="alert">{storageError}</p>}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="ai-counselor-roster-title">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 id="ai-counselor-roster-title" className="flex items-center gap-2 text-lg font-black text-slate-900">
              <Users className="h-5 w-5 text-cyan-700" aria-hidden="true" />
              Offline roster
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {counselors.length} {counselors.length === 1 ? 'AI counselor' : 'AI counselors'}
            </p>
          </div>
        </div>

        {counselors.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
            <Bot className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="mt-3 font-bold text-slate-800">No AI counselors yet</p>
            <p className="mt-1 text-sm text-slate-600">Add a profile above to start your offline roster.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {counselors.map((counselor) => {
              const assignedGroup = groups.find((group) => group.id === counselor.groupId);
              return (
                <li
                  key={counselor.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                      <Bot className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-black text-slate-900">{counselor.name}</p>
                      <p className="text-xs font-semibold text-slate-500">AI counselor · offline profile</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:min-w-[18rem]">
                    <label className="sr-only" htmlFor={`ai-counselor-group-${counselor.id}`}>
                      Group assignment for {counselor.name}
                    </label>
                    <select
                      id={`ai-counselor-group-${counselor.id}`}
                      value={assignedGroup ? counselor.groupId : ''}
                      onChange={(event) => updateCounselorGroup(counselor.id, event.target.value)}
                      className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200"
                    >
                      {!assignedGroup && <option value="">Choose a group</option>}
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.icon ? `${group.icon} ` : ''}{group.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeCounselor(counselor.id)}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-white text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                      aria-label={`Remove ${counselor.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}