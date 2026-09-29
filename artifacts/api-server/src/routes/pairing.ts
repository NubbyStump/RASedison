import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, pairingCommands, pairingMembers, pairingRooms } from "@workspace/db";
import {
  CreatePairingBody,
  JoinPairingBody,
  RemovePairingMemberBody,
  UpdatePairingAssignmentBody,
} from "@workspace/api-zod";
import {
  commandSchema,
  projectorMessageInputSchema,
  reducePairingState,
  type PairingCommand,
  type PointApproval,
  type PairingState,
} from "../lib/pairing";

const router: IRouter = Router();
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const attempts = new Map<string, { count: number; reset: number }>();
const messageAttempts = new Map<string, number[]>();
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_SCRYPT_COST = 16_384;
const PASSWORD_ERROR = "Invalid room code or password";
const UNPROTECTED_ROOM_ERROR = "This room cannot accept new joins; the host must create a new protected room";
const OWNER_COMMANDS = new Set<PairingCommand["type"]>([
  "resetMonth",
  "toggleReward",
  "deleteActivity",
  "clearActivities",
  "approvePoints",
  "rejectPoints",
]);
type PairingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PairingRoom = typeof pairingRooms.$inferSelect;
const PROJECTOR_MESSAGE_LIFETIME_MS = 8_000;
const PROJECTOR_MESSAGE_LIMIT = 20;
const CHAT_MESSAGE_LIMIT = 100;
const PROJECTOR_MESSAGE_RATE_WINDOW_MS = 10_000;
const PROJECTOR_MESSAGE_RATE_LIMIT = 5;
const APPROVAL_HISTORY_LIMIT = 100;

