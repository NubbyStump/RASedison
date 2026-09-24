import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, pairingMembers, pairingRooms } from "@workspace/db";
import { commandSchema, reducePairingState, type PairingState } from "./pairing";
import {
  executePairingCommand,
  hashPassword,
  passwordMatches,
} from "../routes/pairing";

const roomIds: string[] = [];
const baseState = (): PairingState => ({
  groups: [{ id: "ladybugs", name: "Ladybugs", score: 0 }],
  history: [],
  lapRecords: [],
  monthlyRecords: [],
  activities: [],
});

after(async () => {
  for (const id of roomIds) {
    await db.delete(pairingRooms).where(eq(pairingRooms.id, id));
  }
});

test("reducer records the actual clamped delta and undo reverses it", () => {
  const added = reducePairingState(baseState(), {
    id: randomUUID(),
    type: "addPoints",
    payload: { groupId: "ladybugs", amount: -10, reason: "Correction" },
  });
  assert.equal(added.groups[0].score, 0);
  assert.equal(added.history[0].amount, 0);

  const scored = reducePairingState(baseState(), {
    id: randomUUID(),
    type: "addPoints",
    payload: { groupId: "ladybugs", amount: 7, reason: "Reward" },
  });
  const undone = reducePairingState(scored, {
    id: randomUUID(),
    type: "undo",
    payload: { logId: scored.history[0].id },
  });
  assert.equal(undone.groups[0].score, 0);
  assert.equal(undone.history.length, 0);
});

test("command validation rejects malformed and extra payload fields", () => {
  assert.equal(commandSchema.safeParse({
    id: randomUUID(),
    type: "addPoints",
    payload: { groupId: "ladybugs", amount: Number.NaN, reason: "x" },
  }).success, false);
  assert.equal(commandSchema.safeParse({
    id: randomUUID(),
    type: "clearActivities",
    payload: { unexpected: true },
  }).success, false);
});

test("room passwords use salted scrypt hashes and timing-safe verification", async () => {
  const first = await hashPassword("1234");
  const second = await hashPassword("1234");
  assert.notEqual(first, second);
  assert.equal(first.includes("1234"), false);
  assert.equal(await passwordMatches("1234", first), true);
  assert.equal(await passwordMatches("4321", first), false);
  assert.equal(await passwordMatches("1234", "malformed"), false);
});

test("room lock prevents lost updates and command ids are idempotent", async () => {
  const [room] = await db.insert(pairingRooms).values({
    code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    state: baseState(),
  }).returning();
  roomIds.push(room.id);
  const [member] = await db.insert(pairingMembers).values({
    roomId: room.id,
    name: "Test owner",
    role: "owner",
    tokenHash: randomUUID(),
  }).returning();

  const seeded = await executePairingCommand(member, {
    id: randomUUID(),
    type: "addPoints",
    payload: { groupId: "ladybugs", amount: 2, reason: "Seed" },
  });
  const seedLogId = (seeded.state as PairingState).history[0].id;
  const firstId = randomUUID();
  const first = {
    id: firstId,
    type: "addPoints" as const,
    payload: { groupId: "ladybugs", amount: 3, reason: "One" },
  };
  await Promise.all([
    executePairingCommand(member, first),
    executePairingCommand(member, {
      id: randomUUID(),
      type: "addPoints",
      payload: { groupId: "ladybugs", amount: 4, reason: "Two" },
    }),
  ]);
  const replay = await executePairingCommand(member, first);
  assert.equal((replay.state as PairingState).groups[0].score, 9);
  assert.equal(replay.version, 4);

  const [added, undone] = await Promise.all([
    executePairingCommand(member, {
      id: randomUUID(),
      type: "addPoints",
      payload: { groupId: "ladybugs", amount: 5, reason: "Concurrent" },
    }),
    executePairingCommand(member, {
      id: randomUUID(),
      type: "undo",
      payload: { logId: seedLogId },
    }),
  ]);
  const latest = added.version > undone.version ? added : undone;
  assert.equal(latest.version, 6);
  assert.equal((latest.state as PairingState).groups[0].score, 12);
});

test("revoked member cannot execute a command", async () => {
  const [room] = await db.insert(pairingRooms).values({
    code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    state: baseState(),
  }).returning();
  roomIds.push(room.id);
  const [member] = await db.insert(pairingMembers).values({
    roomId: room.id,
    name: "Revoked",
    role: "counselor",
    tokenHash: randomUUID(),
    revokedAt: new Date(),
  }).returning();
  await assert.rejects(
    executePairingCommand(member, {
      id: randomUUID(),
      type: "clearActivities",
      payload: {},
    }),
    /Unauthorized/,
  );
});

test("counselors can score but owner-only commands are rejected before mutation", async () => {
  const [room] = await db.insert(pairingRooms).values({
    code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    state: baseState(),
  }).returning();
  roomIds.push(room.id);
  const [member] = await db.insert(pairingMembers).values({
    roomId: room.id,
    name: "Counselor",
    role: "counselor",
    groupId: "ladybugs",
    assignmentDate: "2025-01-01",
    tokenHash: randomUUID(),
  }).returning();

  const scored = await executePairingCommand(member, {
    id: randomUUID(),
    type: "addPoints",
    payload: { groupId: "ladybugs", amount: 5, reason: "Good work" },
  });
  assert.equal((scored.state as PairingState).groups[0].score, 5);

  await assert.rejects(
    executePairingCommand(member, {
      id: randomUUID(),
      type: "clearActivities",
      payload: {},
    }),
    /Owner role required/,
  );
  const [unchanged] = await db.select().from(pairingRooms).where(eq(pairingRooms.id, room.id));
  assert.equal(unchanged.version, 2);
  assert.equal((unchanged.state as PairingState).groups[0].score, 5);
});