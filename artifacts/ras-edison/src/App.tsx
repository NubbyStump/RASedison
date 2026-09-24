// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import PairingPanel from './components/PairingPanel';
import MessageComposer from './components/MessageComposer';
import ProjectorMessage from './components/ProjectorMessage';
import { localCalendarDate, usePairing } from './hooks/usePairing';
import { 
  Trophy, 
  Sparkles, 
  Award, 
  RotateCcw, 
  Plus, 
  Trash2, 
  Tv, 
  Layout, 
  Flame, 
  Calendar, 
  Timer, 
  Zap, 
  Dices,
  PlusCircle,
  ShieldAlert,
  Medal,
  CheckCircle2,
  FileText,
  School,
  ChevronRight,
  Wifi,
  WifiOff,
  MessageSquare
} from 'lucide-react';

const formatLapTime = (minutes, seconds, ms) => {
  const m = String(minutes || 0).padStart(1, '0');
  const s = String(seconds || 0).padStart(2, '0');
  const milli = String(ms || 0).padStart(2, '0');
  return `${m}:${s}.${milli}`;
};

const totalSecondsFromLap = (minutes, seconds, ms) => {
  return (parseInt(minutes) || 0) * 60 + (parseInt(seconds) || 0) + (parseInt(ms) || 0) / 100;
};

const scramblePhrase = (phrase) => {
  const normalizedPhrase = phrase.trim().replace(/\s+/g, ' ');
  return normalizedPhrase
    .split(' ')
    .map((word) => {
      const letters = word.split('');
      for (let i = letters.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [letters[i], letters[j]] = [letters[j], letters[i]];
      }
      return letters.join('');
    })
    .join(' ');
};

const ACTIVITY_MONTH_KEY = 'ras_edison_activities_month_v1';
const pacificMonthKey = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit'
}).format(date);

