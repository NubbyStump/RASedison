// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import PairingPanel from './components/PairingPanel';
import MessageComposer from './components/MessageComposer';
import ProjectorMessage from './components/ProjectorMessage';
import ChatPanel from './components/ChatPanel';
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

const ACTIVITY_MONTH_KEY = 'ras_edison_activities_month_v1';
const createEmptyActivity = () => ({
  title: '',
  type: 'Super Scramble',
  points: 600,
  location: '',
  scrambledPhrase: '',
  solvedPhrase: '',
  hint: '',
  lesson: '',
  materials: '',
  steps: '',
  harder: '',
  safety: '',
});

const ASSIGNED_GROUP_PAGE_THEMES = {
  ladybugs: {
    glow: 'rgba(244, 63, 94, 0.17)',
    surface: 'rgba(43, 31, 41, 0.92)',
    surfaceRaised: 'rgba(52, 36, 48, 0.96)',
    surfaceInset: 'rgba(27, 22, 31, 0.96)',
    border: 'rgba(255, 228, 236, 0.12)',
    fieldBorder: 'rgba(251, 113, 133, 0.28)',
    accent: '#fb7185',
    banner: 'bg-rose-400/10 border-rose-200/25',
    label: 'text-rose-100',
    brandLabel: 'text-rose-200',
    card: 'border-rose-300/80 shadow-[0_14px_34px_rgba(244,63,94,0.16)] ring-1 ring-rose-200/25',
    cardIdle: 'border-rose-200/20',
    assignedBadge: 'bg-rose-300 text-slate-950',
  },
  jellyfish: {
    glow: 'rgba(34, 211, 238, 0.17)',
    surface: 'rgba(28, 46, 59, 0.92)',
    surfaceRaised: 'rgba(36, 56, 70, 0.96)',
    surfaceInset: 'rgba(18, 31, 42, 0.96)',
    border: 'rgba(207, 239, 250, 0.12)',
    fieldBorder: 'rgba(103, 232, 249, 0.28)',
    accent: '#67e8f9',
    banner: 'bg-cyan-400/10 border-cyan-200/25',
    label: 'text-cyan-100',
    brandLabel: 'text-cyan-200',
    card: 'border-cyan-200/85 shadow-[0_14px_34px_rgba(34,211,238,0.16)] ring-1 ring-cyan-100/25',
    cardIdle: 'border-cyan-100/20',
    assignedBadge: 'bg-cyan-200 text-slate-950',
  },
  tigers: {
    glow: 'rgba(245, 158, 11, 0.15)',
    surface: 'rgba(47, 40, 29, 0.92)',
    surfaceRaised: 'rgba(57, 48, 34, 0.96)',
    surfaceInset: 'rgba(27, 25, 22, 0.96)',
    border: 'rgba(249, 231, 197, 0.12)',
    fieldBorder: 'rgba(251, 191, 36, 0.28)',
    accent: '#fbbf24',
    banner: 'bg-amber-400/10 border-amber-200/25',
    label: 'text-amber-100',
    brandLabel: 'text-amber-200',
    card: 'border-amber-200/85 shadow-[0_14px_34px_rgba(245,158,11,0.16)] ring-1 ring-amber-100/25',
    cardIdle: 'border-amber-100/20',
    assignedBadge: 'bg-amber-200 text-slate-950',
  },
};