export function calendarMonth(
  now = new Date(),
  timeZone = "America/Los_Angeles",
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error(`Could not determine calendar month for ${timeZone}`);
  return `${year}-${month}`;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const makeToken = () => randomBytes(32).toString("base64url");
const makeCode = () => Array.from(randomBytes(10), (byte) => alphabet[byte % alphabet.length]).join("");

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derivePasswordKey(password, salt, PASSWORD_KEY_LENGTH, PASSWORD_SCRYPT_COST);
  return `scrypt$${PASSWORD_SCRYPT_COST}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

function derivePasswordKey(
  password: string,
  salt: Buffer,
  length: number,
  cost: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, { N: cost }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function passwordMatches(password: string, encoded: string): Promise<boolean> {
  const [algorithm, costValue, saltValue, keyValue, ...extra] = encoded.split("$");
  const cost = Number(costValue);
  if (
    algorithm !== "scrypt"
    || extra.length > 0
    || cost !== PASSWORD_SCRYPT_COST
    || !saltValue
    || !keyValue
  ) return false;
  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(keyValue, "base64url");
    if (salt.length !== 16 || expected.length !== PASSWORD_KEY_LENGTH) return false;
    const actual = await derivePasswordKey(password, salt, expected.length, cost);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function roomHasGroup(state: unknown, groupId: string): boolean {
  if (!state || typeof state !== "object") return false;
  const groups = (state as { groups?: unknown }).groups;
  return Array.isArray(groups) && groups.some((group) => (
    group && typeof group === "object" && (group as { id?: unknown }).id === groupId
  ));
}

function validAssignmentDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function limited(req: Request): boolean {
  const key = req.ip || "unknown";
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.reset <= now) {
    attempts.set(key, { count: 1, reset: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 20;
}

function clearLimit(req: Request): void {
  attempts.delete(req.ip || "unknown");
}

function joinLimited(req: Request): boolean {
  const current = attempts.get(req.ip || "unknown");
  if (!current) return false;
  if (current.reset <= Date.now()) {
    attempts.delete(req.ip || "unknown");
    return false;
  }
  return current.count >= 20;
}

function recordFailedJoin(req: Request): void {
  const key = req.ip || "unknown";
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.reset <= now) {
    attempts.set(key, { count: 1, reset: now + 60_000 });
    return;
  }
  current.count += 1;
}

function bearer(req: Request): string | null {
  const value = req.get("authorization");
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice(7);
  return token.length >= 32 && token.length <= 200 ? token : null;
}

async function authenticate(req: Request) {
  const token = bearer(req);
  if (!token) return null;
  const [member] = await db.select().from(pairingMembers).where(and(
    eq(pairingMembers.tokenHash, hashToken(token)),
    isNull(pairingMembers.revokedAt),
  )).limit(1);
  return member ?? null;
}

async function lockRoomById(
  tx: PairingTransaction,
  roomId: string,
): Promise<PairingRoom | null> {
  await tx.execute(sql`select id from pairing_rooms where id = ${roomId} for update`);
  const [room] = await tx.select().from(pairingRooms)
    .where(eq(pairingRooms.id, roomId)).limit(1);
  return room ?? null;
}

export async function rolloverActivitiesForLockedRoom(
  tx: PairingTransaction,
  room: PairingRoom,
  month = calendarMonth(new Date(), room.timeZone),
): Promise<PairingRoom> {
  if (room.activitiesMonth === month) return room;
  const state = structuredClone(room.state as PairingState);
  state.activities = [];
  const [updated] = await tx.update(pairingRooms).set({
    state,
    activitiesMonth: month,
    version: room.version + 1,
    updatedAt: new Date(),
  }).where(eq(pairingRooms.id, room.id)).returning();
  if (!updated) throw new Error("Room not found");
  return updated;
}

function resolveDueApprovals(state: PairingState, now = new Date()): boolean {
  const requests = state.pendingPointApprovals;
  if (!requests?.length) return false;
  let changed = false;
  for (const request of requests) {
    if ((request.status ?? "pending") !== "pending" || Date.parse(request.dueAt) > now.getTime()) continue;
    const group = state.groups.find((item) => item.id === request.groupId);
    if (!group) {
      request.status = "autoApproved";
      request.resolvedAt = now.toISOString();
      changed = true;
      continue;
    }
    const oldScore = group.score;
    group.score = request.setScore === undefined
      ? Math.max(0, Math.min(1_000_000_000, oldScore + request.amount))
      : request.setScore;
    state.history = [{
      id: request.id,
      groupId: group.id,
      groupName: group.name,
      amount: group.score - oldScore,
      reason: request.reason,
      ...(request.specialMentions ? { specialMentions: request.specialMentions } : {}),
      submittedByName: request.submittedByName,
      timestamp: request.submittedAt,
    }, ...state.history].slice(0, 36);
    request.status = "autoApproved";
    request.resolvedAt = now.toISOString();
    changed = true;
  }
  return changed;
}

export async function resolveDuePointApprovals(): Promise<void> {
  await db.transaction(async (tx) => {
    const rooms = await tx.select().from(pairingRooms);
    for (const candidate of rooms) {
      const room = await lockRoomById(tx, candidate.id);
      if (!room || room.endedAt) continue;
      const state = structuredClone(room.state as PairingState);
      if (!resolveDueApprovals(state)) continue;
      await tx.update(pairingRooms).set({
        state,
        version: room.version + 1,
        updatedAt: new Date(),
      }).where(eq(pairingRooms.id, room.id));
    }
  });
}

async function activeMemberForRoom(
  tx: PairingTransaction,
  memberId: string,
  roomId: string,
) {
  const [member] = await tx.select().from(pairingMembers).where(and(
    eq(pairingMembers.id, memberId),
    eq(pairingMembers.roomId, roomId),
    isNull(pairingMembers.revokedAt),
  )).limit(1);
  return member ?? null;
}

async function sessionFor(
  executor: PairingTransaction,
  member: typeof pairingMembers.$inferSelect,
  token?: string,
  lockedRoom?: PairingRoom,
) {
  let room = lockedRoom ?? (await executor.select().from(pairingRooms)
    .where(eq(pairingRooms.id, member.roomId)).limit(1))[0];
  if (!room) throw new Error("Room not found");
  const resolvedState = structuredClone(room.state as PairingState);
  if (resolveDueApprovals(resolvedState)) {
    const [updated] = await executor.update(pairingRooms).set({
      state: resolvedState,
      version: room.version + 1,
      updatedAt: new Date(),
    }).where(eq(pairingRooms.id, room.id)).returning();
    if (updated) room = updated;
  }
  const members = await executor.select({
    id: pairingMembers.id,
    name: pairingMembers.name,
    role: pairingMembers.role,
    groupId: pairingMembers.groupId,
    assignmentDate: pairingMembers.assignmentDate,
  }).from(pairingMembers).where(and(
    eq(pairingMembers.roomId, room.id),
    isNull(pairingMembers.revokedAt),
  )).orderBy(pairingMembers.createdAt);
  const now = Date.now();
  const projectorMessages = room.projectorMessages
    .filter((message) => Date.parse(message.expiresAt) > now)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .slice(-PROJECTOR_MESSAGE_LIMIT);
  const chatMessages = [...room.projectorMessages]
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .slice(-CHAT_MESSAGE_LIMIT);
  return {
    roomId: room.id,
    code: room.code,
    role: member.role,
    memberId: member.id,
    groupId: member.groupId,
    assignmentDate: member.assignmentDate,
    version: room.version,
    timeZone: room.timeZone,
    activitiesMonth: room.activitiesMonth,
    state: room.state,
    members,
    projectorMessages,
    chatMessages,
    ...(token ? { token } : {}),
  };
}

function messageRateLimited(memberId: string, now: number): boolean {
  const recent = (messageAttempts.get(memberId) ?? [])
    .filter((sentAt) => sentAt > now - PROJECTOR_MESSAGE_RATE_WINDOW_MS);
  if (recent.length >= PROJECTOR_MESSAGE_RATE_LIMIT) {
    messageAttempts.set(memberId, recent);
    return true;
  }
  recent.push(now);
  messageAttempts.set(memberId, recent);
  return false;
}

export async function sendProjectorMessage(
  member: typeof pairingMembers.$inferSelect,
  input: { id: string; text: string },
) {
  const result = await db.transaction(async (tx) => {
    const lockedRoom = await lockRoomById(tx, member.roomId);
    if (!lockedRoom || lockedRoom.endedAt) return { error: "unauthorized" as const };
    let room = await rolloverActivitiesForLockedRoom(tx, lockedRoom);
    const activeMember = await activeMemberForRoom(tx, member.id, room.id);
    if (!activeMember) return { error: "unauthorized" as const };

    if (room.projectorMessages.some((message) => message.id === input.id)) {
      return { session: await sessionFor(tx, activeMember, undefined, room) };
    }
    const now = new Date();
    if (messageRateLimited(activeMember.id, now.getTime())) {
      return { error: "rate-limited" as const };
    }
    const projectorMessages = [...room.projectorMessages, {
      id: input.id,
      text: input.text,
      senderId: activeMember.id,
      senderName: activeMember.name,
      senderRole: activeMember.role,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + PROJECTOR_MESSAGE_LIFETIME_MS).toISOString(),
    }]
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
      .slice(-CHAT_MESSAGE_LIMIT);
    const [updatedRoom] = await tx.update(pairingRooms).set({
      projectorMessages,
      version: room.version + 1,
      updatedAt: now,
    }).where(eq(pairingRooms.id, room.id)).returning();
    if (!updatedRoom) return { error: "unauthorized" as const };
    room = updatedRoom;
    return { session: await sessionFor(tx, activeMember, undefined, room) };
  });
  if ("error" in result) {
    throw new Error(result.error === "rate-limited" ? "Too many messages" : "Unauthorized");
  }
  return result.session;
}

export async function clearProjectorMessage(member: typeof pairingMembers.$inferSelect) {
  return db.transaction(async (tx) => {
    const room = await lockRoomById(tx, member.roomId);
    if (!room || room.endedAt) throw new Error("Unauthorized");
    const activeMember = await activeMemberForRoom(tx, member.id, room.id);
    if (!activeMember) throw new Error("Unauthorized");
    if (activeMember.role !== "owner") throw new Error("Owner role required");
    // Clear the whole buffer so a previously replaced message cannot reappear.
    // Do not roll over activities: dismissal must only affect announcements.
    if (!room.projectorMessages.length) return sessionFor(tx, activeMember, undefined, room);
    const [updated] = await tx.update(pairingRooms).set({
      projectorMessages: [],
      version: room.version + 1,
      updatedAt: new Date(),
    }).where(eq(pairingRooms.id, room.id)).returning();
    return sessionFor(tx, activeMember, undefined, updated);
  });
}

export async function executePairingCommand(
  member: typeof pairingMembers.$inferSelect,
  command: PairingCommand,
) {
  const result = await db.transaction(async (tx) => {
    const lockedRoom = await lockRoomById(tx, member.roomId);
    if (!lockedRoom || lockedRoom.endedAt) return { error: "Unauthorized" as const };
    let room = await rolloverActivitiesForLockedRoom(tx, lockedRoom);
    const activeMember = await activeMemberForRoom(tx, member.id, room.id);
    if (!activeMember) return { error: "Unauthorized" as const };
    if (OWNER_COMMANDS.has(command.type) && activeMember.role !== "owner") {
      return { error: "Owner role required for this command" as const };
    }
    const [duplicate] = await tx.select({ id: pairingCommands.id }).from(pairingCommands)
      .where(and(eq(pairingCommands.roomId, member.roomId), eq(pairingCommands.id, command.id))).limit(1);
    if (!duplicate) {
      const state = structuredClone(room.state as PairingState);
      resolveDueApprovals(state);
      if (
        (
          command.type === "addPoints"
          || command.type === "reduceGroupPoints"
          || command.type === "setGroupPoints"
        )
        && activeMember.role === "counselor"
      ) {
        const groupId = command.payload.groupId;
        if (
          command.type === "addPoints"
          && command.payload.amount < 0
          && activeMember.groupId !== groupId
        ) {
          return { error: "Counselors may only remove points from their assigned group" as const };
        }
        if (
          (command.type === "reduceGroupPoints" || command.type === "setGroupPoints")
          && activeMember.groupId !== groupId
        ) {
          return { error: "Counselors may only remove points from their assigned group" as const };
        }
        const [owner] = await tx.select({ id: pairingMembers.id }).from(pairingMembers).where(and(
          eq(pairingMembers.roomId, room.id),
          eq(pairingMembers.role, "owner"),
          isNull(pairingMembers.revokedAt),
        )).limit(1);
        if (owner) {
          const group = state.groups.find((item) => item.id === groupId);
          if (!group) throw new Error("Group not found");
          if (command.type === "reduceGroupPoints" && group.score <= 0) {
            return { error: "There are no points to remove from this group" as const };
          }
          const amount = command.type === "addPoints"
            ? command.payload.amount
            : command.type === "reduceGroupPoints"
              ? command.payload.mode === "all"
                ? -group.score
                : -Math.ceil(group.score / 2)
              : command.payload.score - group.score;
          const submittedAt = new Date();
          const pending = state.pendingPointApprovals ?? [];
          pending.push({
            id: command.id,
            groupId: group.id,
            groupName: group.name,
            amount,
            ...(command.type === "setGroupPoints" ? { setScore: command.payload.score } : {}),
            reason: command.payload.reason,
            ...(command.payload.specialMentions ? { specialMentions: command.payload.specialMentions } : {}),
            submittedById: activeMember.id,
            submittedByName: activeMember.name,
            submittedAt: submittedAt.toISOString(),
            dueAt: new Date(submittedAt.getTime() + 60 * 60 * 1000).toISOString(),
            status: "pending",
          });
          state.pendingPointApprovals = pending;
        } else {
          return { error: "Program Manager approval is unavailable" as const };
        }
      } else if (command.type === "setGroupPoints" && activeMember.role === "owner") {
        const group = state.groups.find((item) => item.id === command.payload.groupId);
        if (!group) throw new Error("Group not found");
        const oldScore = group.score;
        group.score = command.payload.score;
        state.history = [{
          id: command.id,
          groupId: group.id,
          groupName: group.name,
          amount: group.score - oldScore,
          reason: command.payload.reason,
          ...(command.payload.specialMentions ? { specialMentions: command.payload.specialMentions } : {}),
          submittedByName: activeMember.name,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }, ...state.history].slice(0, 36);
      } else if (command.type === "reduceGroupPoints" || command.type === "setGroupPoints") {
        return { error: "Counselor role required for this command" as const };
      } else if (command.type === "approvePoints" || command.type === "rejectPoints") {
        const requests = state.pendingPointApprovals ?? [];
        const request = requests.find((item) => item.id === command.payload.requestId);
        if (!request) throw new Error("Point approval request not found");
        if ((request.status ?? "pending") === "pending") {
          const now = new Date();
          if (Date.parse(request.dueAt) <= now.getTime()) {
            resolveDueApprovals(state, now);
          } else if (command.type === "approvePoints") {
            const group = state.groups.find((item) => item.id === request.groupId);
            if (!group) throw new Error("Group not found");
            const oldScore = group.score;
            group.score = request.setScore === undefined
              ? Math.max(0, Math.min(1_000_000_000, oldScore + request.amount))
              : request.setScore;
            state.history = [{
              id: request.id,
              groupId: group.id,
              groupName: group.name,
              amount: group.score - oldScore,
              reason: request.reason,
              ...(request.specialMentions ? { specialMentions: request.specialMentions } : {}),
              submittedByName: request.submittedByName,
              timestamp: request.submittedAt,
            }, ...state.history].slice(0, 36);
            request.status = "approved";
            request.resolvedAt = now.toISOString();
          } else {
            request.status = "rejected";
            request.resolvedAt = now.toISOString();
          }
        }
        // Keep all unresolved requests, while bounding resolved audit outcomes.
        state.pendingPointApprovals = requests.filter((item) => (
          (item.status ?? "pending") === "pending" || requests.indexOf(item) >= requests.length - APPROVAL_HISTORY_LIMIT
        ));
      } else if (
        command.type === "addActivity"
        && command.payload.activity.type === "Super Scramble"
        && activeMember.role !== "owner"
      ) {
        return { error: "Only the Program Manager can set a Super Scramble" as const };
      } else {
        Object.assign(state, reducePairingState(state, command));
        if (command.type === "addPoints" && state.history[0]) {
          state.history[0].submittedByName = activeMember.name;
        }
      }
      const [updatedRoom] = await tx.update(pairingRooms).set({
        state,
        version: room.version + 1,
        updatedAt: new Date(),
      }).where(eq(pairingRooms.id, room.id)).returning();
      if (!updatedRoom) throw new Error("Room not found");
      room = updatedRoom;
      await tx.insert(pairingCommands).values({
        id: command.id,
        roomId: room.id,
        memberId: member.id,
      });
    }
    return { session: await sessionFor(tx, activeMember, undefined, room) };
  });
  if ("error" in result) throw new Error(result.error);
  return result.session;
}

router.post("/pairing/create", async (req, res): Promise<void> => {
  if (limited(req)) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }
  const parsed = CreatePairingBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const name = parsed.data.name.trim();
  if (
    !name
    || !validAssignmentDate(parsed.data.assignmentDate)
    || (parsed.data.groupId !== null && !roomHasGroup(parsed.data.state, parsed.data.groupId))
  ) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const token = makeToken();
  const passwordHash = await hashPassword(parsed.data.password);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await db.transaction(async (tx) => {
        const [room] = await tx.insert(pairingRooms).values({
          code: makeCode(),
          passwordHash,
          state: parsed.data.state,
          timeZone: "America/Los_Angeles",
          activitiesMonth: calendarMonth(),
        }).returning();
        const [member] = await tx.insert(pairingMembers).values({
          roomId: room.id,
          name,
          role: "owner",
          groupId: parsed.data.groupId,
          assignmentDate: parsed.data.assignmentDate,
          tokenHash: hashToken(token),
        }).returning();
        return sessionFor(tx, member, token, room);
      });
      res.json(result);
      return;
    } catch (error) {
      if ((error as { code?: string }).code !== "23505" || attempt === 4) throw error;
    }
  }
});

router.post("/pairing/join", async (req, res): Promise<void> => {
  const parsed = JoinPairingBody.strict().safeParse(req.body);
  const name = parsed.success ? parsed.data.name.trim() : "";
  if (!parsed.success || !name || !validAssignmentDate(parsed.data.assignmentDate)) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  if (joinLimited(req)) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }
  const token = makeToken();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`
      select id from pairing_rooms
      where code = ${parsed.data.code.toUpperCase()}
      for update
    `);
    const [foundRoom] = await tx.select().from(pairingRooms)
      .where(eq(pairingRooms.code, parsed.data.code.toUpperCase())).limit(1);
    if (!foundRoom) return null;
    if (foundRoom.endedAt) return "ended" as const;
    const room = await rolloverActivitiesForLockedRoom(tx, foundRoom);
    if (!room.passwordHash) return "unprotected" as const;
    if (!await passwordMatches(parsed.data.password, room.passwordHash)) return "bad-password" as const;
    if (!roomHasGroup(room.state, parsed.data.groupId)) return "invalid-group" as const;
    const [member] = await tx.insert(pairingMembers).values({
      roomId: room.id,
      name,
      role: "counselor",
      groupId: parsed.data.groupId,
      assignmentDate: parsed.data.assignmentDate,
      tokenHash: hashToken(token),
    }).returning();
    return sessionFor(tx, member, token, room);
  });
  if (!result) {
    recordFailedJoin(req);
    res.status(404).json({ error: PASSWORD_ERROR });
    return;
  }
  if (result === "bad-password") {
    recordFailedJoin(req);
    res.status(401).json({ error: PASSWORD_ERROR });
    return;
  }
  if (result === "unprotected") {
    res.status(409).json({ error: UNPROTECTED_ROOM_ERROR });
    return;
  }
  if (result === "ended") {
    res.status(410).json({ error: "This pairing room has ended" });
    return;
  }
  if (result === "invalid-group") {
    res.status(400).json({ error: "That group is not available in this room" });
    return;
  }
  clearLimit(req);
  res.json(result);
});

router.get("/pairing/session", async (req, res): Promise<void> => {
  const member = await authenticate(req);
  if (!member) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const lockedRoom = await lockRoomById(tx, member.roomId);
    if (!lockedRoom || lockedRoom.endedAt) return null;
    const room = await rolloverActivitiesForLockedRoom(tx, lockedRoom);
    const activeMember = await activeMemberForRoom(tx, member.id, room.id);
    if (!activeMember) return null;
    return sessionFor(tx, activeMember, undefined, room);
  });
  if (!result) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(result);
});

router.patch("/pairing/assignment", async (req, res): Promise<void> => {
  const member = await authenticate(req);
  if (!member) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = UpdatePairingAssignmentBody.strict().safeParse(req.body);
  if (!parsed.success || !validAssignmentDate(parsed.data.assignmentDate)) {
    res.status(400).json({ error: "Invalid assignment" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const lockedRoom = await lockRoomById(tx, member.roomId);
    if (!lockedRoom || lockedRoom.endedAt) return null;
    const room = await rolloverActivitiesForLockedRoom(tx, lockedRoom);
    const activeMember = await activeMemberForRoom(tx, member.id, room.id);
    if (!activeMember) return null;
    if (activeMember.role === "counselor" && parsed.data.groupId === null) {
      return "invalid-group" as const;
    }
    if (parsed.data.groupId !== null && !roomHasGroup(room.state, parsed.data.groupId)) {
      return "invalid-group" as const;
    }
    const [updatedMember] = await tx.update(pairingMembers).set({
      groupId: parsed.data.groupId,
      assignmentDate: parsed.data.assignmentDate,
    }).where(and(
      eq(pairingMembers.id, member.id),
      isNull(pairingMembers.revokedAt),
    )).returning();
    if (!updatedMember) return null;
    return sessionFor(tx, updatedMember, undefined, room);
  });
  if (!result) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (result === "invalid-group") {
    res.status(400).json({ error: "That group is not available in this room" });
    return;
  }
  res.json(result);
});

router.post("/pairing/command", async (req, res): Promise<void> => {
  const member = await authenticate(req);
  if (!member) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = commandSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid command" });
    return;
  }
  try {
    const result = await executePairingCommand(member, parsed.data);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (error instanceof Error && error.message === "Owner role required for this command") {
      res.status(403).json({ error: error.message });
      return;
    }
    if (error instanceof Error && /not found/i.test(error.message)) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.delete("/pairing/message", async (req, res): Promise<void> => {
  const member = await authenticate(req);
  if (!member) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    res.json(await clearProjectorMessage(member));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      res.status(401).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message === "Owner role required") {
      res.status(403).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.post("/pairing/message", async (req, res): Promise<void> => {
  const member = await authenticate(req);
  if (!member) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = projectorMessageInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid message" });
    return;
  }
  try {
    res.json(await sendProjectorMessage(member, parsed.data));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (error instanceof Error && error.message === "Too many messages") {
      res.status(429).json({ error: "Too many messages" });
      return;
    }
    throw error;
  }
});

router.post("/pairing/rotate-code", async (req, res): Promise<void> => {
  const member = await authenticate(req);
  if (!member) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await db.transaction(async (tx) => {
        const lockedRoom = await lockRoomById(tx, member.roomId);
        if (!lockedRoom || lockedRoom.endedAt) return "unauthorized" as const;
        let room = await rolloverActivitiesForLockedRoom(tx, lockedRoom);
        const activeMember = await activeMemberForRoom(tx, member.id, room.id);
        if (!activeMember) return "unauthorized" as const;
        if (activeMember.role !== "owner") return "forbidden" as const;
        const [updatedRoom] = await tx.update(pairingRooms)
          .set({ code: makeCode(), updatedAt: new Date() })
          .where(eq(pairingRooms.id, room.id)).returning();
        if (!updatedRoom) return "unauthorized" as const;
        room = updatedRoom;
        return sessionFor(tx, activeMember, undefined, room);
      });
      if (result === "unauthorized") {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (result === "forbidden") {
        res.status(403).json({ error: "Owner role required" });
        return;
      }
      res.json(result);
      return;
    } catch (error) {
      if ((error as { code?: string }).code !== "23505" || attempt === 4) throw error;
    }
  }
});

export async function removePairingMember(
  actor: typeof pairingMembers.$inferSelect,
  targetMemberId: string,
) {
  return db.transaction(async (tx) => {
    const lockedRoom = await lockRoomById(tx, actor.roomId);
    if (!lockedRoom || lockedRoom.endedAt) return { error: "unauthorized" as const };
    let room = await rolloverActivitiesForLockedRoom(tx, lockedRoom);
    const activeOwner = await activeMemberForRoom(tx, actor.id, room.id);
    if (!activeOwner) return { error: "unauthorized" as const };
    if (activeOwner.role !== "owner") return { error: "forbidden" as const };
    if (targetMemberId === activeOwner.id) return { error: "self" as const };

    const target = await activeMemberForRoom(tx, targetMemberId, room.id);
    if (!target) return { error: "not-found" as const };
    if (target.role === "owner") return { error: "owner" as const };

    const revokedAt = new Date();
    const [revoked] = await tx.update(pairingMembers).set({ revokedAt }).where(and(
      eq(pairingMembers.id, target.id),
      eq(pairingMembers.roomId, room.id),
      isNull(pairingMembers.revokedAt),
    )).returning();
    if (!revoked) return { error: "not-found" as const };

    const [updatedRoom] = await tx.update(pairingRooms).set({
      version: room.version + 1,
      updatedAt: revokedAt,
    }).where(eq(pairingRooms.id, room.id)).returning();
    if (!updatedRoom) return { error: "unauthorized" as const };
    room = updatedRoom;
    return { session: await sessionFor(tx, activeOwner, undefined, room) };
  });
}

router.post("/pairing/remove-member", async (req, res): Promise<void> => {
  const member = await authenticate(req);
  if (!member) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = RemovePairingMemberBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const result = await removePairingMember(member, parsed.data.memberId);
  if ("session" in result) {
    res.json(result.session);
    return;
  }
  if (result.error === "unauthorized") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (result.error === "forbidden") {
    res.status(403).json({ error: "Owner role required" });
    return;
  }
  if (result.error === "self" || result.error === "owner") {
    res.status(400).json({
      error: result.error === "self"
        ? "The room owner cannot remove themself"
        : "The room owner cannot be removed",
    });
    return;
  }
  res.status(404).json({ error: "Member not found in this room" });
});

router.post("/pairing/leave", async (req, res): Promise<void> => {
  const member = await authenticate(req);
  if (!member) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await db.update(pairingMembers).set({ revokedAt: new Date() })
    .where(eq(pairingMembers.id, member.id));
  res.json({ ok: true });
});

router.post("/pairing/end", async (req, res): Promise<void> => {
  const member = await authenticate(req);
  if (!member) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (member.role !== "owner") {
    res.status(403).json({ error: "Owner role required" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from pairing_rooms where id = ${member.roomId} for update`);
    const [activeOwner] = await tx.select({ role: pairingMembers.role }).from(pairingMembers)
      .where(and(eq(pairingMembers.id, member.id), isNull(pairingMembers.revokedAt))).limit(1);
    if (!activeOwner) return "unauthorized" as const;
    if (activeOwner.role !== "owner") return "forbidden" as const;
    const endedAt = new Date();
    await tx.update(pairingRooms).set({ endedAt, updatedAt: endedAt })
      .where(eq(pairingRooms.id, member.roomId));
    await tx.update(pairingMembers).set({ revokedAt: endedAt })
      .where(eq(pairingMembers.roomId, member.roomId));
    return "ok" as const;
  });
  if (result === "unauthorized") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (result === "forbidden") {
    res.status(403).json({ error: "Owner role required" });
    return;
  }
  res.json({ ok: true });
});

export default router;