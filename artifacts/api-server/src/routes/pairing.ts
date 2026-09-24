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
  UpdatePairingAssignmentBody,
} from "@workspace/api-zod";
import {
  commandSchema,
  reducePairingState,
  type PairingCommand,
  type PairingState,
} from "../lib/pairing";

const router: IRouter = Router();
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const attempts = new Map<string, { count: number; reset: number }>();
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_SCRYPT_COST = 16_384;
const PASSWORD_ERROR = "Invalid room code or password";
const UNPROTECTED_ROOM_ERROR = "This room cannot accept new joins; the host must create a new protected room";
const OWNER_COMMANDS = new Set<PairingCommand["type"]>([
  "resetMonth",
  "toggleReward",
  "addActivity",
  "deleteActivity",
  "clearActivities",
]);

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

async function sessionFor(
  executor: Parameters<Parameters<typeof db.transaction>[0]>[0],
  member: typeof pairingMembers.$inferSelect,
  token?: string,
) {
  const [room] = await executor.select().from(pairingRooms)
    .where(eq(pairingRooms.id, member.roomId)).limit(1);
  if (!room) throw new Error("Room not found");
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
  return {
    roomId: room.id,
    code: room.code,
    role: member.role,
    memberId: member.id,
    groupId: member.groupId,
    assignmentDate: member.assignmentDate,
    version: room.version,
    state: room.state,
    members,
    ...(token ? { token } : {}),
  };
}

export async function executePairingCommand(
  member: typeof pairingMembers.$inferSelect,
  command: PairingCommand,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select id from pairing_rooms where id = ${member.roomId} for update`);
    const [activeMember] = await tx.select({
      id: pairingMembers.id,
      role: pairingMembers.role,
    }).from(pairingMembers)
      .where(and(eq(pairingMembers.id, member.id), isNull(pairingMembers.revokedAt))).limit(1);
    if (!activeMember) throw new Error("Unauthorized");
    if (OWNER_COMMANDS.has(command.type) && activeMember.role !== "owner") {
      throw new Error("Owner role required for this command");
    }
    const [duplicate] = await tx.select({ id: pairingCommands.id }).from(pairingCommands)
      .where(and(eq(pairingCommands.roomId, member.roomId), eq(pairingCommands.id, command.id))).limit(1);
    if (!duplicate) {
      const [room] = await tx.select().from(pairingRooms)
        .where(eq(pairingRooms.id, member.roomId)).limit(1);
      if (!room) throw new Error("Room not found");
      const state = reducePairingState(room.state as PairingState, command);
      await tx.update(pairingRooms).set({
        state,
        version: room.version + 1,
        updatedAt: new Date(),
      }).where(eq(pairingRooms.id, room.id));
      await tx.insert(pairingCommands).values({
        id: command.id,
        roomId: room.id,
        memberId: member.id,
      });
    }
    return sessionFor(tx, member);
  });
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
        }).returning();
        const [member] = await tx.insert(pairingMembers).values({
          roomId: room.id,
          name,
          role: "owner",
          groupId: parsed.data.groupId,
          assignmentDate: parsed.data.assignmentDate,
          tokenHash: hashToken(token),
        }).returning();
        return sessionFor(tx, member, token);
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
    const [room] = await tx.select().from(pairingRooms)
      .where(eq(pairingRooms.code, parsed.data.code.toUpperCase())).limit(1);
    if (!room) return null;
    if (room.endedAt) return "ended" as const;
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
    return sessionFor(tx, member, token);
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
  res.json(await db.transaction((tx) => sessionFor(tx, member)));
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
    await tx.execute(sql`select id from pairing_rooms where id = ${member.roomId} for update`);
    const [room] = await tx.select().from(pairingRooms)
      .where(eq(pairingRooms.id, member.roomId)).limit(1);
    if (!room) return null;
    if (member.role === "counselor" && parsed.data.groupId === null) {
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
    return sessionFor(tx, updatedMember);
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

router.post("/pairing/rotate-code", async (req, res): Promise<void> => {
  const member = await authenticate(req);
  if (!member) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (member.role !== "owner") {
    res.status(403).json({ error: "Owner role required" });
    return;
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`select id from pairing_rooms where id = ${member.roomId} for update`);
        await tx.update(pairingRooms).set({ code: makeCode(), updatedAt: new Date() })
          .where(eq(pairingRooms.id, member.roomId));
        return sessionFor(tx, member);
      });
      res.json(result);
      return;
    } catch (error) {
      if ((error as { code?: string }).code !== "23505" || attempt === 4) throw error;
    }
  }
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