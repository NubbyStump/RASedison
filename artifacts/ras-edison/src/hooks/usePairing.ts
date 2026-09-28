import { useCallback, useEffect, useRef, useState } from 'react';

// Cryptographically secure UUID fallback for older mainstream browsers (e.g. iOS < 15.4 or insecure contexts)
// This preserves entropy and does not weaken tokens.
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return ('10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (
      (c as unknown as number) ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> ((c as unknown as number) / 4)))
    ).toString(16)
  ));
};

const TOKEN_KEY = 'ras_edison_pairing_token_v1';

export function localCalendarDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type PairingState = {
  groups: any[];
  history: any[];
  lapRecords: any[];
  monthlyRecords: any[];
  activities: any[];
  pendingPointApprovals: Array<{
    id: string;
    groupId: string;
    groupName: string;
    amount: number;
    setScore?: number;
    reason: string;
    specialMentions?: string;
    submittedById: string;
    submittedByName: string;
    submittedAt: string;
    dueAt: string;
  }>;
};

export type ProjectorMessage = {
  id: string;
  text: string;
  senderName: string;
  senderRole: 'owner' | 'counselor';
  createdAt: string;
  expiresAt: string;
};

export type ChatMessage = {
  id: string;
  text: string;
  senderId?: string;
  senderName: string;
  senderRole: 'owner' | 'counselor';
  createdAt: string;
};

export type PairingSession = {
  roomId: string;
  code: string;
  role: 'owner' | 'counselor';
  memberId: string;
  version: number;
  state: PairingState;
  groupId: string | null;
  assignmentDate: string | null;
  members: Array<{
    id: string;
    name: string;
    role: string;
    groupId: string | null;
    assignmentDate: string | null;
  }>;
  projectorMessages: ProjectorMessage[];
  chatMessages: ChatMessage[];
  token?: string;
};

export type PairingStatus = 'local' | 'connecting' | 'connected' | 'reconnecting';

type PairingCommand =
  | { type: 'addPoints'; payload: { groupId: string; amount: number; reason: string; specialMentions?: string } }
  | { type: 'reduceGroupPoints'; payload: { groupId: string; mode: 'half' | 'all'; reason: string; specialMentions?: string } }
  | { type: 'setGroupPoints'; payload: { groupId: string; score: number; reason: string; specialMentions?: string } }
  | { type: 'approvePoints'; payload: { requestId: string } }
  | { type: 'rejectPoints'; payload: { requestId: string } }
  | { type: 'undo'; payload: { logId: string } }
  | { type: 'resetMonth'; payload: { month: string } }
  | { type: 'saveLap'; payload: { record: any } }
  | { type: 'deleteLap'; payload: { id: string } }
  | { type: 'addActivity'; payload: { activity: any } }
  | { type: 'deleteActivity'; payload: { id: string } }
  | { type: 'clearActivities'; payload: Record<string, never> }
  | { type: 'toggleReward'; payload: { id: string } };

function messageFromResponse(body: any, fallback: string) {
  return body?.error || body?.message || fallback;
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`The pairing server returned an invalid response (${response.status}).`);
  }
}

