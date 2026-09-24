import { useState } from "react";
import {
  Award,
  ChevronRight,
  ClipboardList,
  Flame,
  Gauge,
  Medal,
  Minus,
  MonitorUp,
  Play,
  Plus,
  Radio,
  Sparkles,
  Trophy,
} from "lucide-react";

type Team = {
  id: string;
  name: string;
  score: number;
  color: string;
  soft: string;
  icon: typeof Flame;
};

const initialTeams: Team[] = [
  { id: "ladybugs", name: "Ladybugs", score: 840, color: "#f36b65", soft: "#402728", icon: Flame },
  { id: "jellyfish", name: "Jellyfish", score: 790, color: "#43c8dc", soft: "#173d48", icon: Gauge },
  { id: "tigers", name: "Tigers", score: 715, color: "#f3b64d", soft: "#4a3820", icon: Award },
];

export function EdisonDashboardRefined() {
  const [teams, setTeams] = useState(initialTeams);
  const [active, setActive] = useState("Points");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("Ready to recognize great choices.");

  const leader = Math.max(...teams.map((team) => team.score));
  const sortedTeams = [...teams].sort((a, b) => b.score - a.score);

  const changeScore = (id: string, amount: number) => {
    const team = teams.find((item) => item.id === id);
    if (!team) return;
    setTeams((current) =>
      current.map((item) =>
        item.id === id ? { ...item, score: Math.max(0, item.score + amount) } : item,
      ),
    );
    setNotice(`${amount > 0 ? "+" : ""}${amount} points for ${team.name}${reason ? ` · ${reason}` : ""}`);
    setReason("");
  };

  return (
    <main
      className="min-h-[100dvh] overflow-hidden p-4 text-[#f7f1e4] sm:p-6 lg:p-8"
      style={{
        background: "radial-gradient(circle at 11% 0%, #23443e 0, transparent 30%), radial-gradient(circle at 90% 100%, #3b3022 0, transparent 35%), #102824",
        fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div className="mx-auto max-w-[1540px]">
        <header className="flex flex-col gap-4 border-b border-[#e9d9b8]/15 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-[17px] bg-[#e9c35a] text-[#173631] shadow-[0_12px_30px_rgba(0,0,0,.22)]">
              <svg viewBox="0 0 64 64" aria-label="Edison eagle mark" className="h-8 w-8 fill-current">
                <path d="M57 14c-9 1-16 5-21 11-4-7-11-12-22-14 3 5 7 9 12 12-6-1-12-1-19 1 7 6 14 10 22 11-4 5-8 10-10 17l13-9 13 9c-2-7-5-12-9-17 9-2 16-7 21-14-6 0-12 1-17 3 6-3 12-6 17-10Z" />
                <circle cx="38" cy="25" r="2.5" fill="#173631" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#e9c35a]">Right At School</p>
              <h1 className="font-[Bricolage_Grotesque] text-lg font-bold tracking-tight text-[#fff8ea]">Edison Language Academy</h1>
            </div>
          </div>

          <nav className="flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-[#e9d9b8]/15 bg-[#0b201d]/75 p-1.5">
            {["Points", "Scrambles", "Laps"].map((item) => (
              <button
                key={item}
                onClick={() => setActive(item)}
                className="shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition"
                style={active === item ? { background: "#e9c35a", color: "#173631" } : { color: "#bdc8be" }}
              >
                {item}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-[#e9d9b8]/20" />
            <button onClick={() => setNotice("Projector view is ready to present.")} className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-[#72d9e8] transition hover:bg-[#72d9e8]/10">
              <MonitorUp className="h-4 w-4" /> Projector
            </button>
          </nav>

          <button onClick={() => setNotice("Live session connected to Room EDISON.")} className="flex items-center gap-2 self-start rounded-full border border-[#75d5ab]/25 bg-[#75d5ab]/10 px-3 py-2 text-xs font-bold text-[#9ce0bc] lg:self-auto">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#75d5ab] opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#75d5ab]" /></span>
            Live session · Room EDISON
          </button>
        </header>

        <section className="mt-7 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
          <div className="relative overflow-hidden rounded-[28px] border border-[#ead9bb]/14 bg-[#173631] px-6 py-7 shadow-[0_18px_50px_rgba(2,13,11,.25)] sm:px-8">
            <div className="absolute right-[-30px] top-[-80px] h-52 w-52 rounded-full border-[36px] border-[#e9c35a]/10" />
            <div className="relative flex flex-col justify-between gap-7 sm:flex-row sm:items-end">
              <div>
                <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-[#e9c35a]"><Sparkles className="h-4 w-4" /> May challenge board</div>
                <h2 className="max-w-xl font-[Bricolage_Grotesque] text-3xl font-bold leading-[1.04] tracking-tight text-[#fff8ea] sm:text-4xl">Ladybugs lead the pack.</h2>
                <p className="mt-3 text-sm text-[#c5d0c4]">One kind choice can change the whole board.</p>
              </div>
              <div className="rounded-2xl border border-[#e9c35a]/20 bg-[#102824] px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#9fb1a5]">Month ends in</p>
                <p className="mt-0.5 font-[Bricolage_Grotesque] text-2xl font-bold text-[#fff8ea]">13 days</p>
              </div>
            </div>
          </div>

          <aside className="rounded-[28px] border border-[#ead9bb]/14 bg-[#102e29] p-5 shadow-[0_18px_50px_rgba(2,13,11,.2)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[#e9c35a]"><Medal className="h-4 w-4" /> Fastest lap</div>
              <span className="rounded-full bg-[#e9c35a]/10 px-2 py-1 text-[10px] font-bold text-[#e9c35a]">MAY</span>
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div><p className="font-[Bricolage_Grotesque] text-xl font-bold text-[#fff8ea]">Nia S.</p><p className="mt-1 text-xs text-[#9fb1a5]">Edison Gym Lap</p></div>
              <p className="font-mono text-2xl font-bold text-[#72d9e8]">1:23.40</p>
            </div>
          </aside>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid gap-4 md:grid-cols-3">
            {sortedTeams.map((team, index) => {
              const Icon = team.icon;
              const isLeader = team.score === leader;
              return (
                <article key={team.id} className="relative overflow-hidden rounded-[28px] border border-[#ead9bb]/12 bg-[#16332e] p-5 shadow-[0_14px_35px_rgba(2,13,11,.16)]">
                  <div className="absolute right-[-24px] top-[-26px] h-28 w-28 rounded-full opacity-20" style={{ background: team.color }} />
                  <div className="relative flex items-start justify-between">
                    <div className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: team.soft, color: team.color }}><Icon className="h-5 w-5" /></div>
                    {isLeader ? <span className="flex items-center gap-1 rounded-full bg-[#e9c35a] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[#18332e]"><Trophy className="h-3 w-3" /> Leader</span> : <span className="text-[11px] font-bold text-[#8da196]">#{index + 1}</span>}
                  </div>
                  <p className="relative mt-5 font-[Bricolage_Grotesque] text-xl font-bold text-[#fff8ea]">{team.name}</p>
                  <div className="relative mt-1 flex items-end justify-between"><p className="font-[Bricolage_Grotesque] text-5xl font-bold tracking-tight text-[#fff8ea]">{team.score}</p><span className="mb-1 text-[10px] font-bold uppercase tracking-[.14em] text-[#94a69a]">points</span></div>
                  <div className="relative mt-5 grid grid-cols-3 gap-2">
                    {[10, 50, 100].map((amount) => <button key={amount} onClick={() => changeScore(team.id, amount)} className="rounded-xl border border-[#f7f1e4]/12 bg-[#20423b] py-2 text-xs font-bold text-[#e6eee8] transition hover:-translate-y-0.5 hover:bg-[#295248]">+{amount}</button>)}
                  </div>
                  <button onClick={() => changeScore(team.id, -10)} className="relative mt-2 flex w-full items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-bold text-[#b7c6bd] transition hover:bg-[#f36b65]/10 hover:text-[#f59d98]"><Minus className="h-3 w-3" /> Adjust score</button>
                </article>
              );
            })}
          </div>

          <aside className="rounded-[28px] border border-[#ead9bb]/12 bg-[#102e29] p-5 shadow-[0_14px_35px_rgba(2,13,11,.16)]">
            <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-[#e9c35a]" /><h3 className="font-[Bricolage_Grotesque] text-lg font-bold text-[#fff8ea]">Quick award</h3></div>
            <p className="mt-1 text-xs leading-relaxed text-[#9fb1a5]">Name the moment. Keep every point meaningful.</p>
            <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Ready line" className="mt-5 w-full rounded-xl border border-[#ead9bb]/16 bg-[#0c2420] px-3 py-3 text-sm text-[#fff8ea] outline-none placeholder:text-[#657d72] focus:border-[#e9c35a]" />
            <button onClick={() => changeScore(sortedTeams[0].id, 200)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#e9c35a] py-3 text-sm font-extrabold text-[#173631] transition hover:brightness-105"><Plus className="h-4 w-4" /> Award 200</button>
            <p className="mt-4 border-t border-[#ead9bb]/10 pt-3 text-[11px] leading-relaxed text-[#88a094]">{notice}</p>
          </aside>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <div className="rounded-[28px] border border-[#ead9bb]/12 bg-[#14312c] p-5">
            <div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#e9c35a]">Today’s momentum</p><h3 className="mt-1 font-[Bricolage_Grotesque] text-xl font-bold text-[#fff8ea]">Recent awards</h3></div><button onClick={() => setNotice("Activity log opened.")} className="flex items-center gap-1 text-xs font-bold text-[#a9c7bc] hover:text-[#fff8ea]">View log <ChevronRight className="h-4 w-4" /></button></div>
            <div className="mt-4 grid gap-2">
              {[["Ladybugs", "+100", "Quiet transition", "4:12 PM", "#f36b65"], ["Jellyfish", "+50", "Helping a new friend", "3:54 PM", "#43c8dc"], ["Tigers", "+200", "Completed the mission", "3:31 PM", "#f3b64d"]].map(([name, points, note, time, color]) => (
                <div key={time} className="flex items-center justify-between rounded-2xl border border-[#ead9bb]/9 bg-[#0e2823] px-4 py-3">
                  <div className="flex items-center gap-3"><span className="h-2 w-2 rounded-full" style={{ background: color }} /><div><p className="text-sm font-bold text-[#eff4ec]">{name} <span className="ml-1 text-[#9db1a6]">· {note}</span></p><p className="mt-0.5 text-[10px] text-[#71887c]">{time}</p></div></div><span className="rounded-lg bg-[#72d9e8]/10 px-2 py-1 text-xs font-bold text-[#72d9e8]">{points}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[28px] border border-[#ead9bb]/12 bg-[#173631] p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[#e9c35a]"><Radio className="h-4 w-4" /> On deck</div>
            <h3 className="mt-3 font-[Bricolage_Grotesque] text-2xl font-bold leading-tight text-[#fff8ea]">The teamwork minute</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#b9c8bc]">One minute to build the tallest paper bridge. Every team gets a turn.</p>
            <button onClick={() => setNotice("Teamwork minute sent to the projector.")} className="mt-5 flex items-center gap-2 rounded-xl border border-[#e9c35a]/35 bg-[#e9c35a]/10 px-3 py-2 text-xs font-bold text-[#f2d77a] hover:bg-[#e9c35a]/20"><Play className="h-3.5 w-3.5 fill-current" /> Send to projector</button>
          </div>
        </section>
      </div>
    </main>
  );
}

export default EdisonDashboardRefined;