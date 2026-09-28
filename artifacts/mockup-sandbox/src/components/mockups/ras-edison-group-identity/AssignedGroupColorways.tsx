import { useMemo, useState } from "react";
import {
  Award,
  Calendar,
  Check,
  FileText,
  Flame,
  RotateCcw,
  Sparkles,
  Timer,
  Trophy,
  Tv,
  Wifi,
  X,
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

const GROUP_STYLES: Record<string, { accent: string; pale: string; ink: string; edge: string; rail: string }> = {
  ladybugs: {
    accent: "bg-rose-600",
    pale: "bg-rose-50",
    ink: "text-rose-800",
    edge: "border-rose-200",
    rail: "bg-rose-500",
  },
  jellyfish: {
    accent: "bg-cyan-700",
    pale: "bg-cyan-50",
    ink: "text-cyan-900",
    edge: "border-cyan-300",
    rail: "bg-cyan-600",
  },
  tigers: {
    accent: "bg-amber-600",
    pale: "bg-amber-50",
    ink: "text-amber-900",
    edge: "border-amber-200",
    rail: "bg-amber-500",
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

export function AssignedGroupColorways() {
  const [activeTab, setActiveTab] = useState("scoreboard");
  const [groups, setGroups] = useState(initialGroups);
  const [reasons, setReasons] = useState<Record<string, string>>({ ladybugs: "", jellyfish: "", tigers: "" });
  const [mentions, setMentions] = useState<Record<string, string>>({ ladybugs: "", jellyfish: "", tigers: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [history, setHistory] = useState(initialHistory);
  const [archive, setArchive] = useState(initialArchive);
  const [approvalStatus, setApprovalStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const assignedGroup = groups.find((group) => group.id === "jellyfish")!;
  const assignedStyle = GROUP_STYLES[assignedGroup.id];
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

  const undoEntry = (entry: LogEntry) => {
    setGroups((current) => current.map((group) => group.id === entry.groupId
      ? { ...group, score: Math.max(0, group.score - entry.amount) }
      : group));
    setHistory((current) => current.filter((item) => item.id !== entry.id));
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
    <div className="ras-edison-current min-h-[100dvh] bg-[#eef3f1] pb-12 text-[#183a38]">
      <header className="sticky top-0 z-30 border-b border-[#d4e1dc] bg-[#f8fbf9]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3">
            <img src="/__mockup/images/ras-logo.png" alt="Right At School Logo" className="h-10 w-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-[#dce7e2]" />
            <div>
              <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[.18em] text-[#487b70]">Right At School</div>
              <h1 className="text-base font-black leading-tight tracking-tight text-[#183a38] md:text-lg">Edison Language Academy</h1>
            </div>
          </div>
          <div className="flex max-w-full items-center overflow-x-auto rounded-2xl border border-[#d6e2dd] bg-[#edf3f0] p-1">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)} aria-current={activeTab === id ? "page" : undefined} className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition md:text-sm ${activeTab === id ? "bg-[#183a38] text-white shadow-sm" : "text-[#607873] hover:bg-white hover:text-[#183a38]"}`}>
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
            <button onClick={() => setActiveTab("projector")} className="ml-1 flex min-h-[44px] shrink-0 items-center gap-1 border-l border-[#d1ded9] px-2.5 text-xs font-bold text-[#287e8d] hover:bg-white"><Tv className="h-4 w-4" /> Projector</button>
            <div aria-label="Live connection active" className="ml-1 flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-[#b8d9cd] bg-[#e4f3ec] px-3 text-xs font-bold text-[#286b54]"><Wifi className="h-4 w-4" /> Live</div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-6">
        {activeTab === "scoreboard" && <div className="space-y-5">
          <div data-testid="banner-my-group" className={`relative flex items-center justify-between gap-4 overflow-hidden rounded-2xl border ${assignedStyle.edge} ${assignedStyle.pale} px-5 py-3.5`}>
            <div className="absolute inset-y-0 left-0 w-1.5 bg-cyan-600" />
            <div className="flex items-center gap-3 pl-1">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-200 bg-white text-2xl shadow-sm">{assignedGroup.icon}</span>
              <div>
                <div className={`text-[11px] font-black uppercase tracking-[.17em] ${assignedStyle.ink}`}>Your Assigned Group</div>
                <div className="font-black text-[#183a38]">{assignedGroup.name}</div>
              </div>
            </div>
            <span className="hidden rounded-full border border-cyan-200 bg-white/80 px-3 py-1 text-xs font-bold text-cyan-900 sm:inline-flex">Counselor view</span>
          </div>

          <section className="overflow-hidden rounded-3xl border border-[#cdded8] bg-[#183a38] p-5 text-white shadow-[0_12px_30px_rgba(24,58,56,.12)]">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[.15em] text-[#a8d6c6]"><Sparkles className="h-4 w-4" /> Edison leaderboard</div>
                <h2 className="text-xl font-black md:text-2xl">
                  {leaders.length ? <><span className="text-[#a8d6c6]">{leaders.map((item) => item.name).join(" & ")}</span> lead with <span className="text-[#a8d6c6]">{maxScore} pts</span>!</> : "Scores reset! Earn points by hundreds."}
                </h2>
                <p className="mt-1 text-sm text-[#d1e3dd]">Three teams. One big Edison spirit.</p>
              </div>
              <div className="flex items-center gap-3 self-start rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5 md:self-auto">
                <Calendar className="h-5 w-5 text-[#a8d6c6]" />
                <div><div className="text-xs font-medium text-[#c6d9d2]">Month ends in</div><div className="text-sm font-extrabold text-white">{daysRemaining} days remaining</div></div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-[#ead7a7] bg-[#fff8e6] p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h3 className="text-lg font-extrabold text-[#463917]">Points awaiting approval</h3><p className="mt-1 text-xs text-[#796b43]">Counselor changes stay out of the score until approved by the Program Manager.</p></div>
              <span className="rounded-full border border-[#e8d29b] bg-[#f7e9c5] px-3 py-1 text-xs font-black text-[#725718]">1 pending</span>
            </div>
            <div className="flex flex-col justify-between gap-3 rounded-2xl border border-[#eadfc5] bg-white/85 p-3 md:flex-row md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-cyan-100 px-2 py-1 text-xs font-black text-cyan-900">+50</span>
                  <span className="font-bold text-[#183a38]">Jellyfish</span>
                  <span className="text-xs text-[#8b681a]">{approvalMessage}</span>
                </div>
                <p className="mt-1 text-sm italic text-[#526762]">“Outstanding cleanup teamwork”</p>
                <p className="mt-1 text-xs text-[#70827d]">Requested by Mr. Chen</p>
              </div>
              {approvalStatus === "pending" ? <div className="flex shrink-0 gap-2">
                <button onClick={() => setApprovalStatus("approved")} aria-label="Approve Jellyfish point request" className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#286b54] px-3 py-2 text-xs font-black text-white transition hover:bg-[#205b46]"><Check className="h-4 w-4" /> Approve</button>
                <button onClick={() => setApprovalStatus("rejected")} aria-label="Reject Jellyfish point request" className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-800 transition hover:bg-rose-100"><X className="h-4 w-4" /> Reject</button>
              </div> : <span className={`rounded-xl px-3 py-2 text-xs font-bold ${approvalStatus === "approved" ? "bg-[#e4f3ec] text-[#286b54]" : "bg-rose-50 text-rose-800"}`}>{approvalStatus === "approved" ? "Request approved" : "Request rejected"}</span>}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {groups.map((group) => {
              const isMyGroup = group.id === assignedGroup.id;
              const isLeading = group.score === maxScore && maxScore > 0;
              const color = GROUP_STYLES[group.id];
              return <article key={group.id} className={`relative flex flex-col justify-between overflow-hidden rounded-3xl border bg-[#fffefa] shadow-[0_5px_18px_rgba(28,61,56,.07)] transition-shadow hover:shadow-[0_10px_24px_rgba(28,61,56,.12)] ${isMyGroup ? "border-cyan-400 ring-2 ring-cyan-200" : "border-[#dbe5e0]"}`}>
                <div className={`h-1.5 ${color.rail}`} />
                {isMyGroup && <div className="absolute right-4 top-4 rounded-full bg-cyan-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-950">Your group</div>}
                {isLeading && <div className={`absolute ${isMyGroup ? "right-4 top-12" : "right-4 top-4"} flex items-center gap-1 rounded-full bg-[#e8f3ed] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#286b54]`}><Flame className="h-3.5 w-3.5 fill-current" /> Slime leader</div>}
                <div className="p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${color.pale} text-2xl shadow-sm ring-1 ${color.edge}`}>{group.icon}</div>
                      <div><h3 className="text-xl font-extrabold text-[#183a38]">{group.name}</h3><span className="text-xs font-medium text-[#71827d]">Group score</span></div>
                    </div>
                    <div aria-label={`${group.score} points`} className="rounded-2xl border border-[#dce6e1] bg-[#f3f7f4] px-3 py-2 text-2xl font-black tabular-nums text-[#183a38]">{group.score}</div>
                  </div>
                  <div className="mb-3">
                    <label htmlFor={`reason-${group.id}`} className="mb-1 block text-xs font-semibold text-[#3d5650]">Reason <span className="text-[#8b681a]">· required</span></label>
                    <input id={`reason-${group.id}`} value={reasons[group.id]} aria-invalid={Boolean(errors[group.id])} aria-describedby={errors[group.id] ? `reason-error-${group.id}` : undefined} onChange={(event) => { setReasons((current) => ({ ...current, [group.id]: event.target.value })); setErrors((current) => ({ ...current, [group.id]: "" })); }} placeholder="e.g. Quietest line" className={`min-h-[42px] w-full rounded-xl border bg-white px-3.5 py-2 text-sm text-[#183a38] outline-none transition placeholder:text-[#93a29d] focus:ring-2 ${isMyGroup ? "border-cyan-300 focus:border-cyan-600 focus:ring-cyan-100" : `border-[#d7e2dc] focus:border-[#648b7f] focus:ring-[#e6efeb]`}`} />
                    {errors[group.id] && <p id={`reason-error-${group.id}`} role="alert" className="mt-1 text-xs font-semibold text-rose-700">{errors[group.id]}</p>}
                  </div>
                  <div className="mb-4">
                    <label htmlFor={`mentions-${group.id}`} className="mb-1 block text-xs font-semibold text-[#3d5650]">Special mentions <span className="font-normal text-[#82918c]">· optional</span></label>
                    <input id={`mentions-${group.id}`} value={mentions[group.id]} onChange={(event) => setMentions((current) => ({ ...current, [group.id]: event.target.value }))} placeholder="Names or shout-outs for the log" className="min-h-[42px] w-full rounded-xl border border-[#d7e2dc] bg-white px-3.5 py-2 text-sm text-[#183a38] outline-none transition placeholder:text-[#93a29d] focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" />
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-1.5">{[10, 50, 100].map((amount) => <button key={amount} onClick={() => changePoints(group.id, amount)} aria-label={`Add ${amount} points to ${group.name}`} className={`min-h-[44px] rounded-xl border py-2 text-xs font-black transition hover:-translate-y-0.5 ${color.edge} ${color.pale} ${color.ink}`}>+{amount}</button>)}</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button onClick={() => changePoints(group.id, 200)} aria-label={`Add 200 points to ${group.name}`} className={`min-h-[44px] rounded-xl py-2 text-xs font-black text-white shadow-sm transition hover:-translate-y-0.5 ${color.accent}`}>+200</button>
                      <button onClick={() => changePoints(group.id, 500)} aria-label={`Add 500 points to ${group.name}`} className="min-h-[44px] rounded-xl bg-[#286b54] py-2 text-xs font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#205b46]">+500</button>
                      <button onClick={() => changePoints(group.id, 600)} aria-label={`Add 600 points to ${group.name}`} className="flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-[#f2d58c] py-2 text-xs font-black text-[#4d3a0c] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#ebca72]"><Sparkles className="h-3.5 w-3.5" /> +600</button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <button onClick={() => changePoints(group.id, -10)} aria-label={`Subtract 10 points from ${group.name}`} className="min-h-[44px] rounded-xl border border-rose-200 bg-rose-50 py-1.5 text-xs font-bold text-rose-800 transition hover:bg-rose-100">−10</button>
                      <button onClick={() => changePoints(group.id, -50)} aria-label={`Subtract 50 points from ${group.name}`} className="min-h-[44px] rounded-xl border border-rose-200 bg-rose-100 py-1.5 text-xs font-bold text-rose-900 transition hover:bg-rose-200">−50</button>
                    </div>
                  </div>
                </div>
              </article>;
            })}
          </div>

          <div className="grid grid-cols-1 gap-5 pt-1 lg:grid-cols-3">
            <section className="rounded-3xl border border-[#d5e1db] bg-[#fffefa] p-5 shadow-sm lg:col-span-2">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-lg font-extrabold text-[#183a38]"><RotateCcw className="h-5 w-5 text-[#46816e]" /> Recent points entry log</h3>
                <span className="text-xs text-[#758780]">Single-tap undo available</span>
              </div>
              {history.length === 0 ? <div className="rounded-2xl border border-dashed border-[#ccdcd4] bg-[#f7faf8] py-8 text-center text-sm font-medium text-[#73857d]">No points recorded yet today.</div> : <div className="max-h-[300px] space-y-2.5 overflow-y-auto pr-1">{history.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 rounded-2xl border border-[#e1e9e4] bg-[#f8faf8] p-3 text-sm">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`rounded-xl border px-2.5 py-1 text-xs font-black ${item.amount > 0 ? "border-[#c9e0d4] bg-[#e8f3ed] text-[#286b54]" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{item.amount > 0 ? `+${item.amount}` : item.amount}</span>
                  <div className="min-w-0"><div className="flex flex-wrap gap-x-2"><span className={`font-bold ${GROUP_STYLES[item.groupId].ink}`}>{item.groupName}</span><span className="italic text-[#526762]">“{item.reason}”</span></div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[#758780]">{item.submittedByName && <span>Entered by {item.submittedByName}</span>}{item.specialMentions && <span><strong className="text-cyan-900">Special mentions:</strong> {item.specialMentions}</span>}</div>
                  </div>
                </div>
                <button onClick={() => undoEntry(item)} aria-label={`Undo ${item.amount > 0 ? "addition" : "deduction"} of ${Math.abs(item.amount)} points for ${item.groupName}`} className="min-h-[36px] shrink-0 rounded-xl border border-[#d5e1db] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#36544c] transition hover:bg-[#edf4f0]">Undo</button>
              </div>)}</div>}
            </section>
            <section className="flex flex-col justify-between rounded-3xl border border-[#d5e1db] bg-[#fffefa] p-5 shadow-sm">
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-[#183a38]"><Award className="h-5 w-5 text-[#b6811e]" /> Monthly slime champions</h3>
                <div className="mb-4 max-h-[190px] space-y-3 overflow-y-auto">{archive.map((record) => {
                  const winner = GROUP_STYLES[record.winner.toLowerCase()];
                  return <div key={record.id} className="rounded-2xl border border-[#e1e9e4] bg-[#f8faf8] p-3 text-xs">
                    <div className="mb-1 flex justify-between gap-2 font-bold text-[#36544c]"><span>{record.month}</span><span className={winner?.ink || "text-[#286b54]"}>Winner: {record.winner}</span></div>
                    <div className="mb-2 text-[11px] leading-relaxed text-[#758780]">{record.scores}</div>
                    <label className="flex min-h-[32px] cursor-pointer items-center gap-2 font-semibold text-[#526762]">
                      <input type="checkbox" checked={record.rewardClaimed} onChange={() => toggleReward(record.id)} className="h-4 w-4 rounded border-[#b6c9bf] accent-[#286b54] focus:ring-[#286b54]" />
                      <span>Prize &amp; Slime Done</span>
                    </label>
                  </div>;
                })}</div>
              </div>
              <button onClick={resetMonth} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-3 text-xs font-extrabold text-rose-800 transition hover:border-rose-300 hover:bg-rose-100"><RotateCcw className="h-4 w-4" /> Reset Scores For New Month</button>
            </section>
          </div>
        </div>}
        {activeTab !== "scoreboard" && <div className="rounded-3xl border border-[#d5e1db] bg-[#fffefa] p-8 text-center shadow-sm">
          <FileText className="mx-auto mb-3 h-10 w-10 text-[#b6811e]" />
          <h2 className="text-2xl font-black text-[#183a38]">{activeTab === "generator" ? "Activities" : activeTab === "fastest_lap" ? "Fastest Laps" : "Projector View"}</h2>
          <p className="mt-2 text-sm text-[#607873]">This Current extraction keeps the counselor Points dashboard active while preserving the app navigation controls.</p>
          <button onClick={() => setActiveTab("scoreboard")} className="mt-5 min-h-[44px] rounded-xl bg-[#183a38] px-4 py-3 text-sm font-black text-white transition hover:bg-[#24534f]">Return to Points</button>
        </div>}
      </main>
    </div>
  );
}

export default AssignedGroupColorways;