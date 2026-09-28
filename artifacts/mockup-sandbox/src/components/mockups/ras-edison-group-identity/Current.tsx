import { useMemo, useState } from "react";
import {
  Award,
  Calendar,
  FileText,
  Flame,
  RotateCcw,
  Sparkles,
  Timer,
  Trophy,
  Tv,
  Wifi,
} from "lucide-react";
import "./_group.css";

type Group = {
  id: string;
  name: string;
  score: number;
  color: string;
  icon: string;
};

type LogEntry = {
  id: number;
  groupId: string;
  groupName: string;
  amount: number;
  reason: string;
  specialMentions?: string;
  submittedByName?: string;
};

const GROUP_THEMES: Record<string, { page: string; banner: string; label: string; card: string }> = {
  ladybugs: {
    page: "from-rose-700 via-red-800 to-red-950",
    banner: "bg-rose-500/20 border-rose-300/60",
    label: "text-rose-100",
    card: "border-rose-300/90 shadow-[0_0_35px_rgba(244,63,94,0.3)] ring-2 ring-rose-300/30",
  },
  jellyfish: {
    page: "from-cyan-700 via-blue-800 to-blue-950",
    banner: "bg-cyan-500/20 border-cyan-300/60",
    label: "text-cyan-100",
    card: "border-cyan-300/90 shadow-[0_0_35px_rgba(34,211,238,0.3)] ring-2 ring-cyan-300/30",
  },
  tigers: {
    page: "from-amber-700 via-orange-800 to-orange-950",
    banner: "bg-amber-500/20 border-amber-300/60",
    label: "text-amber-100",
    card: "border-amber-300/90 shadow-[0_0_35px_rgba(251,191,36,0.3)] ring-2 ring-amber-300/30",
  },
};

const initialGroups: Group[] = [
  { id: "jellyfish", name: "Jellyfish", score: 785, color: "from-cyan-500 to-blue-600", icon: "🪼" },
  { id: "ladybugs", name: "Ladybugs", score: 840, color: "from-rose-500 to-red-600", icon: "🐞" },
  { id: "tigers", name: "Tigers", score: 715, color: "from-amber-500 to-orange-600", icon: "🐯" },
];

const initialHistory: LogEntry[] = [
  { id: 1, groupId: "ladybugs", groupName: "Ladybugs", amount: 100, reason: "Quietest line", specialMentions: "Mia and Jordan", submittedByName: "Ms. Rivera" },
  { id: 2, groupId: "jellyfish", groupName: "Jellyfish", amount: 50, reason: "Helping a new friend", submittedByName: "Mr. Chen" },
  { id: 3, groupId: "tigers", groupName: "Tigers", amount: 200, reason: "Completed the mission", submittedByName: "Ms. Rivera" },
];

const initialArchive = [
  { id: 1, month: "April 2025", winner: "Jellyfish", scores: "Ladybugs: 820 pts | Jellyfish: 910 pts | Tigers: 760 pts", rewardClaimed: true },
  { id: 2, month: "March 2025", winner: "Ladybugs", scores: "Ladybugs: 1,020 pts | Jellyfish: 885 pts | Tigers: 990 pts", rewardClaimed: false },
];