export default function App() {
  const [activeTab, setActiveTab] = useState('scoreboard');
  const [sessionModal, setSessionModal] = useState('startup');
  const [messageComposerOpen, setMessageComposerOpen] = useState(false);

  // Persistent Group Scores State
  const [localGroups, setLocalGroups] = useState(() => {
    const saved = localStorage.getItem('ras_edison_groups_v5');
    return saved ? JSON.parse(saved) : [
      { id: 'ladybugs', name: 'Ladybugs', score: 0, color: 'from-rose-500 to-red-600', badgeColor: 'bg-rose-500', icon: '🐞' },
      { id: 'jellyfish', name: 'Jellyfish', score: 0, color: 'from-cyan-500 to-blue-600', badgeColor: 'bg-cyan-500', icon: '🪼' },
      { id: 'tigers', name: 'Tigers', score: 0, color: 'from-amber-500 to-orange-600', badgeColor: 'bg-amber-500', icon: '🐯' }
    ];
  });

  const [reasonInput, setReasonInput] = useState({ ladybugs: '', jellyfish: '', tigers: '' });
  const [reasonErrors, setReasonErrors] = useState({});
  
  // Persistent Logs & Records State
  const [localHistory, setLocalHistory] = useState(() => {
    const saved = localStorage.getItem('ras_edison_history_v5');
    return saved ? JSON.parse(saved) : [];
  });

  const [localMonthlyRecords, setLocalMonthlyRecords] = useState(() => {
    const saved = localStorage.getItem('ras_edison_monthly_v5');
    return saved ? JSON.parse(saved) : [];
  });

  const [localLapRecords, setLocalLapRecords] = useState(() => {
    const saved = localStorage.getItem('ras_edison_lap_v5');
    return saved ? JSON.parse(saved) : [];
  });

  const [newLap, setNewLap] = useState({
    runnerName: '',
    group: 'Ladybugs',
    minutes: '0',
    seconds: '',
    ms: '00',
    courseName: 'Edison Field Lap',
    date: localCalendarDate()
  });
  const lapSubmittingRef = useRef(false);
  const [lapSubmitting, setLapSubmitting] = useState(false);

  const [localActivities, setLocalActivities] = useState(() => {
    const saved = localStorage.getItem('ras_edison_activities_v5');
    const currentMonth = pacificMonthKey();
    const savedMonth = localStorage.getItem(ACTIVITY_MONTH_KEY);
    // On the first version with month tracking, mark the current month without
    // deleting the user's legacy library.
    localStorage.setItem(ACTIVITY_MONTH_KEY, currentMonth);
    if (savedMonth && savedMonth !== currentMonth) {
      localStorage.setItem('ras_edison_activities_v5', '[]');
      return [];
    }
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    const migrated = parsed.map((activity) => {
      const oldScramble = activity.scrambledPhrase || '';
      if (activity.type !== 'Super Scramble' || !/\s{2,}/.test(oldScramble)) {
        return activity;
      }
      return {
        ...activity,
        scrambledPhrase: scramblePhrase(activity.solvedPhrase || activity.title)
      };
    });

    if (migrated.some((activity, index) => activity !== parsed[index])) {
      localStorage.setItem('ras_edison_activities_v5', JSON.stringify(migrated));
    }
    return migrated;
  });

  const [filterType, setFilterType] = useState('Either');
  const [filterLocation, setFilterLocation] = useState('Either');
  const [currentActivity, setCurrentActivity] = useState(() => localActivities[0] || null);

  // Custom Activity Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newActivity, setNewActivity] = useState({
    phrase: '',
    points: 600
  });
  const activitySubmittingRef = useRef(false);
  const [activitySubmitting, setActivitySubmitting] = useState(false);

  const pairing = usePairing();
  const isLiveOwner = pairing.session?.role === 'owner';
  const canManageActivities = !pairing.isPaired || isLiveOwner;
  const groups = pairing.session?.state.groups ?? localGroups;
  const ledGroup = pairing.currentGroupId
    ? groups.find((group) => group.id === pairing.currentGroupId) || null
    : null;
  const pointsGroups = ledGroup
    ? [ledGroup, ...groups.filter((group) => group.id !== ledGroup.id)]
    : groups;
  const history = pairing.session?.state.history ?? localHistory;
  const monthlyRecords = pairing.session?.state.monthlyRecords ?? localMonthlyRecords;
  const lapRecords = pairing.session?.state.lapRecords ?? localLapRecords;
  const activities = pairing.session?.state.activities ?? localActivities;
  const projectorMessages = pairing.session?.projectorMessages ?? [];
  const localSnapshot = () => ({
    groups: localGroups,
    history: localHistory,
    lapRecords: localLapRecords,
    monthlyRecords: localMonthlyRecords,
    activities: localActivities
  });

  const saveLocalBackup = () => {
    const { activities: _activities, ...backup } = localSnapshot();
    localStorage.setItem('ras_edison_pairing_backup_v1', JSON.stringify(backup));
  };

  const handleCreatePairing = async (name, password) => {
    saveLocalBackup();
    try {
      await pairing.create(name, password, {
        ...localSnapshot(),
        groups: localGroups.map(group => ({ ...group, score: 0 })),
        history: [],
        lapRecords: [],
        monthlyRecords: [],
      });
      setSessionModal(null);
      return true;
    } catch {
      return false;
    }
  };

  const handleJoinPairing = async (name, code, password, groupId) => {
    saveLocalBackup();
    try {
      await pairing.join(name, code, password, groupId);
      setSessionModal(null);
      return true;
    } catch {
      return false;
    }
  };

  const restoreLocalBackup = () => {
    const rawBackup = localStorage.getItem('ras_edison_pairing_backup_v1');
    if (rawBackup) {
      try {
        const backup = JSON.parse(rawBackup);
        if (Array.isArray(backup.groups)) setLocalGroups(backup.groups);
        if (Array.isArray(backup.history)) setLocalHistory(backup.history);
        if (Array.isArray(backup.lapRecords)) setLocalLapRecords(backup.lapRecords);
        if (Array.isArray(backup.monthlyRecords)) setLocalMonthlyRecords(backup.monthlyRecords);
        // Activities remain in their own month-scoped local store. Never restore
        // this field from a legacy backup, which could revive an expired library.
      } finally {
        localStorage.removeItem('ras_edison_pairing_backup_v1');
      }
    }
  };

  const handleLeavePairing = async () => {
    try {
      await pairing.leave();
    } catch {
      return;
    }
    restoreLocalBackup();
    setSessionModal(null);
  };

  const handleEndPairing = async () => {
    try {
      await pairing.end();
    } catch {
      return;
    }
    restoreLocalBackup();
    setSessionModal('startup');
  };

  const handleContinueOffline = async () => {
    if (pairing.isPaired) {
      if (!window.confirm('Leave the live session and continue with this device’s restored offline data?')) return;
      await handleLeavePairing();
      return;
    }
    setSessionModal(null);
  };

  const handleUpdateAssignment = async (groupId) => {
    try {
      await pairing.updateAssignment(groupId);
    } catch {}
  };

  const handleRemoveMember = async (memberId) => {
    try {
      await pairing.removeMember(memberId);
    } catch {}
  };

  useEffect(() => {
    if (!pairing.session || pairing.status !== 'connected') return;
    setSessionModal(pairing.needsDailyAssignment ? 'controls' : null);
  }, [pairing.session?.memberId, pairing.status, pairing.needsDailyAssignment]);

  useEffect(() => {
    if (!pairing.isPaired && pairing.error) setSessionModal('startup');
  }, [pairing.isPaired, pairing.error]);

  useEffect(() => {
    if (!pairing.isPaired) setMessageComposerOpen(false);
  }, [pairing.isPaired]);

  const lapDefaultGroupRef = useRef('Ladybugs');
  useEffect(() => {
    const nextDefault = ledGroup?.name || 'Ladybugs';
    const previousDefault = lapDefaultGroupRef.current;
    setNewLap((current) => (
      current.group === previousDefault
        ? { ...current, group: nextDefault }
        : current
    ));
    lapDefaultGroupRef.current = nextDefault;
  }, [ledGroup?.id, ledGroup?.name]);

  useEffect(() => {
    localStorage.setItem('ras_edison_groups_v5', JSON.stringify(localGroups));
  }, [localGroups]);

  useEffect(() => {
    localStorage.setItem('ras_edison_history_v5', JSON.stringify(localHistory));
  }, [localHistory]);

  useEffect(() => {
    localStorage.setItem('ras_edison_monthly_v5', JSON.stringify(localMonthlyRecords));
  }, [localMonthlyRecords]);

  useEffect(() => {
    localStorage.setItem('ras_edison_lap_v5', JSON.stringify(localLapRecords));
  }, [localLapRecords]);

  useEffect(() => {
    localStorage.setItem('ras_edison_activities_v5', JSON.stringify(localActivities));
  }, [localActivities]);

  useEffect(() => {
    const rollLocalActivities = () => {
      const currentMonth = pacificMonthKey();
      const savedMonth = localStorage.getItem(ACTIVITY_MONTH_KEY);
      if (!savedMonth) {
        localStorage.setItem(ACTIVITY_MONTH_KEY, currentMonth);
      } else if (savedMonth !== currentMonth) {
        localStorage.setItem(ACTIVITY_MONTH_KEY, currentMonth);
        setLocalActivities([]);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') rollLocalActivities();
    };
    const timer = window.setInterval(rollLocalActivities, 60_000);
    window.addEventListener('focus', rollLocalActivities);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', rollLocalActivities);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    setCurrentActivity((current) => {
      if (activities.length === 0) return null;
      if (!current) return activities[0];
      return activities.find((activity) => activity.id === current.id) || activities[0];
    });
  }, [activities]);

  // Calculation Helpers
  const getDaysLeftInMonth = () => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return lastDay.getDate() - now.getDate();
  };

  const currentMonthName = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  // Month's Fastest Lap calculation
  const currentMonthLaps = lapRecords.filter(r => r.monthYear === currentMonthName);
  const fastestLapRecord = currentMonthLaps.length > 0 
    ? [...currentMonthLaps].sort((a, b) => a.totalSeconds - b.totalSeconds)[0]
    : null;

  // Leader Calculation
  const maxScore = Math.max(...groups.map(g => g.score));
  const leaders = groups.filter(g => g.score === maxScore && maxScore > 0);
  const leadingNames = leaders.map(l => l.name);

  const handleAddPoints = async (groupId, amount) => {
    const enteredReason = reasonInput[groupId]?.trim();
    if (pairing.session?.role === 'counselor' && amount > 0 && !enteredReason) {
      setReasonErrors(prev => ({ ...prev, [groupId]: 'Enter a reason before adding points.' }));
      document.getElementById(`points-reason-${groupId}`)?.focus();
      return;
    }
    setReasonErrors(prev => ({ ...prev, [groupId]: '' }));
    const reason = enteredReason || (amount > 0 ? 'Behavior / Task Reward' : 'Adjustment');
    const targetGroup = groups.find(g => g.id === groupId);

    if (pairing.isPaired) {
      try {
        await pairing.command({ type: 'addPoints', payload: { groupId, amount, reason } });
        setReasonInput(prev => ({ ...prev, [groupId]: '' }));
      } catch {}
      return;
    }

    setLocalGroups(prev => prev.map(g => g.id === groupId ? { ...g, score: Math.max(0, g.score + amount) } : g));

    const newLog = {
      id: Date.now().toString(),
      groupId,
      groupName: targetGroup.name,
      amount,
      reason,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setLocalHistory(prev => [newLog, ...prev.slice(0, 35)]);
    setReasonInput(prev => ({ ...prev, [groupId]: '' }));
  };

  const handleUndo = async (logId) => {
    const itemToUndo = history.find(h => h.id === logId);
    if (!itemToUndo) return;

    if (pairing.isPaired) {
      try {
        await pairing.command({ type: 'undo', payload: { logId } });
      } catch {}
      return;
    }

    setLocalGroups(prev => prev.map(g => {
      if (g.id === itemToUndo.groupId) {
        return { ...g, score: Math.max(0, g.score - itemToUndo.amount) };
      }
      return g;
    }));

    setLocalHistory(prev => prev.filter(h => h.id !== logId));
  };

  const handleResetMonth = async () => {
    if (pairing.isPaired) {
      try {
        await pairing.command({ type: 'resetMonth', payload: { month: currentMonthName } });
      } catch {}
      return;
    }
    const winners = groups.filter(g => g.score === maxScore && maxScore > 0).map(g => g.name);
    
    const newRecord = {
      id: Date.now().toString(),
      month: currentMonthName,
      winner: winners.length > 0 ? winners.join(' & ') : 'No winner',
      scores: groups.map(g => `${g.name}: ${g.score} pts`).join(' | '),
      rewardClaimed: false
    };

    setLocalMonthlyRecords(prev => [newRecord, ...prev]);
    setLocalGroups(prev => prev.map(g => ({ ...g, score: 0 })));
    setLocalHistory([]);
  };

  const handleSaveLap = async (e) => {
    e.preventDefault();
    if (!newLap.runnerName || !newLap.seconds) return;
    if (pairing.isPaired && lapSubmittingRef.current) return;

    const m = parseInt(newLap.minutes) || 0;
    const s = parseInt(newLap.seconds) || 0;
    const ms = parseInt(newLap.ms) || 0;

    const totalSecs = totalSecondsFromLap(m, s, ms);
    const formatted = formatLapTime(m, s, ms);

    const record = {
      id: Date.now().toString(),
      runnerName: newLap.runnerName.trim(),
      group: newLap.group,
      minutes: m,
      seconds: s,
      ms,
      timeFormatted: formatted,
      totalSeconds: totalSecs,
      courseName: newLap.courseName.trim() || 'Edison Field Lap',
      date: newLap.date || localCalendarDate(),
      monthYear: currentMonthName
    };

    if (pairing.isPaired) {
      lapSubmittingRef.current = true;
      setLapSubmitting(true);
      try {
        await pairing.command({ type: 'saveLap', payload: { record } });
      } catch {
        return;
      } finally {
        lapSubmittingRef.current = false;
        setLapSubmitting(false);
      }
    } else {
      setLocalLapRecords(prev => [record, ...prev]);
    }
    setNewLap({
      runnerName: '',
      group: ledGroup?.name || 'Ladybugs',
      minutes: '0',
      seconds: '',
      ms: '00',
      courseName: 'Edison Field Lap',
      date: localCalendarDate()
    });
  };

  const handleDeleteLap = async (id) => {
    if (pairing.isPaired) {
      try {
        await pairing.command({ type: 'deleteLap', payload: { id } });
      } catch {}
      return;
    }
    setLocalLapRecords(prev => prev.filter(r => r.id !== id));
  };

  const getRandomActivity = () => {
    if (activities.length === 0) return;

    let filtered = activities.filter(act => {
      const matchType = filterType === 'Either' || act.type === filterType;
      const matchLoc = filterLocation === 'Either' || act.location === filterLocation;
      return matchType && matchLoc;
    });

    if (filtered.length === 0) filtered = activities;

    const randomIndex = Math.floor(Math.random() * filtered.length);
    setCurrentActivity(filtered[randomIndex]);
  };

  const handleDeleteActivity = async (activityId) => {
    const activityToDelete = activities.find(activity => activity.id === activityId);
    if (!activityToDelete) return;
    if (!window.confirm(`Delete "${activityToDelete.title}"?`)) return;

    if (pairing.isPaired) {
      try {
        await pairing.command({ type: 'deleteActivity', payload: { id: activityId } });
      } catch {}
      return;
    }
    setLocalActivities(prev => prev.filter(activity => activity.id !== activityId));
  };

  const handleClearActivities = async () => {
    if (activities.length === 0) return;
    if (!window.confirm('Clear all missions and super scrambles? This cannot be undone.')) return;

    if (pairing.isPaired) {
      try {
        await pairing.command({ type: 'clearActivities', payload: {} });
      } catch {}
      return;
    }
    setLocalActivities([]);
  };

  const handleSaveCustomActivity = async (e) => {
    e.preventDefault();
    const phrase = newActivity.phrase?.trim();
    if (!phrase) return;
    if (pairing.isPaired && activitySubmittingRef.current) return;

    const created = {
      id: Date.now().toString(),
      title: phrase,
      type: 'Super Scramble',
      points: Number(newActivity.points) || 600,
      scrambledPhrase: scramblePhrase(phrase),
      solvedPhrase: phrase.toUpperCase(),
      hint: 'Rearrange the letters to reveal the phrase.',
      lesson: '',
      location: 'Indoor',
      materials: 'Whiteboard & Marker',
      steps: 'Write the scrambled phrase on the whiteboard. The first group to solve it wins the points!',
      harder: '',
      safety: ''
    };

    if (pairing.isPaired) {
      activitySubmittingRef.current = true;
      setActivitySubmitting(true);
      try {
        const nextSession = await pairing.command({ type: 'addActivity', payload: { activity: created } });
        const savedActivity = nextSession.state.activities.find((activity) =>
          activity.title === created.title &&
          activity.solvedPhrase === created.solvedPhrase &&
          activity.scrambledPhrase === created.scrambledPhrase
        ) || nextSession.state.activities[0];
        setCurrentActivity(savedActivity || null);
      } catch {
        return;
      } finally {
        activitySubmittingRef.current = false;
        setActivitySubmitting(false);
      }
    } else {
      setLocalActivities(prev => [created, ...prev]);
      setCurrentActivity(created);
    }
    setShowAddModal(false);
    setNewActivity({ phrase: '', points: 600 });
  };


  if (activeTab === 'projector') {
    return (
      <div className="min-h-[100dvh] bg-slate-950 text-white flex flex-col justify-between p-6 md:p-10 font-sans relative overflow-hidden select-none">
        <ProjectorMessage roomId={pairing.session?.roomId ?? null} messages={projectorMessages} />
        <MessageComposer
          open={messageComposerOpen}
          connected={pairing.status === 'connected'}
          onClose={() => setMessageComposerOpen(false)}
          onSend={pairing.sendMessage}
        />
        <PairingPanel
          open={Boolean(sessionModal)}
          mode={sessionModal === 'controls' ? 'controls' : 'startup'}
          session={pairing.session}
          status={pairing.status}
          error={pairing.error}
          busy={pairing.busy}
          today={pairing.today}
          needsDailyAssignment={pairing.needsDailyAssignment}
          onClose={() => setSessionModal(null)}
          onOffline={handleContinueOffline}
          onCreate={handleCreatePairing}
          onJoin={handleJoinPairing}
          onUpdateAssignment={handleUpdateAssignment}
          onRemoveMember={handleRemoveMember}
          onLeave={handleLeavePairing}
          onEnd={handleEndPairing}
        />
        {pairing.error && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-xl bg-red-950 border border-red-500/60 text-red-100 px-4 py-3 rounded-xl text-sm font-bold shadow-2xl">
            Pairing error: {pairing.error}
          </div>
        )}
        {/* Slime Ambient Glow Backgrounds */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-emerald-500/10 blur-[200px] rounded-full pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-[600px] h-[600px] bg-amber-500/10 blur-[180px] rounded-full pointer-events-none" />

        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 z-10">
          <button 
            onClick={() => setActiveTab('scoreboard')}
            className="flex items-center gap-2 bg-slate-800/90 hover:bg-slate-700 text-slate-200 px-4 md:px-5 py-3 rounded-2xl font-bold transition border border-slate-700 shadow-xl text-sm md:text-lg"
          >
            <Layout className="w-5 h-5 md:w-6 md:h-6 shrink-0" /> <span className="hidden sm:inline">Exit Projector View</span><span className="sm:hidden">Exit View</span>
          </button>
          
          <div className="flex flex-wrap items-center justify-end gap-3">
            {pairing.isPaired && (
              <button
                type="button"
                onClick={() => setMessageComposerOpen(true)}
                className="flex items-center gap-2 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 px-4 py-3 rounded-2xl font-bold transition border border-cyan-400/40 shadow-xl text-sm"
              >
                <MessageSquare className="w-5 h-5 shrink-0" /> <span className="hidden sm:inline">Messages</span>
              </button>
            )}
            <div className="hidden md:flex items-center gap-3 bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-6 py-3 rounded-2xl font-semibold shadow-inner text-base md:text-lg">
              <Calendar className="w-6 h-6 text-emerald-400" />
              <span>{getDaysLeftInMonth()} Days Remaining in {currentMonthName}</span>
            </div>
          </div>
        </div>

        {/* Big Scoreboard School Banner */}
        <div className="text-center my-4 z-10">
          <div className="inline-flex items-center gap-3 bg-gradient-to-r from-emerald-500 via-teal-400 to-green-400 text-slate-950 font-black tracking-widest px-6 py-2 rounded-full uppercase text-sm mb-3 shadow-lg shadow-emerald-500/20">
            <School className="w-5 h-5 fill-current" /> Right At School Edison Language Academy Leaderboard
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-400 tracking-tight">
            SLIME & PRIZE BOX LEADERBOARD
          </h1>
        </div>

        {/* Group Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 my-auto z-10 max-w-7xl mx-auto w-full">
          {groups.map((group) => {
            const isLeading = group.score === maxScore && maxScore > 0;
            return (
              <div 
                key={group.id} 
                className={`relative rounded-3xl p-8 text-center flex flex-col justify-between transition-all duration-500 ${
                  isLeading 
                    ? 'bg-slate-900/95 border-4 border-emerald-400 shadow-[0_0_80px_rgba(16,185,129,0.4)] scale-105' 
                    : 'bg-slate-900/60 border-2 border-slate-800 opacity-90'
                }`}
              >
                {/* Slime Drip Top Accent */}
                {isLeading && (
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-emerald-400 text-slate-950 px-6 py-1.5 rounded-full font-black text-base md:text-lg tracking-wider flex items-center gap-2 shadow-lg animate-bounce">
                    <Sparkles className="w-5 h-5 fill-current" /> 👑 1ST PLACE LEADER
                  </div>
                )}

                <div className="mt-2">
                  <div className={`w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br ${group.color} flex items-center justify-center text-4xl shadow-xl mb-3`}>
                    {group.icon}
                  </div>
                  <h2 className="text-4xl font-black text-white tracking-wide">{group.name}</h2>
                </div>

                {/* Giant Score Display */}
                <div className="my-6">
                  <div className={`text-8xl md:text-9xl font-black ${isLeading ? 'text-emerald-400 drop-shadow-[0_0_35px_rgba(52,211,153,0.6)]' : 'text-slate-100'}`}>
                    {group.score}
                  </div>
                  <div className="text-slate-400 uppercase tracking-widest text-xs md:text-sm font-semibold mt-2">Group Points</div>
                </div>

                <div className="pt-4 border-t border-slate-800 text-slate-400 text-base font-medium">
                  {isLeading ? '🔥 Winning Slime & Prize Box!' : `${maxScore - group.score} points behind leader`}
                </div>
              </div>
            );
          })}
        </div>

        {/* Projector Footer Record */}
        <div className="max-w-4xl mx-auto w-full z-10 mt-4">
          <div className="bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border-2 border-amber-500/50 rounded-3xl p-5 flex flex-col md:flex-row items-center justify-between gap-6 shadow-[0_0_40px_rgba(245,158,11,0.2)]">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-2xl shadow-lg shrink-0">
                ⚡
              </div>
              <div>
                <div className="flex items-center gap-2 text-amber-400 font-extrabold uppercase text-xs tracking-widest mb-1">
                  <Medal className="w-4 h-4" /> Month's Fastest Lap Record
                </div>
                <h3 className="text-2xl font-black text-white">
                  {fastestLapRecord ? fastestLapRecord.runnerName : 'No Record Set Yet'}
                </h3>
              </div>
            </div>

            {fastestLapRecord && (
              <div className="bg-amber-500 text-slate-950 px-6 py-2.5 rounded-2xl font-black text-3xl shadow-xl flex items-center gap-3">
                <Timer className="w-7 h-7" />
                <span>{fastestLapRecord.timeFormatted}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-900 text-slate-100 flex flex-col font-sans pb-12">
      {/* Header Bar */}
      <header className="bg-slate-800/90 backdrop-blur border-b border-slate-700/80 sticky top-0 z-30 px-4 py-3">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-green-400 flex items-center justify-center shadow-lg text-slate-950 shrink-0">
              <svg viewBox="0 0 64 64" role="img" aria-label="Edison eagle" className="w-8 h-8 fill-current"><path d="M57 14c-9 1-16 5-21 11-4-7-11-12-22-14 3 5 7 9 12 12-6-1-12-1-19 1 7 6 14 10 22 11-4 5-8 10-10 17l13-9 13 9c-2-7-5-12-9-17 9-2 16-7 21-14-6 0-12 1-17 3 6-3 12-6 17-10Z"/><circle cx="38" cy="25" r="2.5" className="fill-slate-900"/></svg>
            </div>
            <div>
              {/* Explicit School Title Header */}
              <div className="text-[10px] uppercase font-black tracking-widest text-emerald-400 flex items-center gap-1">
                <School className="w-3 h-3" /> Right At School
              </div>
              <h1 className="font-black text-base md:text-lg text-white tracking-tight leading-tight">
                Edison Language Academy
              </h1>
            </div>
          </div>

          {/* Nav Tabs */}
          <div className="flex items-center bg-slate-900 p-1 rounded-2xl border border-slate-700 overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab('scoreboard')}
              className={`flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl font-bold text-xs md:text-sm transition shrink-0 ${
                activeTab === 'scoreboard' ? 'bg-emerald-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Trophy className="w-4 h-4" /> Points
            </button>
            <button
              onClick={() => setActiveTab('generator')}
              className={`flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl font-bold text-xs md:text-sm transition shrink-0 ${
                activeTab === 'generator' ? 'bg-amber-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" /> Scrambles
            </button>
            <button
              onClick={() => setActiveTab('fastest_lap')}
              className={`flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl font-bold text-xs md:text-sm transition shrink-0 ${
                activeTab === 'fastest_lap' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Timer className="w-4 h-4" /> Laps
            </button>
            <button
              onClick={() => setSessionModal(pairing.isPaired ? 'controls' : 'startup')}
              className={`flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl font-bold text-xs md:text-sm transition shrink-0 border ${pairing.isPaired ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'text-slate-400 border-slate-700 hover:text-white'}`}
              aria-label="Open live session controls"
            >
              {pairing.isPaired ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              {pairing.isPaired ? (pairing.status === 'connected' ? 'Live' : pairing.status === 'connecting' ? 'Connecting' : 'Reconnecting') : 'Offline'}
            </button>
            <button
              onClick={() => setActiveTab('projector')}
              className="flex items-center gap-1 px-2.5 py-2.5 min-h-[44px] rounded-xl font-bold text-xs text-cyan-400 hover:bg-cyan-950/50 transition border border-cyan-500/20 ml-1 shrink-0"
            >
              <Tv className="w-4 h-4" /> Projector
            </button>
            {pairing.isPaired && (
              <button
                type="button"
                onClick={() => setMessageComposerOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl font-bold text-xs md:text-sm transition shrink-0 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-950/50"
                aria-label="Compose projector message"
              >
                <MessageSquare className="w-4 h-4" /> Messages
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto w-full px-4 pt-6 flex-1">
        {pairing.error && (
          <div className="mb-5 bg-red-950/80 border border-red-500/50 text-red-100 px-4 py-3 rounded-2xl text-sm font-bold shadow-lg">
            Pairing error: {pairing.error}
          </div>
        )}
        {/* TAB 1: POINTS TRACKER */}
        {activeTab === 'scoreboard' && (
          <div className="space-y-6">
            {ledGroup && (
              <div data-testid="banner-my-group" className="bg-cyan-500/10 border border-cyan-400/40 rounded-2xl px-5 py-3 flex items-center gap-3">
                <span className="text-2xl">{ledGroup.icon}</span>
                <div>
                  <div className="text-[11px] font-black uppercase tracking-widest text-cyan-300">Your Assigned Group</div>
                  <div className="font-black text-white">{ledGroup.name} — personalized view</div>
                </div>
              </div>
            )}
            {/* Status Leader Banner */}
            <div className="bg-gradient-to-r from-slate-800 via-slate-800 to-slate-800/90 border border-slate-700/80 rounded-3xl p-5 shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs tracking-wider uppercase mb-1">
                    <Sparkles className="w-4 h-4" /> Edison Leaderboard Status
                  </div>
                  <h2 className="text-xl md:text-2xl font-black text-white">
                    {leaders.length > 0 ? (
                      leaders.length === 1 ? (
                        <span><span className="text-emerald-400">{leadingNames[0]}</span> lead with <span className="text-emerald-400">{maxScore} pts</span>! 👑</span>
                      ) : (
                        <span>Tied in 1st: <span className="text-emerald-400">{leadingNames.join(' & ')}</span> ({maxScore} pts)!</span>
                      )
                    ) : (
                      'Scores reset! Earn points by hundreds.'
                    )}
                  </h2>
                </div>

                <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-700 px-4 py-2.5 rounded-2xl self-start md:self-auto">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                  <div>
                    <div className="text-xs text-slate-400 font-medium">Month Ends In</div>
                    <div className="text-sm font-extrabold text-white">{getDaysLeftInMonth()} Days Remaining</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Score Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {pointsGroups.map((group) => {
                const isLeading = group.score === maxScore && maxScore > 0;
                const isMyGroup = group.id === ledGroup?.id;
                return (
                  <div 
                    key={group.id} 
                    className={`bg-slate-800/90 rounded-3xl p-5 border transition-all duration-300 relative flex flex-col justify-between shadow-lg ${
                      isMyGroup
                        ? 'border-cyan-400/90 shadow-[0_0_35px_rgba(34,211,238,0.22)] ring-2 ring-cyan-400/30'
                        : isLeading ? 'border-emerald-400/80 shadow-[0_0_30px_rgba(16,185,129,0.2)] ring-2 ring-emerald-400/20' : 'border-slate-700/70'
                    }`}
                  >
                    {isMyGroup && (
                      <div className="absolute -top-3.5 left-4 bg-cyan-400 text-slate-950 font-black text-xs px-3 py-1 rounded-full shadow-md uppercase tracking-wider">
                        Your Assigned Group
                      </div>
                    )}
                    {isLeading && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-emerald-400 text-slate-950 font-black text-xs px-4 py-1 rounded-full shadow-md flex items-center gap-1.5 uppercase tracking-wider">
                        <Flame className="w-3.5 h-3.5 fill-current" /> Slime Leader
                      </div>
                    )}

                    <div>
                      {/* Header & Score */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${group.color} flex items-center justify-center text-2xl shadow-md`}>
                            {group.icon}
                          </div>
                          <div>
                            <h3 className="font-extrabold text-xl text-white">{group.name}</h3>
                            <span className="text-xs text-slate-400 font-medium">Group Score</span>
                          </div>
                        </div>

                        <div className="text-3xl font-black text-white bg-slate-900/80 px-4 py-2 rounded-2xl border border-slate-700/60">
                          {group.score}
                        </div>
                      </div>

                      {/* Point reason */}
                      <div className="mb-4">
                        <label htmlFor={`points-reason-${group.id}`} className="block text-xs text-slate-300 mb-1">
                          {pairing.session?.role === 'counselor' ? 'Reason (required to add points)' : 'Reason (optional)'}
                        </label>
                        <input
                          id={`points-reason-${group.id}`}
                          type="text"
                          maxLength={500}
                          aria-invalid={Boolean(reasonErrors[group.id])}
                          aria-describedby={reasonErrors[group.id] ? `points-reason-error-${group.id}` : undefined}
                          placeholder="Reason (e.g. Quietest line)..."
                          value={reasonInput[group.id]}
                          onChange={(e) => {
                            setReasonInput({ ...reasonInput, [group.id]: e.target.value });
                            setReasonErrors(prev => ({ ...prev, [group.id]: '' }));
                          }}
                          className="w-full bg-slate-900/80 border border-slate-700 text-xs rounded-xl px-3.5 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                        />
                        {reasonErrors[group.id] && (
                          <p id={`points-reason-error-${group.id}`} role="alert" className="text-xs text-red-300 mt-1">
                            {reasonErrors[group.id]}
                          </p>
                        )}
                      </div>

                      {/* Point Action Buttons in Hundreds Range */}
                      <div className="space-y-2 mb-2">
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            onClick={() => handleAddPoints(group.id, 10)}
                            aria-label={`Add 10 points to ${group.name}`}
                            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl py-2 font-black text-xs transition active:scale-95 min-h-[44px]"
                          >
                            +10
                          </button>
                          <button
                            onClick={() => handleAddPoints(group.id, 50)}
                            aria-label={`Add 50 points to ${group.name}`}
                            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-xl py-2 font-black text-xs transition active:scale-95 min-h-[44px]"
                          >
                            +50
                          </button>
                          <button
                            onClick={() => handleAddPoints(group.id, 100)}
                            aria-label={`Add 100 points to ${group.name}`}
                            className="bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-200 border border-emerald-500/50 rounded-xl py-2 font-black text-xs transition active:scale-95 min-h-[44px]"
                          >
                            +100
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            onClick={() => handleAddPoints(group.id, 200)}
                            aria-label={`Add 200 points to ${group.name}`}
                            className="bg-emerald-500 text-slate-950 hover:bg-emerald-400 rounded-xl py-2 font-black text-xs transition active:scale-95 shadow-md min-h-[44px]"
                          >
                            +200
                          </button>
                          <button
                            onClick={() => handleAddPoints(group.id, 500)}
                            aria-label={`Add 500 points to ${group.name}`}
                            className="bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 font-black rounded-xl py-2 text-xs transition active:scale-95 shadow-md min-h-[44px]"
                          >
                            +500
                          </button>
                          <button
                            onClick={() => handleAddPoints(group.id, 600)}
                            aria-label={`Add 600 points to ${group.name}`}
                            className="bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 font-black rounded-xl py-2 text-xs transition active:scale-95 shadow-md flex items-center justify-center gap-1 min-h-[44px]"
                          >
                            <Sparkles className="w-3.5 h-3.5" /> +600
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 pt-1">
                          <button
                            onClick={() => handleAddPoints(group.id, -10)}
                            aria-label={`Subtract 10 points from ${group.name}`}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl py-1.5 font-bold text-xs transition active:scale-95 min-h-[44px]"
                          >
                            -10
                          </button>
                          <button
                            onClick={() => handleAddPoints(group.id, -50)}
                            aria-label={`Subtract 50 points from ${group.name}`}
                            className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 rounded-xl py-1.5 font-bold text-xs transition active:scale-95 min-h-[44px]"
                          >
                            -50
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recent History & Monthly Log */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
              <div className="lg:col-span-2 bg-slate-800/80 rounded-3xl p-5 border border-slate-700/80 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-extrabold text-lg text-white flex items-center gap-2">
                    <RotateCcw className="w-5 h-5 text-emerald-400" /> Recent Points Entry Log
                  </h3>
                  <span className="text-xs text-slate-400">Single-tap Undo available</span>
                </div>

                {history.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 font-medium text-sm border border-dashed border-slate-700/60 rounded-2xl">
                    No points recorded yet today.
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {history.map((item) => (
                      <div key={item.id} className="bg-slate-900/70 border border-slate-700/60 rounded-2xl p-3 flex items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-3">
                          <span className={`font-black px-2.5 py-1 rounded-xl text-xs ${
                            item.amount > 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
                          }`}>
                            {item.amount > 0 ? `+${item.amount}` : item.amount}
                          </span>
                          <div>
                            <span className="font-bold text-white">{item.groupName}</span>
                            <span className="text-slate-400 mx-1.5">•</span>
                            <span className="text-slate-300 italic">"{item.reason}"</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleUndo(item.id)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition border border-slate-600/50"
                        >
                          Undo
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reset Month & Archive */}
              <div className="bg-slate-800/80 rounded-3xl p-5 border border-slate-700/80 shadow-lg flex flex-col justify-between">
                <div>
                  <h3 className="font-extrabold text-lg text-white mb-2 flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-400" /> Monthly Slime Champions
                  </h3>
                  <div className="space-y-3 max-h-[180px] overflow-y-auto mb-4">
                    {monthlyRecords.length === 0 ? (
                      <div className="text-xs text-slate-500 text-center py-4 border border-dashed border-slate-700/60 rounded-xl">
                        No past month winners archived yet.
                      </div>
                    ) : (
                      monthlyRecords.map((rec) => (
                        <div key={rec.id} className="bg-slate-900/80 border border-slate-700/60 rounded-2xl p-3 text-xs">
                          <div className="flex items-center justify-between font-bold text-slate-200 mb-1">
                            <span>{rec.month}</span>
                            <span className="text-emerald-400">Winner: {rec.winner}</span>
                          </div>
                          <div className="text-slate-400 text-[11px] mb-2">{rec.scores}</div>
                            <label className={`flex items-center gap-2 text-slate-300 font-semibold ${pairing.isPaired && !isLiveOwner ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                            <input
                              type="checkbox"
                              checked={rec.rewardClaimed}
                                disabled={pairing.isPaired && !isLiveOwner}
                              onChange={async () => {
                                if (pairing.isPaired) {
                                  try {
                                    await pairing.command({ type: 'toggleReward', payload: { id: rec.id } });
                                  } catch {}
                                } else {
                                  setLocalMonthlyRecords(prev => prev.map(r => r.id === rec.id ? { ...r, rewardClaimed: !r.rewardClaimed } : r));
                                }
                              }}
                              className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
                            />
                            <span>Prize & Slime Done</span>
                          </label>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {(!pairing.isPaired || isLiveOwner) && (
                  <button
                    onClick={handleResetMonth}
                    className="w-full bg-slate-900 hover:bg-red-950/40 text-red-400 hover:text-red-300 border border-slate-700 hover:border-red-500/40 rounded-2xl py-3 text-xs font-extrabold transition flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" /> Reset Scores For New Month
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: WHITEBOARD SUPER SCRAMBLES & MISSIONS */}
        {activeTab === 'generator' && (
          <div className="space-y-6 max-w-4xl mx-auto">
            {/* Super Scramble Definition Card */}
            <div className="bg-gradient-to-r from-amber-950/70 via-slate-800 to-slate-800 border-2 border-amber-500/40 rounded-3xl p-5 shadow-xl">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-xl shrink-0 mt-1">
                  ✏️
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-white">Whiteboard Super Scramble Guide</h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Write the scrambled phrase big on the classroom **whiteboard**. Students work in group teams to decipher the character lesson phrase (e.g. "COOPERATION IS KEY") to earn **200 to 600 points**!
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/80 rounded-3xl p-6 border border-slate-700/80 shadow-lg">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-2xl font-black text-white flex items-center gap-2">
                    <FileText className="w-6 h-6 text-amber-400" /> Scramble & Mission Generator
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Pick a phrase for the whiteboard or a physical group mission.
                    Missions and scrambles clear automatically each month on the school’s Pacific time. Scores, laps, and history are kept.
                  </p>
                </div>

                {canManageActivities && <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2.5 rounded-2xl font-extrabold text-sm transition flex items-center gap-2 shadow-md"
                  >
                    <PlusCircle className="w-4 h-4" /> Add Custom Scramble
                  </button>
                  <button
                    onClick={handleClearActivities}
                    disabled={activities.length === 0}
                    className="bg-red-500/10 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40 text-red-300 border border-red-500/30 px-4 py-2.5 rounded-2xl font-extrabold text-sm transition flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Clear All
                  </button>
                </div>}
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900/80 p-4 rounded-2xl border border-slate-700/60 mb-6">
                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1">Type</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                  >
                    <option value="Either">Either (All)</option>
                    <option value="Super Scramble">Super Scramble (Whiteboard)</option>
                    <option value="Mission">Mission (Physical Goal)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 block mb-1">Location</label>
                  <select
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
                  >
                    <option value="Either">Either (Indoor/Outdoor)</option>
                    <option value="Indoor">Indoor (Gym/Cafeteria)</option>
                    <option value="Outdoor">Outdoor (Playground)</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={getRandomActivity}
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black py-2.5 px-4 rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-lg active:scale-95"
                  >
                    <Dices className="w-5 h-5" /> Shuffle New Scramble
                  </button>
                </div>
              </div>

              {/* Display Activity */}
              {currentActivity && (
                <div className="bg-slate-900 border-2 border-amber-500/60 rounded-3xl p-6 relative overflow-hidden shadow-2xl space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {currentActivity.type}
                      </span>
                      <span className="bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1 rounded-full text-xs font-bold">
                        📍 {currentActivity.location}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="bg-emerald-500 text-slate-950 font-black px-4 py-1.5 rounded-xl text-sm shadow-md">
                        🏆 Worth {currentActivity.points || 600} Points
                      </div>
                      {canManageActivities && <button
                        type="button"
                        onClick={() => handleDeleteActivity(currentActivity.id)}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 px-3 py-1.5 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>}
                    </div>
                  </div>

                  <h3 className="text-2xl font-black text-white">{currentActivity.title}</h3>

                  {/* Scramble Specific Box */}
                  {currentActivity.type === 'Super Scramble' && (
                    <div className="bg-slate-800/90 border-2 border-slate-700 rounded-2xl p-4 space-y-3">
                      <div className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                        ✏️ WRITE THIS PHRASE ON THE WHITEBOARD:
                      </div>
                      <div className="bg-slate-950 text-emerald-400 font-mono font-black text-lg md:text-xl p-3.5 rounded-xl border border-slate-800 text-center tracking-widest whitespace-pre-wrap select-all">
                        "{currentActivity.scrambledPhrase}"
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/50">
                          <span className="text-slate-400 block font-bold mb-1">Answer Key:</span>
                          <span className="text-white font-extrabold">{currentActivity.solvedPhrase}</span>
                        </div>
                        <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/50">
                          <span className="text-slate-400 block font-bold mb-1">Whiteboard Hint:</span>
                          <span className="text-amber-200">{currentActivity.hint}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Instructions & Lesson */}
                  <div className="space-y-3 text-sm">
                    {currentActivity.lesson && (
                      <div className="bg-emerald-950/30 p-3.5 rounded-2xl border border-emerald-500/30">
                        <span className="font-extrabold text-emerald-400 block mb-0.5">🌟 Character Lesson Takeaway:</span>
                        <p className="text-emerald-100/90 text-xs">{currentActivity.lesson}</p>
                      </div>
                    )}

                    <div className="bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/50">
                      <span className="font-extrabold text-amber-400 block mb-1">📋 Counselor Steps:</span>
                      <p className="text-slate-200 leading-relaxed">{currentActivity.steps}</p>
                    </div>

                    {currentActivity.harder && (
                      <div className="bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/50">
                        <span className="font-extrabold text-amber-300 block mb-1">🔥 Make it Harder (+100 PTS):</span>
                        <p className="text-slate-200">{currentActivity.harder}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!currentActivity && (
                <div className="bg-slate-900/70 border-2 border-dashed border-slate-700 rounded-3xl p-10 text-center">
                  <Trash2 className="w-8 h-8 text-slate-500 mx-auto mb-3" />
                  <h3 className="text-lg font-black text-white">No missions or super scrambles yet</h3>
                  <p className="text-sm text-slate-400 mt-1 mb-5">Add a custom activity to start building your library again.</p>
                  {canManageActivities && <button
                    type="button"
                    onClick={() => setShowAddModal(true)}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2.5 rounded-2xl font-extrabold text-sm transition inline-flex items-center gap-2"
                  >
                    <PlusCircle className="w-4 h-4" /> Add Activity
                  </button>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: FASTEST LAP TRACKER */}
        {activeTab === 'fastest_lap' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* Top Month Record Banner */}
            <div className="bg-gradient-to-r from-cyan-950/90 via-slate-800 to-slate-800 border-2 border-cyan-500/40 rounded-3xl p-6 shadow-xl">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                  <div className="inline-flex items-center gap-2 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider mb-2">
                    <Medal className="w-4 h-4" /> Edison Fastest Lap Record ({currentMonthName})
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black text-white">
                    {fastestLapRecord ? fastestLapRecord.runnerName : 'No Laps Recorded This Month'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {fastestLapRecord ? `Group: ${fastestLapRecord.group} | Course: ${fastestLapRecord.courseName} | Date: ${fastestLapRecord.date}` : 'Log the first lap time below!'}
                  </p>
                </div>

                {fastestLapRecord && (
                  <div className="bg-cyan-500 text-slate-950 px-6 py-3 rounded-2xl font-black text-3xl shadow-xl flex items-center gap-3">
                    <Timer className="w-7 h-7" />
                    <span>{fastestLapRecord.timeFormatted}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form */}
              <div className="bg-slate-800/80 rounded-3xl p-6 border border-slate-700/80 shadow-lg">
                <h3 className="text-xl font-black text-white mb-1 flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-cyan-400" /> Record Lap
                </h3>
                <p className="text-xs text-slate-400 mb-5">Time gym obstacle sprints or relay laps.</p>

                <form onSubmit={handleSaveLap} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Runner or Group Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Leo, Maya, Tigers"
                      value={newLap.runnerName}
                      onChange={(e) => setNewLap({ ...newLap, runnerName: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Group</label>
                    <select
                      value={newLap.group}
                      onChange={(e) => setNewLap({ ...newLap, group: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none"
                    >
                      <option value="Ladybugs">Ladybugs 🐞</option>
                      <option value="Jellyfish">Jellyfish 🪼</option>
                      <option value="Tigers">Tigers 🐯</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Lap Time (Min : Sec . Ms) *</label>
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min="0"
                        placeholder="Min (0)"
                        value={newLap.minutes}
                        onChange={(e) => setNewLap({ ...newLap, minutes: e.target.value })}
                        className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-center text-sm text-white"
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min="0"
                        max="59"
                        required
                        placeholder="Sec (42)"
                        value={newLap.seconds}
                        onChange={(e) => setNewLap({ ...newLap, seconds: e.target.value })}
                        className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-center text-sm text-white"
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min="0"
                        max="99"
                        placeholder="Ms (00)"
                        value={newLap.ms}
                        onChange={(e) => setNewLap({ ...newLap, ms: e.target.value })}
                        className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-center text-sm text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Course Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Edison Gym Sprint"
                      value={newLap.courseName}
                      onChange={(e) => setNewLap({ ...newLap, courseName: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={pairing.isPaired && lapSubmitting}
                    className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black py-3 rounded-xl text-sm transition shadow-lg active:scale-95"
                  >
                    Save Lap Record
                  </button>
                </form>
              </div>

              {/* Leaderboard */}
              <div className="lg:col-span-2 bg-slate-800/80 rounded-3xl p-6 border border-slate-700/80 shadow-lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-black text-white flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-cyan-400" /> Edison Lap Leaderboard
                  </h3>
                  <span className="text-xs text-slate-400">{currentMonthLaps.length} Laps Recorded</span>
                </div>

                {currentMonthLaps.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 font-medium text-sm border border-dashed border-slate-700/60 rounded-2xl">
                    No laps recorded this month yet.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[440px] overflow-y-auto overflow-x-hidden pr-1">
                    {[...currentMonthLaps].sort((a, b) => a.totalSeconds - b.totalSeconds).map((item, index) => {
                      const isTop1 = index === 0;
                      return (
                        <div 
                          key={item.id} 
                          className={`p-4 rounded-2xl border flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 transition ${
                            isTop1 
                              ? 'bg-cyan-950/40 border-cyan-500/60 shadow-md ring-1 ring-cyan-500/30' 
                              : 'bg-slate-900/80 border-slate-700/60'
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-[200px] flex-1">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                              isTop1 ? 'bg-cyan-500 text-slate-950 shadow-md' : 'bg-slate-800 text-slate-300'
                            }`}>
                              #{index + 1}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-extrabold text-white text-base truncate">{item.runnerName}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium border border-slate-700 whitespace-nowrap">
                                  {item.group}
                                </span>
                              </div>
                              <div className="text-xs text-slate-400 mt-0.5 truncate">
                                {item.courseName} • {item.date}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <div className="text-xl font-black text-cyan-400 tracking-tight">{item.timeFormatted}</div>
                            </div>
                            <button
                              onClick={() => handleDeleteLap(item.id)}
                              aria-label={`Delete lap for ${item.runnerName}`}
                              className="text-slate-500 hover:text-red-400 p-2 rounded-xl transition min-h-[44px] min-w-[44px] flex justify-center items-center"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>

      <PairingPanel
        open={Boolean(sessionModal)}
        mode={sessionModal === 'controls' ? 'controls' : 'startup'}
        session={pairing.session}
        status={pairing.status}
        error={pairing.error}
        busy={pairing.busy}
        today={pairing.today}
        needsDailyAssignment={pairing.needsDailyAssignment}
        onClose={() => setSessionModal(null)}
        onOffline={handleContinueOffline}
        onCreate={handleCreatePairing}
        onJoin={handleJoinPairing}
        onUpdateAssignment={handleUpdateAssignment}
        onRemoveMember={handleRemoveMember}
        onLeave={handleLeavePairing}
        onEnd={handleEndPairing}
      />
      <MessageComposer
        open={messageComposerOpen}
        connected={pairing.status === 'connected'}
        onClose={() => setMessageComposerOpen(false)}
        onSend={pairing.sendMessage}
      />

      {/* Modal: Add Custom Scramble or Mission */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-white flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-amber-400" /> Add a Phrase to Scramble
            </h3>
            <p className="text-sm text-slate-400">
              Letters are shuffled within each word, and spaces between words stay in place.
            </p>

            <form onSubmit={handleSaveCustomActivity} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Phrase *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Teamwork makes us stronger"
                  value={newActivity.phrase}
                  onChange={(e) => setNewActivity({ ...newActivity, phrase: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Worth</label>
                <select
                  value={newActivity.points}
                  onChange={(e) => setNewActivity({ ...newActivity, points: Number(e.target.value) })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  <option value={100}>100 points</option>
                  <option value={200}>200 points</option>
                  <option value={300}>300 points</option>
                  <option value={400}>400 points</option>
                  <option value={500}>500 points</option>
                  <option value={600}>600 points</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setNewActivity({ phrase: '', points: 600 });
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pairing.isPaired && activitySubmitting}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black px-5 py-2 rounded-xl text-xs transition"
                >
                  Create Scramble
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}