export function usePairing() {
  const initialToken = typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY);
  const tokenRef = useRef<string | null>(initialToken);
  const sessionRef = useRef<PairingSession | null>(null);
  const generationRef = useRef(0);
  const pollTimerRef = useRef<number | null>(null);
  const pollControllerRef = useRef<AbortController | null>(null);
  const pollRunningRef = useRef(false);
  const stickyErrorRef = useRef(false);
  const pendingOperationsRef = useRef(0);

  const [session, setSession] = useState<PairingSession | null>(null);
  const [status, setStatus] = useState<PairingStatus>(initialToken ? 'connecting' : 'local');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [isPaired, setIsPaired] = useState(Boolean(initialToken));
  const [today, setToday] = useState(localCalendarDate);

  useEffect(() => {
    const updateToday = () => setToday(localCalendarDate());
    const timer = window.setInterval(updateToday, 30_000);
    window.addEventListener('focus', updateToday);
    document.addEventListener('visibilitychange', updateToday);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', updateToday);
      document.removeEventListener('visibilitychange', updateToday);
    };
  }, []);

  const beginOperation = useCallback(() => {
    pendingOperationsRef.current += 1;
    setBusy(true);
  }, []);

  const endOperation = useCallback(() => {
    pendingOperationsRef.current = Math.max(0, pendingOperationsRef.current - 1);
    setBusy(pendingOperationsRef.current > 0);
  }, []);

  const applySession = useCallback((next: PairingSession, generation: number, expectedRoom?: string) => {
    if (generationRef.current !== generation || !tokenRef.current) return false;
    if (expectedRoom && next.roomId !== expectedRoom) return false;
    const current = sessionRef.current;
    if (current && current.roomId === next.roomId && next.version < current.version) return false;

    const merged = { ...next, token: undefined };
    sessionRef.current = merged;
    setSession(merged);
    if (next.token) {
      tokenRef.current = next.token;
      localStorage.setItem(TOKEN_KEY, next.token);
    }
    setIsPaired(true);
    setStatus('connected');
    if (!stickyErrorRef.current) setError('');
    return true;
  }, []);

  const authenticatedRequest = useCallback(async (
    path: string,
    init: RequestInit,
    generation: number,
    expectedRoom?: string,
  ) => {
    const token = tokenRef.current;
    if (!token) throw new Error('This device is not paired.');
    const response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
    const body = await readJson(response);
    if (generationRef.current !== generation || tokenRef.current !== token) {
      throw new Error('The pairing session changed before the request completed.');
    }
    if (response.status === 401) {
      generationRef.current += 1;
      pollControllerRef.current?.abort();
      tokenRef.current = null;
      sessionRef.current = null;
      localStorage.removeItem(TOKEN_KEY);
      setSession(null);
      setIsPaired(false);
      setStatus('local');
      stickyErrorRef.current = true;
      setError('You were logged out because this session ended or the Program Manager removed you. This device’s local data was not changed; join a session again to reconnect.');
      throw new Error('The pairing session is no longer authorized.');
    }
    if (!response.ok) throw new Error(messageFromResponse(body, `Pairing request failed (${response.status}).`));
    if (expectedRoom && body?.roomId && body.roomId !== expectedRoom) {
      throw new Error('The pairing server returned a different room.');
    }
    return body;
  }, []);

  const refresh = useCallback(async () => {
    if (!tokenRef.current || pollRunningRef.current) return;
    pollRunningRef.current = true;
    const generation = generationRef.current;
    const expectedRoom = sessionRef.current?.roomId;
    const controller = new AbortController();
    pollControllerRef.current = controller;
    try {
      const next = await authenticatedRequest(
        '/api/pairing/session',
        { method: 'GET', signal: controller.signal },
        generation,
        expectedRoom,
      );
      applySession(next, generation, expectedRoom);
    } catch (requestError) {
      if ((requestError as Error).name !== 'AbortError' && generationRef.current === generation && tokenRef.current) {
        setStatus(sessionRef.current ? 'reconnecting' : 'connecting');
        if (!stickyErrorRef.current) {
          setError((requestError as Error).message || 'Unable to reconnect to the paired room.');
        }
      }
    } finally {
      if (generationRef.current === generation) pollRunningRef.current = false;
    }
  }, [applySession, authenticatedRequest]);

  useEffect(() => {
    let stopped = false;
    const schedulePoll = () => {
      if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
      if (!stopped && tokenRef.current) pollTimerRef.current = window.setTimeout(poll, 1000);
    };
    const poll = async () => {
      await refresh();
      schedulePoll();
    };
    if (tokenRef.current) void poll();

    const refreshNow = () => {
      if (!tokenRef.current) return;
      if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
      void refresh().finally(schedulePoll);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshNow();
    };
    window.addEventListener('focus', refreshNow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
      pollControllerRef.current?.abort();
      window.removeEventListener('focus', refreshNow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh, isPaired]);

  const establish = useCallback(async (
    path: '/api/pairing/create' | '/api/pairing/join',
    body: Record<string, unknown>,
  ) => {
    const generation = ++generationRef.current;
    pollControllerRef.current?.abort();
    pollRunningRef.current = false;
    beginOperation();
    stickyErrorRef.current = false;
    setStatus('connecting');
    setError('');
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const next = await readJson(response);
      if (!response.ok) throw new Error(messageFromResponse(next, `Pairing request failed (${response.status}).`));
      if (generationRef.current !== generation) return;
      if (!next.token) throw new Error('The pairing server did not return a session token.');
      tokenRef.current = next.token;
      localStorage.setItem(TOKEN_KEY, next.token);
      setIsPaired(true);
      applySession(next, generation);
    } catch (requestError) {
      if (generationRef.current === generation) {
        tokenRef.current = null;
        localStorage.removeItem(TOKEN_KEY);
        sessionRef.current = null;
        setSession(null);
        setIsPaired(false);
        setStatus('local');
        stickyErrorRef.current = true;
        setError((requestError as Error).message || 'Unable to pair this device.');
      }
      throw requestError;
    } finally {
      endOperation();
    }
  }, [applySession, beginOperation, endOperation]);

  const create = useCallback((name: string, password: string, state: PairingState) => (
    establish('/api/pairing/create', { name, password, state, groupId: null, assignmentDate: localCalendarDate() })
  ), [establish]);

  const join = useCallback((name: string, code: string, password: string, groupId: string) => (
    establish('/api/pairing/join', {
      name,
      password,
      code: code.trim().toUpperCase(),
      groupId,
      assignmentDate: localCalendarDate(),
    })
  ), [establish]);

  const updateAssignment = useCallback(async (groupId: string | null) => {
    if (!sessionRef.current) throw new Error('The paired room is still loading.');
    const generation = generationRef.current;
    const expectedRoom = sessionRef.current.roomId;
    beginOperation();
    stickyErrorRef.current = false;
    setError('');
    try {
      const next = await authenticatedRequest(
        '/api/pairing/assignment',
        {
          method: 'PATCH',
          body: JSON.stringify({ groupId, assignmentDate: localCalendarDate() }),
        },
        generation,
        expectedRoom,
      );
      applySession(next, generation, expectedRoom);
    } catch (requestError) {
      if (generationRef.current === generation) {
        stickyErrorRef.current = true;
        setError((requestError as Error).message || 'Unable to update your group.');
      }
      throw requestError;
    } finally {
      endOperation();
    }
  }, [applySession, authenticatedRequest, beginOperation, endOperation]);

  const command = useCallback(async ({ type, payload }: PairingCommand) => {
    if (!tokenRef.current || !sessionRef.current) {
      const requestError = new Error('Edits are blocked while the paired room is still loading.');
      stickyErrorRef.current = true;
      setError(requestError.message);
      throw requestError;
    }
    if (status !== 'connected') {
      const requestError = new Error('Edits are blocked while the paired room reconnects.');
      stickyErrorRef.current = true;
      setError(requestError.message);
      throw requestError;
    }
    const generation = generationRef.current;
    const expectedRoom = sessionRef.current.roomId;
    const id = generateUUID();
    beginOperation();
    stickyErrorRef.current = false;
    setError('');
    let lastError: unknown;
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const next = await authenticatedRequest(
            '/api/pairing/command',
            { method: 'POST', body: JSON.stringify({ id, type, payload }) },
            generation,
            expectedRoom,
          );
          applySession(next, generation, expectedRoom);
          return next as PairingSession;
        } catch (requestError) {
          lastError = requestError;
          const isNetworkError = requestError instanceof TypeError;
          if (!isNetworkError || attempt === 1) throw requestError;
        }
      }
      throw lastError;
    } catch (requestError) {
      if (generationRef.current === generation) {
        if (requestError instanceof TypeError) setStatus('reconnecting');
        stickyErrorRef.current = true;
        setError((requestError as Error).message || 'The shared edit failed.');
      }
      throw requestError;
    } finally {
      endOperation();
    }
  }, [applySession, authenticatedRequest, beginOperation, endOperation, status]);

  const sendMessage = useCallback(async (text: string) => {
    if (!tokenRef.current || !sessionRef.current) {
      throw new Error('Join a live session before sending a projector message.');
    }
    if (status !== 'connected') {
      throw new Error('Messages are blocked while the live session reconnects.');
    }
    const generation = generationRef.current;
    const expectedRoom = sessionRef.current.roomId;
    const id = generateUUID();
    beginOperation();
    let lastError: unknown;
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const next = await authenticatedRequest(
            '/api/pairing/message',
            { method: 'POST', body: JSON.stringify({ id, text }) },
            generation,
            expectedRoom,
          );
          applySession(next, generation, expectedRoom);
          return next as PairingSession;
        } catch (requestError) {
          lastError = requestError;
          if (!(requestError instanceof TypeError) || attempt === 1) throw requestError;
        }
      }
      throw lastError;
    } catch (requestError) {
      if (generationRef.current === generation && requestError instanceof TypeError) {
        setStatus('reconnecting');
      }
      throw requestError;
    } finally {
      endOperation();
    }
  }, [applySession, authenticatedRequest, beginOperation, endOperation, status]);

  const rotateCode = useCallback(async () => {
    if (!sessionRef.current) throw new Error('The paired room is still loading.');
    const generation = generationRef.current;
    const expectedRoom = sessionRef.current.roomId;
    beginOperation();
    stickyErrorRef.current = false;
    setError('');
    try {
      const next = await authenticatedRequest(
        '/api/pairing/rotate-code',
        { method: 'POST', body: '{}' },
        generation,
        expectedRoom,
      );
      applySession(next, generation, expectedRoom);
    } catch (requestError) {
      if (generationRef.current === generation) {
        stickyErrorRef.current = true;
        setError((requestError as Error).message);
      }
      throw requestError;
    } finally {
      endOperation();
    }
  }, [applySession, authenticatedRequest, beginOperation, endOperation]);

  const removeMember = useCallback(async (memberId: string) => {
    const current = sessionRef.current;
    if (!current) throw new Error('The paired room is still loading.');
    if (current.role !== 'owner') throw new Error('Only the Program Manager can remove counselors.');
    if (memberId === current.memberId) throw new Error('The Program Manager cannot remove themself.');
    const member = current.members.find((item) => item.id === memberId);
    if (!member || member.role === 'owner') throw new Error('That counselor is not available to remove.');

    const generation = generationRef.current;
    const expectedRoom = current.roomId;
    beginOperation();
    stickyErrorRef.current = false;
    setError('');
    try {
      const next = await authenticatedRequest(
        '/api/pairing/remove-member',
        { method: 'POST', body: JSON.stringify({ memberId }) },
        generation,
        expectedRoom,
      );
      applySession(next, generation, expectedRoom);
    } catch (requestError) {
      if (generationRef.current === generation) {
        stickyErrorRef.current = true;
        setError((requestError as Error).message || 'Unable to remove that counselor.');
      }
      throw requestError;
    } finally {
      endOperation();
    }
  }, [applySession, authenticatedRequest, beginOperation, endOperation]);

  const leave = useCallback(async () => {
    const generation = generationRef.current;
    beginOperation();
    stickyErrorRef.current = false;
    setError('');
    try {
      await authenticatedRequest(
        '/api/pairing/leave',
        { method: 'POST', body: '{}' },
        generation,
        sessionRef.current?.roomId,
      );
      if (generationRef.current === generation) {
        generationRef.current += 1;
        pollControllerRef.current?.abort();
        tokenRef.current = null;
        sessionRef.current = null;
        localStorage.removeItem(TOKEN_KEY);
        setSession(null);
        setIsPaired(false);
        setStatus('local');
      }
    } catch (requestError) {
      if (generationRef.current === generation) {
        setStatus(sessionRef.current ? 'reconnecting' : 'connecting');
        stickyErrorRef.current = true;
        setError((requestError as Error).message);
      }
      throw requestError;
    } finally {
      endOperation();
    }
  }, [authenticatedRequest, beginOperation, endOperation]);

  const end = useCallback(async () => {
    if (!sessionRef.current) throw new Error('The paired room is still loading.');
    const generation = generationRef.current;
    beginOperation();
    try {
      await authenticatedRequest('/api/pairing/end', { method: 'POST', body: '{}' }, generation, sessionRef.current.roomId);
      generationRef.current += 1;
      pollControllerRef.current?.abort();
      tokenRef.current = null;
      sessionRef.current = null;
      localStorage.removeItem(TOKEN_KEY);
      setSession(null);
      setIsPaired(false);
      setStatus('local');
      setError('');
    } finally {
      endOperation();
    }
  }, [authenticatedRequest, beginOperation, endOperation]);

  const clearMessage = useCallback(async () => {
    const current = sessionRef.current;
    if (!tokenRef.current || current?.role !== 'owner') {
      throw new Error('Only the Program Manager can clear projector messages.');
    }
    if (status !== 'connected') throw new Error('Wait for the live session to reconnect before clearing messages.');
    const generation = generationRef.current;
    beginOperation();
    try {
      const next = await authenticatedRequest(
        '/api/pairing/message', { method: 'DELETE' }, generation, current.roomId,
      );
      applySession(next, generation, current.roomId);
    } finally {
      endOperation();
    }
  }, [applySession, authenticatedRequest, beginOperation, endOperation, status]);

  const currentGroupId = session?.assignmentDate === today ? session.groupId : null;
  const needsDailyAssignment = Boolean(session && session.assignmentDate !== today);

  return {
    session,
    status,
    error,
    busy,
    isPaired,
    today,
    currentGroupId,
    needsDailyAssignment,
    create,
    join,
    updateAssignment,
    leave,
    end,
    rotateCode,
    removeMember,
    command,
    sendMessage,
    clearMessage,
  };
}