export function Current() {
  const [activeTab, setActiveTab] = useState("scoreboard");
  const [groups, setGroups] = useState(initialGroups);
  const [reasons, setReasons] = useState<Record<string, string>>({ ladybugs: "", jellyfish: "", tigers: "" });
  const [mentions, setMentions] = useState<Record<string, string>>({ ladybugs: "", jellyfish: "", tigers: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [history, setHistory] = useState(initialHistory);
  const [archive, setArchive] = useState(initialArchive);
  const [approvalStatus, setApprovalStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const assignedGroup = groups.find((group) => group.id === "jellyfish")!;
  const theme = GROUP_THEMES[assignedGroup.id];
  const maxScore = Math.max(...groups.map((group) => group.score));
  const leaders = groups.filter((group) => group.score === maxScore && maxScore > 0);
  const daysRemaining = 13;

  const changePoints = (groupId: string, amount: number) => {
    const reason = reasons[groupId]?.trim();
    if (!reason) {
      setErrors((current) => ({ ...current, [groupId]: "Enter a reason before changing points." }));
      return;
    }
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;
    setGroups((current) => current.map((item) => item.id === groupId ? { ...item, score: Math.max(0, item.score + amount) } : item));
    setHistory((current) => [{
      id: Date.now(),
      groupId,
      groupName: group.name,
      amount,
      reason,
      ...(mentions[groupId]?.trim() ? { specialMentions: mentions[groupId].trim() } : {}),
      submittedByName: "You",
    }, ...current].slice(0, 12));
    setReasons((current) => ({ ...current, [groupId]: "" }));
    setMentions((current) => ({ ...current, [groupId]: "" }));
    setErrors((current) => ({ ...current, [groupId]: "" }));
  };

  const toggleReward = (id: number) => setArchive((current) => current.map((item) => item.id === id ? { ...item, rewardClaimed: !item.rewardClaimed } : item));
  const resetMonth = () => {
    if (!window.confirm("Reset scores for a new month?")) return;
    setGroups((current) => current.map((group) => ({ ...group, score: 0 })));
    setHistory([]);
  };
  const approvalMessage = approvalStatus === "pending" ? "Auto-approves in 04:32" : approvalStatus === "approved" ? "Approved by Program Manager" : "Request rejected";

  const navItems = useMemo(() => [
    { id: "scoreboard", label: "Points", icon: Trophy },
    { id: "generator", label: "Activities", icon: FileText },
    { id: "fastest_lap", label: "Laps", icon: Timer },
  ], []);

  return (
    <div className={`ras-edison-current min-h-[100dvh] bg-gradient-to-br ${theme.page} text-slate-100 pb-12`}>
      <header className="sticky top-0 z-30 border-b border-slate-700/80 bg-slate-900/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3">
            <img src="/__mockup/images/ras-logo.png" alt="Right At School Logo" className="h-10 w-auto rounded-xl bg-white p-1 shadow-md" />
            <div>
              <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-400">Right At School</div>
              <h1 className="text-base font-black leading-tight tracking-tight text-white md:text-lg">Edison Language Academy</h1>
            </div>
          </div>
          <div className="flex max-w-full items-center overflow-x-auto rounded-2xl border border-slate-700 bg-slate-900 p-1">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)} className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition md:text-sm ${activeTab === id ? (id === "scoreboard" ? "bg-emerald-500 text-slate-950 shadow-md" : id === "generator" ? "bg-amber-500 text-slate-950 shadow-md" : "bg-cyan-500 text-slate-950 shadow-md") : "text-slate-400 hover:text-white"}`}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
            <button onClick={() => setActiveTab("projector")} className="ml-1 flex min-h-[44px] shrink-0 items-center gap-1 border-l border-cyan-500/20 px-2.5 text-xs font-bold text-cyan-400 hover:bg-cyan-950/50"><Tv className="h-4 w-4" /> Projector</button>
            <button className="ml-1 flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 text-xs font-bold text-emerald-300"><Wifi className="h-4 w-4" /> Live</button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-6">
        {activeTab === "scoreboard" && <div className="space-y-6">
          <div data-testid="banner-my-group" className={`${theme.banner} flex items-center gap-3 rounded-2xl border px-5 py-3`}>
            <span className="text-2xl">{assignedGroup.icon}</span>
            <div><div className={`text-[11px] font-black uppercase tracking-widest ${theme.label}`}>Your Assigned Group</div><div className="font-black text-white">{assignedGroup.name}</div></div>
          </div>

          <div className="rounded-3xl border border-slate-700/80 bg-gradient-to-r from-slate-800 via-slate-800 to-slate-800/90 p-5 shadow-xl">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400"><Sparkles className="h-4 w-4" /> Edison Leaderboard Status</div>
                <h2 className="text-xl font-black text-white md:text-2xl">{leaders.length ? <><span className="text-emerald-400">{leaders.map((item) => item.name).join(" & ")}</span> lead with <span className="text-emerald-400">{maxScore} pts</span>! 👑</> : "Scores reset! Earn points by hundreds."}</h2>
              </div>
              <div className="flex items-center gap-3 self-start rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 md:self-auto"><Calendar className="h-5 w-5 text-emerald-400" /><div><div className="text-xs font-medium text-slate-400">Month Ends In</div><div className="text-sm font-extrabold text-white">{daysRemaining} Days Remaining</div></div></div>
            </div>
          </div>

          <section className="rounded-3xl border border-amber-500/40 bg-amber-950/30 p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="text-lg font-extrabold text-white">Points Awaiting Approval</h3><p className="mt-1 text-xs text-amber-200/70">Counselor changes stay out of the score until approved by the Program Manager.</p></div><span className="rounded-full border border-amber-400/30 bg-amber-400/15 px-3 py-1 text-xs font-black text-amber-200">1 pending</span></div>
            <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-700/70 bg-slate-900/75 p-3 md:flex-row md:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-lg bg-emerald-500/20 px-2 py-1 text-xs font-black text-emerald-300">+50</span><span className="font-bold text-white">Jellyfish</span><span className="text-xs text-amber-200">{approvalMessage}</span></div><p className="mt-1 text-sm italic text-slate-300">“Outstanding cleanup teamwork”</p><p className="mt-1 text-xs text-slate-400">Requested by Mr. Chen</p></div><div className="flex shrink-0 gap-2"><button onClick={() => setApprovalStatus("approved")} className="min-h-[44px] rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-slate-950">Approve</button><button onClick={() => setApprovalStatus("rejected")} className="min-h-[44px] rounded-xl border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs font-black text-red-200">Reject</button></div></div>
          </section>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {groups.map((group) => {
              const isMyGroup = group.id === assignedGroup.id;
              const isLeading = group.score === maxScore && maxScore > 0;
              return <div key={group.id} className={`relative flex flex-col justify-between rounded-3xl border bg-slate-800/90 p-5 shadow-lg transition-all ${isMyGroup ? theme.card : isLeading ? "border-emerald-400/80 shadow-[0_0_30px_rgba(16,185,129,0.2)] ring-2 ring-emerald-400/20" : "border-slate-700/70"}`}>
                {isMyGroup && <div className="absolute -top-3.5 left-4 rounded-full bg-cyan-400 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950 shadow-md">Your Assigned Group</div>}
                {isLeading && <div className="absolute -top-3.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-emerald-400 px-4 py-1 text-xs font-black uppercase tracking-wider text-slate-950 shadow-md"><Flame className="h-3.5 w-3.5 fill-current" /> Slime Leader</div>}
                <div>
                  <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-3"><div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${group.color} text-2xl shadow-md`}>{group.icon}</div><div><h3 className="text-xl font-extrabold text-white">{group.name}</h3><span className="text-xs font-medium text-slate-400">Group Score</span></div></div><div className="rounded-2xl border border-slate-700/60 bg-slate-900/80 px-4 py-2 text-3xl font-black text-white">{group.score}</div></div>
                  <div className="mb-4"><label htmlFor={`reason-${group.id}`} className="mb-1 block text-xs text-slate-300">Reason (required for every points change)</label><input id={`reason-${group.id}`} value={reasons[group.id]} onChange={(event) => { setReasons((current) => ({ ...current, [group.id]: event.target.value })); setErrors((current) => ({ ...current, [group.id]: "" })); }} placeholder="Reason (e.g. Quietest line)..." className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3.5 py-2 text-xs text-slate-200 outline-none transition focus:border-emerald-500" />{errors[group.id] && <p className="mt-1 text-xs text-red-300">{errors[group.id]}</p>}</div>
                  <div className="mb-4"><label htmlFor={`mentions-${group.id}`} className="mb-1 block text-xs text-slate-300">Special mentions (optional)</label><input id={`mentions-${group.id}`} value={mentions[group.id]} onChange={(event) => setMentions((current) => ({ ...current, [group.id]: event.target.value }))} placeholder="Names or shout-outs to include in the log" className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3.5 py-2 text-xs text-slate-200 outline-none transition focus:border-cyan-500" /></div>
                  <div className="mb-2 space-y-2"><div className="grid grid-cols-3 gap-1.5">{[10, 50, 100].map((amount) => <button key={amount} onClick={() => changePoints(group.id, amount)} className="min-h-[44px] rounded-xl border border-emerald-500/30 bg-emerald-500/10 py-2 text-xs font-black text-emerald-400 transition hover:bg-emerald-500/20">+{amount}</button>)}</div><div className="grid grid-cols-3 gap-1.5"><button onClick={() => changePoints(group.id, 200)} className="min-h-[44px] rounded-xl bg-emerald-500 py-2 text-xs font-black text-slate-950 shadow-md hover:bg-emerald-400">+200</button><button onClick={() => changePoints(group.id, 500)} className="min-h-[44px] rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 py-2 text-xs font-black text-slate-950 shadow-md">+500</button><button onClick={() => changePoints(group.id, 600)} className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 py-2 text-xs font-black text-slate-950 shadow-md"><Sparkles className="h-3.5 w-3.5" /> +600</button></div><div className="grid grid-cols-2 gap-1.5 pt-1"><button onClick={() => changePoints(group.id, -10)} className="min-h-[44px] rounded-xl border border-red-500/30 bg-red-500/10 py-1.5 text-xs font-bold text-red-400">-10</button><button onClick={() => changePoints(group.id, -50)} className="min-h-[44px] rounded-xl border border-red-500/40 bg-red-500/20 py-1.5 text-xs font-bold text-red-300">-50</button></div></div>
                </div>
              </div>;
            })}
          </div>

          <div className="grid grid-cols-1 gap-6 pt-2 lg:grid-cols-3">
            <div className="rounded-3xl border border-slate-700/80 bg-slate-800/80 p-5 shadow-lg lg:col-span-2"><div className="mb-4 flex items-center justify-between"><h3 className="flex items-center gap-2 text-lg font-extrabold text-white"><RotateCcw className="h-5 w-5 text-emerald-400" /> Recent Points Entry Log</h3><span className="text-xs text-slate-400">Single-tap Undo available</span></div>{history.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700/60 py-8 text-center text-sm font-medium text-slate-500">No points recorded yet today.</div> : <div className="max-h-[300px] space-y-2.5 overflow-y-auto pr-1">{history.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/70 p-3 text-sm"><div className="flex min-w-0 items-start gap-3"><span className={`rounded-xl px-2.5 py-1 text-xs font-black ${item.amount > 0 ? "border border-emerald-500/30 bg-emerald-500/20 text-emerald-300" : "border border-red-500/30 bg-red-500/20 text-red-300"}`}>{item.amount > 0 ? `+${item.amount}` : item.amount}</span><div><div className="flex flex-wrap gap-x-2"><span className="font-bold text-white">{item.groupName}</span><span className="italic text-slate-300">“{item.reason}”</span></div><div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-400">{item.submittedByName && <span>Entered by {item.submittedByName}</span>}{item.specialMentions && <span><strong className="text-cyan-200">Special mentions:</strong> {item.specialMentions}</span>}</div></div></div><button onClick={() => setHistory((current) => current.filter((entry) => entry.id !== item.id))} className="rounded-xl border border-slate-600/50 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-300">Undo</button></div>)}</div>}</div>
            <div className="flex flex-col justify-between rounded-3xl border border-slate-700/80 bg-slate-800/80 p-5 shadow-lg"><div><h3 className="mb-2 flex items-center gap-2 text-lg font-extrabold text-white"><Award className="h-5 w-5 text-amber-400" /> Monthly Slime Champions</h3><div className="mb-4 max-h-[180px] space-y-3 overflow-y-auto">{archive.map((record) => <div key={record.id} className="rounded-2xl border border-slate-700/60 bg-slate-900/80 p-3 text-xs"><div className="mb-1 flex justify-between font-bold text-slate-200"><span>{record.month}</span><span className="text-emerald-400">Winner: {record.winner}</span></div><div className="mb-2 text-[11px] text-slate-400">{record.scores}</div><label className="flex cursor-pointer items-center gap-2 font-semibold text-slate-300"><input type="checkbox" checked={record.rewardClaimed} onChange={() => toggleReward(record.id)} className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500" /><span>Prize & Slime Done</span></label></div>)}</div></div><button onClick={resetMonth} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 py-3 text-xs font-extrabold text-red-400 transition hover:border-red-500/40 hover:bg-red-950/40"><RotateCcw className="h-4 w-4" /> Reset Scores For New Month</button></div>
          </div>
        </div>}
        {activeTab !== "scoreboard" && <div className="rounded-3xl border border-slate-700/80 bg-slate-800/90 p-8 text-center shadow-xl"><FileText className="mx-auto mb-3 h-10 w-10 text-amber-400" /><h2 className="text-2xl font-black text-white">{activeTab === "generator" ? "Activities" : activeTab === "fastest_lap" ? "Fastest Laps" : "Projector View"}</h2><p className="mt-2 text-sm text-slate-300">This Current extraction keeps the counselor Points dashboard active while preserving the app navigation controls.</p><button onClick={() => setActiveTab("scoreboard")} className="mt-5 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-black text-slate-950">Return to Points</button></div>}
      </main>
    </div>
  );
}

export default Current;