const getGroupThemeStyle = (theme) => ({
  '--ras-group-glow': theme.glow,
  '--ras-panel-surface': theme.surface,
  '--ras-panel-raised': theme.surfaceRaised,
  '--ras-panel-inset': theme.surfaceInset,
  '--ras-panel-border': theme.border,
  '--ras-field-border': theme.fieldBorder,
  '--ras-accent': theme.accent,
});

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
  const [specialMentionsInput, setSpecialMentionsInput] = useState({ ladybugs: '', jellyfish: '', tigers: '' });
  const [setScoreInputs, setSetScoreInputs] = useState<Record<string, string>>({});
  const [reasonErrors, setReasonErrors] = useState({});
  const [pointActionError, setPointActionError] = useState('');
  const [approvalClock, setApprovalClock] = useState(() => Date.now());
  
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

    return JSON.parse(saved);
  });

  const [currentActivity, setCurrentActivity] = useState(() => localActivities[0] || null);

  // Manually authored mission and Super Scramble state.
  const [showAddModal, setShowAddModal] = useState(false);
  const [newActivity, setNewActivity] = useState(createEmptyActivity);
  const [activityError, setActivityError] = useState('');
  const activitySubmittingRef = useRef(false);
  const [activitySubmitting, setActivitySubmitting] = useState(false);

  const pairing = usePairing();
  // Keep this hook above every render return (including projector mode) so
  // approval timers remain accurate whenever the user returns to Points.
  useEffect(() => {
    const timer = window.setInterval(() => setApprovalClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const isLiveOwner = pairing.session?.role === 'owner';
  const isLiveCounselor = pairing.session?.role === 'counselor';
  const canManageActivities = !pairing.isPaired || isLiveOwner;
  const canCreateActivities = !pairing.isPaired || Boolean(pairing.session);
  const groups = pairing.session?.state.groups ?? localGroups;
  const assignedGroupId = isLiveCounselor
    ? pairing.session?.groupId
      ?? pairing.session?.members.find((member) => member.id === pairing.session?.memberId)?.groupId
      ?? null
    : pairing.currentGroupId;
  useEffect(() => {
    setSetScoreInputs({});
  }, [assignedGroupId]);
  const ledGroup = assignedGroupId
    ? groups.find((group) => group.id === assignedGroupId) || null
    : null;
  const assignedGroupTheme = ledGroup
    ? ASSIGNED_GROUP_PAGE_THEMES[ledGroup.id] || null
    : null;
  const pointsGroups = ledGroup
    ? [ledGroup, ...groups.filter((group) => group.id !== ledGroup.id)]
    : groups;
  const history = pairing.session?.state.history ?? localHistory;
  const monthlyRecords = pairing.session?.state.monthlyRecords ?? localMonthlyRecords;
  const lapRecords = pairing.session?.state.lapRecords ?? localLapRecords;
  const activities = pairing.session?.state.activities ?? localActivities;
  const projectorMessages = pairing.session?.projectorMessages ?? [];
  const pendingPointApprovals = (pairing.session?.state.pendingPointApprovals ?? [])
    .filter((request) => (request.status ?? 'pending') === 'pending');
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
  const runnerUpScore = [...groups].sort((left, right) => right.score - left.score)[1]?.score ?? null;
  const runnerUpGroups = runnerUpScore === null
    ? []
    : groups.filter(group => group.score === runnerUpScore);
  const leadGap = runnerUpScore === null ? null : Math.max(0, maxScore - runnerUpScore);

  const handleAddPoints = async (groupId, amount) => {
    if (isLiveCounselor && amount < 0 && assignedGroupId !== groupId) {
      setPointActionError('Counselors may only remove points from their assigned group.');
      return;
    }
    const enteredReason = reasonInput[groupId]?.trim();
    const specialMentions = specialMentionsInput[groupId]?.trim();
    if (!enteredReason) {
      setReasonErrors(prev => ({ ...prev, [groupId]: 'Enter a reason before changing points.' }));
      document.getElementById(`points-reason-${groupId}`)?.focus();
      return;
    }
    setReasonErrors(prev => ({ ...prev, [groupId]: '' }));
    const reason = enteredReason;
    setPointActionError('');
    const targetGroup = groups.find(g => g.id === groupId);

    if (pairing.isPaired) {
      try {
        await pairing.command({
          type: 'addPoints',
          payload: { groupId, amount, reason, ...(specialMentions ? { specialMentions } : {}) },
        });
        setReasonInput(prev => ({ ...prev, [groupId]: '' }));
        setSpecialMentionsInput(prev => ({ ...prev, [groupId]: '' }));
      } catch (error) {
        setPointActionError(error?.message || 'Unable to submit this points change.');
      }
      return;
    }

    setLocalGroups(prev => prev.map(g => g.id === groupId ? { ...g, score: Math.max(0, g.score + amount) } : g));

    const newLog = {
      id: Date.now().toString(),
      groupId,
      groupName: targetGroup.name,
      amount,
      reason,
      ...(specialMentions ? { specialMentions } : {}),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setLocalHistory(prev => [newLog, ...prev.slice(0, 35)]);
    setReasonInput(prev => ({ ...prev, [groupId]: '' }));
    setSpecialMentionsInput(prev => ({ ...prev, [groupId]: '' }));
  };

  const handleReduceGroupPoints = async (groupId, mode) => {
    if (!isLiveCounselor || assignedGroupId !== groupId) {
      setPointActionError('Bulk point removal is only available for your assigned group in a live counselor session.');
      return;
    }
    const enteredReason = reasonInput[groupId]?.trim();
    const specialMentions = specialMentionsInput[groupId]?.trim();
    if (!enteredReason) {
      setReasonErrors(prev => ({ ...prev, [groupId]: 'Enter a reason before changing points.' }));
      document.getElementById(`points-reason-${groupId}`)?.focus();
      return;
    }
    if (!pairing.isPaired) {
      setPointActionError('Bulk point removal is only available in a live counselor session.');
      return;
    }
    setReasonErrors(prev => ({ ...prev, [groupId]: '' }));
    setPointActionError('');
    try {
      await pairing.command({
        type: 'reduceGroupPoints',
        payload: {
          groupId,
          mode,
          reason: enteredReason,
          ...(specialMentions ? { specialMentions } : {}),
        },
      });
      setReasonInput(prev => ({ ...prev, [groupId]: '' }));
      setSpecialMentionsInput(prev => ({ ...prev, [groupId]: '' }));
    } catch (error) {
      setPointActionError(error?.message || 'Unable to request this points removal.');
    }
  };

  const handleSetGroupPoints = async (groupId) => {
    if (
      !pairing.isPaired
      || (!isLiveOwner && !(isLiveCounselor && assignedGroupId === groupId))
    ) {
      setPointActionError('In a live session, the Program Manager can set any group total and counselors can set only their assigned group.');
      return;
    }
    const normalizedScore = (setScoreInputs[groupId] ?? '').trim();
    if (!/^\d+$/.test(normalizedScore)) {
      setPointActionError('Enter a whole-number score from 0 to 1,000,000,000.');
      return;
    }
    const score = Number(normalizedScore);
    if (!Number.isSafeInteger(score) || score > 1_000_000_000) {
      setPointActionError('Enter a whole-number score from 0 to 1,000,000,000.');
      return;
    }
    const targetGroup = groups.find((group) => group.id === groupId);
    if (!targetGroup) {
      setPointActionError('The assigned group could not be found.');
      return;
    }
    if (score === targetGroup.score) {
      setPointActionError('That group already has this score.');
      return;
    }
    const enteredReason = reasonInput[groupId]?.trim();
    if (!enteredReason) {
      setReasonErrors(prev => ({ ...prev, [groupId]: 'Enter a reason before changing points.' }));
      document.getElementById(`points-reason-${groupId}`)?.focus();
      return;
    }
    const specialMentions = specialMentionsInput[groupId]?.trim();
    setReasonErrors(prev => ({ ...prev, [groupId]: '' }));
    setPointActionError('');
    try {
      await pairing.command({
        type: 'setGroupPoints',
        payload: {
          groupId,
          score,
          reason: enteredReason,
          ...(specialMentions ? { specialMentions } : {}),
        },
      });
      setReasonInput(prev => ({ ...prev, [groupId]: '' }));
      setSpecialMentionsInput(prev => ({ ...prev, [groupId]: '' }));
      setSetScoreInputs(prev => ({ ...prev, [groupId]: '' }));
    } catch (error) {
      setPointActionError(error?.message || 'Unable to set this group score.');
    }
  };

  const handlePointApproval = async (type, requestId) => {
    setPointActionError('');
    try {
      await pairing.command({ type, payload: { requestId } });
    } catch (error) {
      setPointActionError(error?.message || `Unable to ${type === 'approvePoints' ? 'approve' : 'reject'} this points request.`);
    }
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
    if (pairing.isPaired && newActivity.type === 'Super Scramble' && !isLiveOwner) {
      setActivityError('Only the Program Manager can create or change a Super Scramble.');
      return;
    }
    const title = newActivity.title.trim();
    const location = newActivity.location.trim();
    const scrambledPhrase = newActivity.scrambledPhrase.trim();
    const solvedPhrase = newActivity.solvedPhrase.trim();
    const steps = newActivity.steps.trim();
    const points = Number(newActivity.points);
    if (!title || !location || !Number.isFinite(points) || points < 0) return;
    if (newActivity.type === 'Super Scramble' && (!scrambledPhrase || !solvedPhrase)) return;
    if (newActivity.type === 'Mission' && !steps) return;
    if (pairing.isPaired && activitySubmittingRef.current) return;

    const created = {
      title,
      type: newActivity.type,
      points,
      location,
      scrambledPhrase,
      solvedPhrase,
      hint: newActivity.hint.trim(),
      lesson: newActivity.lesson.trim(),
      materials: newActivity.materials.trim(),
      steps,
      harder: newActivity.harder.trim(),
      safety: newActivity.safety.trim(),
    };
    setActivityError('');

    if (pairing.isPaired) {
      activitySubmittingRef.current = true;
      setActivitySubmitting(true);
      try {
        const nextSession = await pairing.command({ type: 'addActivity', payload: { activity: created } });
        const savedActivity = nextSession.state.activities[0];
        setCurrentActivity(savedActivity || null);
      } catch (error) {
        setActivityError(error?.message || 'Unable to save this activity. Please try again.');
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
    setNewActivity(createEmptyActivity());
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
          onClear={pairing.session?.role === 'owner' ? pairing.clearMessage : undefined}
          hasMessage={projectorMessages.some(message => Date.parse(message.expiresAt) > Date.now())}
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
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Right At School Logo"
            className="h-10 w-auto object-contain bg-white p-1 rounded-xl shadow-md"
          />

          <div className="flex flex-wrap items-center justify-end gap-3">
            {pairing.isPaired && (
              <button
                type="button"
                onClick={() => setMessageComposerOpen(true)}
                className="flex items-center gap-2 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 px-4 py-3 rounded-2xl font-bold transition border border-cyan-400/40 shadow-xl text-sm"
              >
                <MessageSquare className="w-5 h-5 shrink-0" /> <span className="hidden sm:inline">Chat / Send</span><span className="sm:hidden">Send</span>
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
    <div
      className={`min-h-[100dvh] ${assignedGroupTheme ? 'ras-edison-theme' : 'bg-slate-900'} text-slate-100 flex flex-col font-sans pb-12`}
      style={assignedGroupTheme ? getGroupThemeStyle(assignedGroupTheme) : undefined}
    >
      {/* Header Bar */}
      <header className={`${assignedGroupTheme ? 'ras-theme-header' : 'bg-slate-800/90 border-slate-700/80'} backdrop-blur border-b sticky top-0 z-30 px-4 py-3`}>
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="Right At School Logo"
              className="h-10 w-auto object-contain bg-white p-1 rounded-xl shadow-md"
            />
            <div>
              {/* Explicit School Title Header */}
              <div className={`text-[10px] uppercase font-black tracking-widest ${assignedGroupTheme?.brandLabel || 'text-emerald-400'} flex items-center gap-1`}>
                Right At School
              </div>
              <h1 className="font-black text-base md:text-lg text-white tracking-tight leading-tight">
                Edison Language Academy
              </h1>
            </div>
          </div>

          {/* Nav Tabs */}
          <div className={`flex items-center ${assignedGroupTheme ? 'ras-theme-nav' : 'bg-slate-900 border-slate-700'} p-1 rounded-2xl border overflow-x-auto max-w-full`}>
            <button
              onClick={() => setActiveTab('scoreboard')}
              className={`flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl font-bold text-xs md:text-sm transition shrink-0 ${
                activeTab === 'scoreboard' ? (assignedGroupTheme ? 'ras-theme-primary' : 'bg-emerald-500 text-slate-950 shadow-md') : 'text-slate-400 hover:text-white'
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
                <FileText className="w-4 h-4" /> Activities
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
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl font-bold text-xs md:text-sm transition shrink-0 border ${
                activeTab === 'chat'
                  ? 'border-cyan-400 bg-cyan-400 text-slate-950 shadow-md'
                  : 'border-cyan-500/30 text-cyan-300 hover:bg-cyan-950/50'
              }`}
              aria-label="Open room chat"
            >
              <MessageSquare className="w-4 h-4" /> Chat
            </button>
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
        {activeTab === 'chat' && (
          <ChatPanel
            session={pairing.session}
            status={pairing.status}
            onOpenLobby={() => setSessionModal('startup')}
            onSend={pairing.sendMessage}
          />
        )}
        {/* TAB 1: POINTS TRACKER */}
        {activeTab === 'scoreboard' && (
          <div className="space-y-6">
            {ledGroup && (
              <div data-testid="banner-my-group" className={`${assignedGroupTheme?.banner || 'bg-cyan-500/10 border-cyan-400/40'} border rounded-2xl px-5 py-3 flex items-center gap-3`}>
                <span className="text-2xl">{ledGroup.icon}</span>
                <div>
                  <div className={`text-[11px] font-black uppercase tracking-widest ${assignedGroupTheme?.label || 'text-cyan-300'}`}>Your Assigned Group</div>
                  <div className="font-black text-white">{ledGroup.name}</div>
                </div>
              </div>
            )}
            {/* Status Leader Banner */}
            <div className={`${assignedGroupTheme ? 'ras-theme-panel' : 'bg-gradient-to-r from-slate-800 via-slate-800 to-slate-800/90 border-slate-700/80'} border rounded-3xl p-5 shadow-xl`}>
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
                  {leaders.length === 1 && (
                    <p className="text-xs md:text-sm text-slate-300 mt-1">
                      {runnerUpScore === null
                        ? 'No runner-up yet.'
                        : `${leadGap?.toLocaleString()} pts ahead of the runner-up (${runnerUpGroups.map(group => group.name).join(' & ')}: ${runnerUpScore.toLocaleString()} pts).`}
                    </p>
                  )}
                  {leaders.length > 1 && (
                    <p className="text-xs md:text-sm text-slate-300 mt-1">
                      0-point gap between the co-leaders.
                    </p>
                  )}
                </div>

                <div className={`flex items-center gap-3 ${assignedGroupTheme ? 'ras-theme-inset' : 'bg-slate-900/80 border-slate-700'} border px-4 py-2.5 rounded-2xl self-start md:self-auto`}>
                  <Calendar className="w-5 h-5 text-emerald-400" />
                  <div>
                    <div className="text-xs text-slate-400 font-medium">Month Ends In</div>
                    <div className="text-sm font-extrabold text-white">{getDaysLeftInMonth()} Days Remaining</div>
                  </div>
                </div>
              </div>
            </div>

            {pointActionError && (
              <div role="alert" className="bg-red-950/80 border border-red-500/50 text-red-100 px-4 py-3 rounded-2xl text-sm font-bold">
                {pointActionError}
              </div>
            )}
            {isLiveCounselor && !ledGroup && (
              <div role="status" className="bg-amber-950/40 border border-amber-500/40 text-amber-100 px-4 py-3 rounded-2xl text-sm">
                No group is assigned to this counselor. Open Live session controls and save today’s group to enable point removal.
              </div>
            )}

            {pendingPointApprovals.length > 0 && (
              <section className={`${assignedGroupTheme ? 'ras-theme-panel' : 'bg-amber-950/30'} border border-amber-500/30 rounded-3xl p-5 shadow-lg`}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-extrabold text-lg text-white">Points Awaiting Approval</h3>
                    <p className="text-xs text-amber-200/70 mt-1">
                      Counselor changes stay out of the score until approved by the Program Manager.
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-200 px-3 py-1 text-xs font-black">
                    {pendingPointApprovals.length} pending
                  </span>
                </div>
                <div className="space-y-2">
                  {pendingPointApprovals.map((request) => {
                    const remaining = Math.max(0, new Date(request.dueAt).getTime() - approvalClock);
                    const minutes = Math.floor(remaining / 60_000);
                    const seconds = Math.floor((remaining % 60_000) / 1_000);
                    const isSetScoreRequest = request.setScore !== undefined;
                    return (
                      <div key={request.id} className={`${assignedGroupTheme ? 'ras-theme-inset' : 'bg-slate-900/75 border-slate-700/70'} border rounded-2xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-3`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-black px-2 py-1 rounded-lg text-xs ${isSetScoreRequest ? 'bg-cyan-500/20 text-cyan-200' : request.amount >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                              {isSetScoreRequest ? `Set total to ${request.setScore}` : request.amount >= 0 ? `+${request.amount}` : request.amount}
                            </span>
                            <span className="font-bold text-white">{request.groupName}</span>
                            <span className="text-xs text-amber-200">Auto-approves in {minutes}:{String(seconds).padStart(2, '0')}</span>
                          </div>
                          <p className="text-sm text-slate-300 mt-1 italic">“{request.reason}”</p>
                          {request.specialMentions && (
                            <p className="text-xs text-cyan-200 mt-1"><span className="font-bold">Special mentions:</span> {request.specialMentions}</p>
                          )}
                          <p className="text-xs text-slate-400 mt-1">Requested by {request.submittedByName}</p>
                        </div>
                        {isLiveOwner && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button type="button" onClick={() => handlePointApproval('approvePoints', request.id)} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl px-3 py-2 text-xs font-black min-h-[44px]">Approve</button>
                            <button type="button" onClick={() => handlePointApproval('rejectPoints', request.id)} className="bg-red-500/15 hover:bg-red-500/25 text-red-200 border border-red-500/40 rounded-xl px-3 py-2 text-xs font-black min-h-[44px]">Reject</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Score Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {pointsGroups.map((group) => {
                const isLeading = group.score === maxScore && maxScore > 0;
                const isMyGroup = group.id === assignedGroupId;
                const setScoreValue = setScoreInputs[group.id] ?? '';
                const cardTheme = ASSIGNED_GROUP_PAGE_THEMES[group.id] || assignedGroupTheme;
                return (
                  <div 
                    key={group.id} 
                    style={assignedGroupTheme ? getGroupThemeStyle(cardTheme) : undefined}
                    className={`${assignedGroupTheme ? 'ras-theme-panel-raised' : 'bg-slate-800/90'} rounded-3xl p-5 border transition-all duration-300 relative flex flex-col justify-between shadow-lg ${
                      isMyGroup
                        ? assignedGroupTheme?.card || 'border-cyan-400/90 shadow-[0_0_35px_rgba(34,211,238,0.22)] ring-2 ring-cyan-400/30'
                        : isLeading ? 'border-emerald-400/80 shadow-[0_0_30px_rgba(16,185,129,0.2)] ring-2 ring-emerald-400/20' : assignedGroupTheme ? cardTheme?.cardIdle || 'border-slate-700/70' : 'border-slate-700/70'
                    }`}
                  >
                    {isMyGroup && (
                      <div className={`absolute -top-3.5 left-4 ${assignedGroupTheme?.assignedBadge || 'bg-cyan-400 text-slate-950'} font-black text-xs px-3 py-1 rounded-full shadow-md uppercase tracking-wider`}>
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

                        <div className={`text-3xl font-black text-white ${assignedGroupTheme ? 'ras-theme-inset' : 'bg-slate-900/80 border-slate-700/60'} px-4 py-2 rounded-2xl border`}>
                          {group.score}
                        </div>
                      </div>

                        {(isLiveOwner || (isLiveCounselor && isMyGroup)) && (
                          <div className={`mb-4 rounded-2xl border p-3 ${isLiveOwner ? 'border-cyan-500/35 bg-cyan-950/20' : 'border-red-500/35 bg-red-950/20'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <span className={`text-sm font-black ${isLiveOwner ? 'text-cyan-100' : 'text-red-100'}`}>
                                {isLiveOwner ? `Set total for ${group.name}` : `Change points for ${group.name}`}
                              </span>
                              <span className={`text-[11px] font-semibold ${isLiveOwner ? 'text-cyan-200/80' : 'text-red-200/80'}`}>
                                {isLiveOwner ? 'Applies immediately' : 'Program Manager approval required'}
                              </span>
                            </div>
                            {isLiveCounselor && isMyGroup && (
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleReduceGroupPoints(group.id, 'half')}
                                  disabled={group.score <= 0}
                                  aria-label={`Request removal of half the points from ${group.name}, rounded up`}
                                  className="bg-red-500/15 hover:bg-red-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-red-200 border border-red-500/40 rounded-xl px-2 py-2 font-bold text-xs transition active:scale-95 min-h-[44px]"
                                >
                                  Remove half (−{Math.ceil(group.score / 2)})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReduceGroupPoints(group.id, 'all')}
                                  disabled={group.score <= 0}
                                  aria-label={`Request removal of all ${group.score} points from ${group.name}`}
                                  className="bg-red-500/25 hover:bg-red-500/35 disabled:opacity-40 disabled:cursor-not-allowed text-red-100 border border-red-500/50 rounded-xl px-2 py-2 font-bold text-xs transition active:scale-95 min-h-[44px]"
                                >
                                  Remove all (−{group.score})
                                </button>
                              </div>
                            )}
                            <div className={`mt-3 border-t pt-3 ${isLiveOwner ? 'border-cyan-500/25' : 'border-red-500/25'}`}>
                              <label htmlFor={`points-set-total-${group.id}`} className={`block text-xs font-bold mb-1 ${isLiveOwner ? 'text-cyan-100' : 'text-red-100'}`}>
                                Set group total
                              </label>
                              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                                <input
                                  id={`points-set-total-${group.id}`}
                                  type="number"
                                  inputMode="numeric"
                                  min="0"
                                  max="1000000000"
                                  step="1"
                                  value={setScoreValue}
                                  onChange={(event) => {
                                    setSetScoreInputs(prev => ({ ...prev, [group.id]: event.target.value }));
                                    setPointActionError('');
                                  }}
                                  aria-label={`New total for ${group.name}`}
                                  placeholder={`Current total: ${group.score}`}
                                  className={`min-w-0 bg-slate-950/70 border rounded-xl px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:outline-none ${isLiveOwner ? 'border-cyan-500/35 focus:border-cyan-300' : 'border-red-500/35 focus:border-red-300'}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSetGroupPoints(group.id)}
                                  disabled={
                                    !/^\d+$/.test(setScoreValue.trim())
                                    || !Number.isSafeInteger(Number(setScoreValue))
                                    || Number(setScoreValue) > 1_000_000_000
                                    || Number(setScoreValue) === group.score
                                  }
                                  aria-label={`${isLiveOwner ? 'Set' : 'Request setting'} ${group.name} total to ${setScoreValue || 'a new'} points`}
                                  className={`disabled:opacity-40 disabled:cursor-not-allowed rounded-xl px-3 py-2 font-bold text-xs transition active:scale-95 min-h-[44px] ${isLiveOwner ? 'bg-cyan-500/25 hover:bg-cyan-500/35 text-cyan-100 border border-cyan-500/50' : 'bg-red-500/25 hover:bg-red-500/35 text-red-100 border border-red-500/50'}`}
                                >
                                  {isLiveOwner ? 'Set total' : 'Request set'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                      {/* Point reason */}
                      <div className="mb-4">
                        <label htmlFor={`points-reason-${group.id}`} className="block text-xs text-slate-300 mb-1">
                          Reason (required for every points change)
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
                          className={`w-full ${assignedGroupTheme ? 'ras-theme-field' : 'bg-slate-900/80 border-slate-700 focus:border-emerald-500'} border text-xs rounded-xl px-3.5 py-2 text-slate-200 placeholder-slate-400 focus:outline-none transition`}
                        />
                        {reasonErrors[group.id] && (
                          <p id={`points-reason-error-${group.id}`} role="alert" className="text-xs text-red-300 mt-1">
                            {reasonErrors[group.id]}
                          </p>
                        )}
                      </div>

                      <div className="mb-4">
                        <label htmlFor={`points-mentions-${group.id}`} className="block text-xs text-slate-300 mb-1">
                          Special mentions (optional)
                        </label>
                        <input
                          id={`points-mentions-${group.id}`}
                          type="text"
                          maxLength={500}
                          placeholder="Names or shout-outs to include in the log"
                          value={specialMentionsInput[group.id] || ''}
                          onChange={(e) => setSpecialMentionsInput(prev => ({ ...prev, [group.id]: e.target.value }))}
                          className={`w-full ${assignedGroupTheme ? 'ras-theme-field' : 'bg-slate-900/80 border-slate-700 focus:border-cyan-500'} border text-xs rounded-xl px-3.5 py-2 text-slate-200 placeholder-slate-400 focus:outline-none transition`}
                        />
                      </div>

                      {/* Point Action Buttons in Hundreds Range */}
                      <div className="space-y-2 mb-2">
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            onClick={() => handleAddPoints(group.id, 10)}
                            aria-label={`Add 10 points to ${group.name}`}
                            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl py-2 font-black text-xs transition active:scale-95 min-h-[44px]"
                          >
                            +10
                          </button>
                          <button
                            onClick={() => handleAddPoints(group.id, 50)}
                            aria-label={`Add 50 points to ${group.name}`}
                            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 rounded-xl py-2 font-black text-xs transition active:scale-95 min-h-[44px]"
                          >
                            +50
                          </button>
                          <button
                            onClick={() => handleAddPoints(group.id, 100)}
                            aria-label={`Add 100 points to ${group.name}`}
                            className="bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-100 border border-emerald-500/50 rounded-xl py-2 font-black text-xs transition active:scale-95 min-h-[44px]"
                          >
                            +100
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            onClick={() => handleAddPoints(group.id, 200)}
                            aria-label={`Add 200 points to ${group.name}`}
                            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl py-2 font-black text-xs transition active:scale-95 shadow-md min-h-[44px]"
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
                            className="bg-gradient-to-r from-emerald-400 to-lime-400 text-slate-950 font-black rounded-xl py-2 text-xs transition active:scale-95 shadow-md flex items-center justify-center gap-1 min-h-[44px]"
                          >
                            <Sparkles className="w-3.5 h-3.5" /> +600
                          </button>
                        </div>

                        {(!isLiveCounselor || isMyGroup) && (
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
                        )}

                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recent History & Monthly Log */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
              <div className={`lg:col-span-2 ${assignedGroupTheme ? 'ras-theme-panel' : 'bg-slate-800/80 border-slate-700/80'} rounded-3xl p-5 border shadow-lg`}>
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
                      <div key={item.id} className={`${assignedGroupTheme ? 'ras-theme-inset' : 'bg-slate-900/70 border-slate-700/60'} border rounded-2xl p-3 flex items-start justify-between gap-3 text-sm`}>
                        <div className="flex items-start gap-3 min-w-0">
                          <span className={`font-black px-2.5 py-1 rounded-xl text-xs ${
                            item.amount > 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
                          }`}>
                            {item.amount > 0 ? `+${item.amount}` : item.amount}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2">
                              <span className="font-bold text-white">{item.groupName}</span>
                              <span className="text-slate-300 italic">“{item.reason}”</span>
                            </div>
                            {(item.submittedByName || item.specialMentions) && (
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                                {item.submittedByName && <span>Entered by {item.submittedByName}</span>}
                                {item.specialMentions && <span><strong className="text-cyan-200">Special mentions:</strong> {item.specialMentions}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleUndo(item.id)}
                          className={`${assignedGroupTheme ? 'ras-theme-panel-raised' : 'bg-slate-800 hover:bg-slate-700 border-slate-600/50'} text-slate-300 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition border`}
                        >
                          Undo
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reset Month & Archive */}
              <div className={`${assignedGroupTheme ? 'ras-theme-panel' : 'bg-slate-800/80 border-slate-700/80'} rounded-3xl p-5 border shadow-lg flex flex-col justify-between`}>
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
                        <div key={rec.id} className={`${assignedGroupTheme ? 'ras-theme-inset' : 'bg-slate-900/80 border-slate-700/60'} border rounded-2xl p-3 text-xs`}>
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
                    className={`w-full ${assignedGroupTheme ? 'ras-theme-inset' : 'bg-slate-900 border-slate-700'} hover:bg-red-950/40 text-red-400 hover:text-red-300 border hover:border-red-500/40 rounded-2xl py-3 text-xs font-extrabold transition flex items-center justify-center gap-2`}
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
            <div className={`${assignedGroupTheme ? 'ras-theme-panel-raised' : 'bg-gradient-to-r from-amber-950/70 via-slate-800 to-slate-800'} border-2 border-amber-500/40 rounded-3xl p-5 shadow-xl`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-xl shrink-0 mt-1">
                  ✏️
                </div>
                <div>
                  <h3 className="font-extrabold text-lg text-white">Whiteboard Super Scramble Guide</h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Enter the exact whiteboard prompt, answer key, hint, point value, and counselor instructions yourself. Students work in groups to solve your custom puzzle.
                  </p>
                </div>
              </div>
            </div>

            <div className={`${assignedGroupTheme ? 'ras-theme-panel' : 'bg-slate-800/80 border-slate-700/80'} rounded-3xl p-6 border shadow-lg`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-2xl font-black text-white flex items-center gap-2">
                    <FileText className="w-6 h-6 text-amber-400" /> Custom Missions & Super Scrambles
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Create your own activities and choose one from the library. Nothing is generated or shuffled for you.
                    Activities clear automatically each month on the school’s Pacific time; scores, laps, and history are kept.
                  </p>
                </div>

                {canCreateActivities && <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setNewActivity({ ...createEmptyActivity(), type: isLiveCounselor ? 'Mission' : 'Super Scramble' });
                      setActivityError('');
                      setShowAddModal(true);
                    }}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2.5 rounded-2xl font-extrabold text-sm transition flex items-center gap-2 shadow-md"
                  >
                    <PlusCircle className="w-4 h-4" /> Create Custom Activity
                  </button>
                  {canManageActivities && <button
                    onClick={handleClearActivities}
                    disabled={activities.length === 0}
                    className="bg-red-500/10 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40 text-red-300 border border-red-500/30 px-4 py-2.5 rounded-2xl font-extrabold text-sm transition flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Clear All
                  </button>}
                </div>}
              </div>

              {activities.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-black text-slate-200 mb-3">Activity library</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {activities.map((activity) => {
                      const selected = currentActivity?.id === activity.id;
                      return (
                        <button
                          key={activity.id}
                          type="button"
                          onClick={() => setCurrentActivity(activity)}
                          aria-pressed={selected}
                          className={`text-left rounded-2xl border p-4 transition ${selected ? 'border-amber-400 bg-amber-500/10' : assignedGroupTheme ? 'ras-theme-inset hover:border-slate-500' : 'border-slate-700 bg-slate-900/70 hover:border-slate-500'}`}
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="font-bold text-white truncate">{activity.title}</span>
                            <span className="text-xs text-emerald-300 shrink-0">{activity.points || 0} pts</span>
                          </span>
                          <span className="mt-1 block text-xs text-slate-400">{activity.type} · {activity.location}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Display Activity */}
              {currentActivity && (
                <div className={`${assignedGroupTheme ? 'ras-theme-panel-raised' : 'bg-slate-900'} border-2 border-amber-500/60 rounded-3xl p-6 relative overflow-hidden shadow-2xl space-y-4`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {currentActivity.type}
                      </span>
                      <span className={`${assignedGroupTheme ? 'ras-theme-inset' : 'bg-slate-800 border-slate-700'} text-slate-300 border px-3 py-1 rounded-full text-xs font-bold`}>
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
                    <div className={`${assignedGroupTheme ? 'ras-theme-panel' : 'bg-slate-800/90 border-slate-700'} border-2 rounded-2xl p-4 space-y-3`}>
                      <div className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                        ✏️ WRITE THIS PHRASE ON THE WHITEBOARD:
                      </div>
                      <div className={`${assignedGroupTheme ? 'ras-theme-inset' : 'bg-slate-950 border-slate-800'} text-emerald-400 font-mono font-black text-lg md:text-xl p-3.5 rounded-xl border text-center tracking-widest whitespace-pre-wrap select-all`}>
                        "{currentActivity.scrambledPhrase}"
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1">
                        <div className={`${assignedGroupTheme ? 'ras-theme-inset' : 'bg-slate-900/80 border-slate-700/50'} p-3 rounded-xl border`}>
                          <span className="text-slate-400 block font-bold mb-1">Answer Key:</span>
                          <span className="text-white font-extrabold">{currentActivity.solvedPhrase}</span>
                        </div>
                        <div className={`${assignedGroupTheme ? 'ras-theme-inset' : 'bg-slate-900/80 border-slate-700/50'} p-3 rounded-xl border`}>
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

                    <div className={`${assignedGroupTheme ? 'ras-theme-inset' : 'bg-slate-800/60 border-slate-700/50'} p-3.5 rounded-2xl border`}>
                      <span className="font-extrabold text-amber-400 block mb-1">📋 Counselor Steps:</span>
                      <p className="text-slate-200 leading-relaxed">{currentActivity.steps}</p>
                    </div>

                    {currentActivity.harder && (
                      <div className={`${assignedGroupTheme ? 'ras-theme-inset' : 'bg-slate-800/60 border-slate-700/50'} p-3.5 rounded-2xl border`}>
                        <span className="font-extrabold text-amber-300 block mb-1">🔥 Challenge Variation:</span>
                        <p className="text-slate-200">{currentActivity.harder}</p>
                      </div>
                    )}

                    {currentActivity.materials && (
                      <div className={`${assignedGroupTheme ? 'ras-theme-inset' : 'bg-slate-800/60 border-slate-700/50'} p-3.5 rounded-2xl border`}>
                        <span className="font-extrabold text-cyan-300 block mb-1">Materials:</span>
                        <p className="text-slate-200">{currentActivity.materials}</p>
                      </div>
                    )}

                    {currentActivity.safety && (
                      <div className="bg-red-950/30 p-3.5 rounded-2xl border border-red-500/30">
                        <span className="font-extrabold text-red-300 block mb-1">Safety notes:</span>
                        <p className="text-slate-200">{currentActivity.safety}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!currentActivity && (
                <div className={`${assignedGroupTheme ? 'ras-theme-inset' : 'bg-slate-900/70 border-slate-700'} border-2 border-dashed rounded-3xl p-10 text-center`}>
                  <Trash2 className="w-8 h-8 text-slate-500 mx-auto mb-3" />
                  <h3 className="text-lg font-black text-white">No missions or super scrambles yet</h3>
                  <p className="text-sm text-slate-400 mt-1 mb-5">Add a custom activity to start building your library again.</p>
                  {canCreateActivities && <button
                    type="button"
                    onClick={() => {
                      setNewActivity({ ...createEmptyActivity(), type: isLiveCounselor ? 'Mission' : 'Super Scramble' });
                      setActivityError('');
                      setShowAddModal(true);
                    }}
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
            <div className={`${assignedGroupTheme ? 'ras-theme-panel' : 'bg-gradient-to-r from-cyan-950/90 via-slate-800 to-slate-800'} border-2 border-cyan-500/40 rounded-3xl p-6 shadow-xl`}>
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
              <div className={`${assignedGroupTheme ? 'ras-theme-panel' : 'bg-slate-800/80 border-slate-700/80'} rounded-3xl p-6 border shadow-lg`}>
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
                      className={`w-full ${assignedGroupTheme ? 'ras-theme-field' : 'bg-slate-900 border-slate-700 focus:border-cyan-500'} border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none`}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Group</label>
                    <select
                      value={newLap.group}
                      onChange={(e) => setNewLap({ ...newLap, group: e.target.value })}
                      className={`w-full ${assignedGroupTheme ? 'ras-theme-field' : 'bg-slate-900 border-slate-700'} border rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none`}
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
                        className={`${assignedGroupTheme ? 'ras-theme-field' : 'bg-slate-900 border-slate-700'} border rounded-xl px-3 py-2 text-center text-sm text-white`}
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
                        className={`${assignedGroupTheme ? 'ras-theme-field' : 'bg-slate-900 border-slate-700'} border rounded-xl px-3 py-2 text-center text-sm text-white`}
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
                        className={`${assignedGroupTheme ? 'ras-theme-field' : 'bg-slate-900 border-slate-700'} border rounded-xl px-3 py-2 text-center text-sm text-white`}
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
                      className={`w-full ${assignedGroupTheme ? 'ras-theme-field' : 'bg-slate-900 border-slate-700'} border rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none`}
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
              <div className={`lg:col-span-2 ${assignedGroupTheme ? 'ras-theme-panel' : 'bg-slate-800/80 border-slate-700/80'} rounded-3xl p-6 border shadow-lg`}>
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
                              : assignedGroupTheme ? 'ras-theme-inset' : 'bg-slate-900/80 border-slate-700/60'
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-[200px] flex-1">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                              isTop1 ? 'bg-cyan-500 text-slate-950 shadow-md' : `${assignedGroupTheme ? 'ras-theme-panel-raised' : 'bg-slate-800'} text-slate-300`
                            }`}>
                              #{index + 1}
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-extrabold text-white text-base truncate">{item.runnerName}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${assignedGroupTheme ? 'ras-theme-inset' : 'bg-slate-800 border-slate-700'} text-slate-300 font-medium border whitespace-nowrap`}>
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
        onClear={pairing.session?.role === 'owner' ? pairing.clearMessage : undefined}
        hasMessage={projectorMessages.some(message => Date.parse(message.expiresAt) > Date.now())}
      />

      {/* Modal: create a fully custom mission or Super Scramble */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-white flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-amber-400" /> Create a Custom Activity
            </h3>
            <p className="text-sm text-slate-400">
              {isLiveCounselor
                ? 'Create a regular mission. Only the Program Manager can create or change a Super Scramble.'
                : 'Enter the activity yourself. Super Scramble prompts and answers are saved exactly as written—nothing is generated.'}
            </p>

            <form onSubmit={handleSaveCustomActivity} className="space-y-4">
              <label className="block">
                <span className="text-xs font-bold text-slate-300 block mb-1">Activity type *</span>
                <select
                  required
                  value={newActivity.type}
                  onChange={(e) => setNewActivity({ ...newActivity, type: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  {(!pairing.isPaired || isLiveOwner) && <option value="Super Scramble">Super Scramble</option>}
                  <option value="Mission">Mission</option>
                </select>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ActivityField
                  label="Activity name *"
                  required
                  autoFocus
                  placeholder="Name this activity"
                  maxLength={300}
                  value={newActivity.title}
                  onChange={(value) => setNewActivity({ ...newActivity, title: value })}
                />
                <ActivityField
                  label="Location *"
                  required
                  placeholder="Gym, playground, classroom..."
                  maxLength={100}
                  value={newActivity.location}
                  onChange={(value) => setNewActivity({ ...newActivity, location: value })}
                />
              </div>

              <ActivityField
                label="Points *"
                type="number"
                min={0}
                max={1000000}
                step={1}
                required
                value={newActivity.points}
                onChange={(value) => setNewActivity({ ...newActivity, points: value })}
              />

              {newActivity.type === 'Super Scramble' && (
                <div className="space-y-4 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
                  <p className="text-sm font-bold text-amber-200">Type both the board prompt and answer key. The app will not scramble the letters.</p>
                  <ActivityField
                    label="Whiteboard prompt *"
                    required
                    multiline
                    placeholder="Enter the exact letters or phrase students will see"
                    maxLength={2000}
                    value={newActivity.scrambledPhrase}
                    onChange={(value) => setNewActivity({ ...newActivity, scrambledPhrase: value })}
                  />
                  <ActivityField
                    label="Answer key *"
                    required
                    multiline
                    placeholder="Enter the answer exactly as you want it shown"
                    maxLength={2000}
                    value={newActivity.solvedPhrase}
                    onChange={(value) => setNewActivity({ ...newActivity, solvedPhrase: value })}
                  />
                  <ActivityField
                    label="Hint"
                    multiline
                    placeholder="Optional hint for the group"
                    maxLength={2000}
                    value={newActivity.hint}
                    onChange={(value) => setNewActivity({ ...newActivity, hint: value })}
                  />
                </div>
              )}

              <div className="space-y-4">
                <ActivityField
                  label={newActivity.type === 'Mission' ? 'Counselor steps *' : 'Counselor steps'}
                  required={newActivity.type === 'Mission'}
                  multiline
                  placeholder="Write the activity instructions"
                  maxLength={10000}
                  value={newActivity.steps}
                  onChange={(value) => setNewActivity({ ...newActivity, steps: value })}
                />
                <ActivityField
                  label="Character lesson"
                  multiline
                  placeholder="Optional learning goal or takeaway"
                  maxLength={5000}
                  value={newActivity.lesson}
                  onChange={(value) => setNewActivity({ ...newActivity, lesson: value })}
                />
                <ActivityField
                  label="Materials"
                  multiline
                  placeholder="Optional materials list"
                  maxLength={5000}
                  value={newActivity.materials}
                  onChange={(value) => setNewActivity({ ...newActivity, materials: value })}
                />
                <ActivityField
                  label="Make it harder"
                  multiline
                  placeholder="Optional challenge variation"
                  maxLength={5000}
                  value={newActivity.harder}
                  onChange={(value) => setNewActivity({ ...newActivity, harder: value })}
                />
                <ActivityField
                  label="Safety notes"
                  multiline
                  placeholder="Optional safety information"
                  maxLength={5000}
                  value={newActivity.safety}
                  onChange={(value) => setNewActivity({ ...newActivity, safety: value })}
                />
              </div>

              {activityError && <div role="alert" className="rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">{activityError}</div>}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setNewActivity(createEmptyActivity());
                    setActivityError('');
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
                  {activitySubmitting ? 'Saving…' : 'Save Activity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityField({ label, value, onChange, placeholder, required = false, multiline = false, autoFocus = false, type = 'text', min, max, maxLength, step }) {
  const controlClass = "w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500";
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-300 block mb-1">{label}</span>
      {multiline ? (
        <textarea
          required={required}
          autoFocus={autoFocus}
          rows={3}
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={controlClass}
        />
      ) : (
        <input
          type={type}
          required={required}
          autoFocus={autoFocus}
          min={min}
          max={max}
          maxLength={maxLength}
          step={step}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={controlClass}
        />
      )}
    </label>
  );
}