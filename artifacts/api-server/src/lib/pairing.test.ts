import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { db, pairingMembers, pairingRooms } from "@workspace/db";
import {
  commandSchema,
  projectorMessageInputSchema,
  reducePairingState,
  type PairingState,
} from "./pairing";
import {
  calendarMonth,
  executePairingCommand,
  hashPassword,
  passwordMatches,
  removePairingMember,
  rolloverActivitiesForLockedRoom,
  sendProjectorMessage,
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

test("projector message validation trims plain text and rejects invalid input", () => {
  const id = randomUUID();
  assert.deepEqual(
    projectorMessageInputSchema.parse({ id, text: "  Meet at the gate  " }),
    { id, text: "Meet at the gate" },
  );
  for (const body of [
    { id, text: "   " },
    { id, text: "x".repeat(241) },
    { id, text: "hidden\u0000control" },
    { id: "not-a-uuid", text: "Hello" },
    { id, text: "Hello", extra: true },
  ]) {
    assert.equal(projectorMessageInputSchema.safeParse(body).success, false);
  }
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

test("calendar month uses the room timezone rather than UTC", () => {
  assert.equal(
    calendarMonth(new Date("2025-03-01T07:59:59.000Z"), "America/Los_Angeles"),
    "2025-02",
  );
  assert.equal(
    calendarMonth(new Date("2025-03-01T08:00:00.000Z"), "America/Los_Angeles"),
    "2025-03",
  );
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

test("counselors can submit points for approval but owner-only commands remain blocked", async () => {
  const [room] = await db.insert(pairingRooms).values({
    code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    state: baseState(),
  }).returning();
  roomIds.push(room.id);
  await db.insert(pairingMembers).values({
    roomId: room.id,
    name: "Manager",
    role: "owner",
    tokenHash: randomUUID(),
  });
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
  assert.equal((scored.state as PairingState).groups[0].score, 0);
  assert.equal((scored.state as PairingState).pendingPointApprovals?.length, 1);

  const [owner] = await db.select().from(pairingMembers).where(eq(pairingMembers.roomId, room.id));
  const requestId = (scored.state as PairingState).pendingPointApprovals![0].id;
  const approved = await executePairingCommand(owner, {
    id: randomUUID(),
    type: "approvePoints",
    payload: { requestId },
  });
  assert.equal((approved.state as PairingState).groups[0].score, 5);
  assert.equal((approved.state as PairingState).history[0].reason, "Good work");
  assert.equal((approved.state as PairingState).pendingPointApprovals?.[0].status, "approved");

  await assert.rejects(
    executePairingCommand(member, {
      id: randomUUID(),
      type: "clearActivities",
      payload: {},
    }),
    /Owner role required/,
  );
  const [unchanged] = await db.select().from(pairingRooms).where(eq(pairingRooms.id, room.id));
  assert.equal(unchanged.version, 3);
  assert.equal((unchanged.state as PairingState).groups[0].score, 5);
});

test("owners can reject requests and expired requests auto-approve", async () => {
  const [room] = await db.insert(pairingRooms).values({
    code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    state: baseState(),
  }).returning();
  roomIds.push(room.id);
  const [owner] = await db.insert(pairingMembers).values({
    roomId: room.id,
    name: "Manager",
    role: "owner",
    tokenHash: randomUUID(),
  }).returning();
  const [counselor] = await db.insert(pairingMembers).values({
    roomId: room.id,
    name: "Counselor",
    role: "counselor",
    groupId: "ladybugs",
    tokenHash: randomUUID(),
  }).returning();

  const rejectedRequestId = randomUUID();
  await executePairingCommand(counselor, {
    id: rejectedRequestId,
    type: "addPoints",
    payload: { groupId: "ladybugs", amount: 10, reason: "Helpful cleanup" },
  });
  const rejected = await executePairingCommand(owner, {
    id: randomUUID(),
    type: "rejectPoints",
    payload: { requestId: rejectedRequestId },
  });
  assert.equal((rejected.state as PairingState).groups[0].score, 0);
  assert.equal((rejected.state as PairingState).pendingPointApprovals?.find(
    (item) => item.id === rejectedRequestId,
  )?.status, "rejected");

  const expiredRequestId = randomUUID();
  await executePairingCommand(counselor, {
    id: expiredRequestId,
    type: "addPoints",
    payload: { groupId: "ladybugs", amount: 25, reason: "Old but valid" },
  });
  const current = await db.select().from(pairingRooms).where(eq(pairingRooms.id, room.id));
  const staleState = structuredClone(current[0].state as PairingState);
  const request = staleState.pendingPointApprovals!.find((item) => item.id === expiredRequestId)!;
  request.dueAt = new Date(Date.now() - 1_000).toISOString();
  await db.update(pairingRooms).set({ state: staleState }).where(eq(pairingRooms.id, room.id));
  const { resolveDuePointApprovals } = await import("../routes/pairing");
  await resolveDuePointApprovals();
  const [resolved] = await db.select().from(pairingRooms).where(eq(pairingRooms.id, room.id));
  const resolvedState = resolved.state as PairingState;
  assert.equal(resolvedState.groups[0].score, 25);
  assert.equal(resolvedState.history[0].reason, "Old but valid");
  assert.equal(
    resolvedState.pendingPointApprovals?.find((item) => item.id === expiredRequestId)?.status,
    "autoApproved",
  );
});

test("calendar rollover clears only activities and is idempotent in the same month", async () => {
  const state: PairingState = {
    groups: [{ id: "ladybugs", name: "Ladybugs", score: 37 }],
    history: [{
      id: "history-1",
      groupId: "ladybugs",
      groupName: "Ladybugs",
      amount: 37,
      reason: "Preserve me",
      timestamp: "10:00 AM",
    }],
    lapRecords: [{ id: "lap-1", runnerName: "A" }],
    monthlyRecords: [{ id: "month-1", rewardClaimed: true, month: "August" }],
    activities: [{ id: "activity-1", title: "Mission" }],
  };
  const [room] = await db.insert(pairingRooms).values({
    code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    state,
    activitiesMonth: "2025-08",
    projectorMessages: [{
      id: randomUUID(),
      text: "Keep separate",
      senderName: "Owner",
      senderRole: "owner",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 20_000).toISOString(),
    }],
  }).returning();
  roomIds.push(room.id);

  const first = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from pairing_rooms where id = ${room.id} for update`);
    const [locked] = await tx.select().from(pairingRooms).where(eq(pairingRooms.id, room.id));
    return rolloverActivitiesForLockedRoom(tx, locked, "2025-09");
  });
  assert.equal(first.version, 2);
  assert.equal(first.activitiesMonth, "2025-09");
  assert.deepEqual((first.state as PairingState).activities, []);
  assert.deepEqual((first.state as PairingState).groups, state.groups);
  assert.deepEqual((first.state as PairingState).history, state.history);
  assert.deepEqual((first.state as PairingState).lapRecords, state.lapRecords);
  assert.deepEqual((first.state as PairingState).monthlyRecords, state.monthlyRecords);
  assert.equal(first.projectorMessages[0]?.text, "Keep separate");

  const second = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from pairing_rooms where id = ${room.id} for update`);
    const [locked] = await tx.select().from(pairingRooms).where(eq(pairingRooms.id, room.id));
    return rolloverActivitiesForLockedRoom(tx, locked, "2025-09");
  });
  assert.equal(second.version, 2);
});

test("projector messages attribute sender and idempotently increment room version once", async () => {
  const [room] = await db.insert(pairingRooms).values({
    code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    state: baseState(),
  }).returning();
  roomIds.push(room.id);
  const [counselor] = await db.insert(pairingMembers).values({
    roomId: room.id,
    name: "Ms. Edison",
    role: "counselor",
    groupId: "ladybugs",
    assignmentDate: "2025-01-01",
    tokenHash: randomUUID(),
  }).returning();
  const input = { id: randomUUID(), text: "Line up at the blue doors" };

  const first = await sendProjectorMessage(counselor, input);
  const replay = await sendProjectorMessage(counselor, input);
  assert.equal(first.version, 2);
  assert.equal(replay.version, 2);
  assert.equal(replay.projectorMessages.length, 1);
  assert.deepEqual(replay.chatMessages, replay.projectorMessages);
  assert.deepEqual(
    {
      id: replay.projectorMessages[0].id,
      text: replay.projectorMessages[0].text,
      senderId: replay.projectorMessages[0].senderId,
      senderName: replay.projectorMessages[0].senderName,
      senderRole: replay.projectorMessages[0].senderRole,
    },
    {
      ...input,
      senderId: counselor.id,
      senderName: "Ms. Edison",
      senderRole: "counselor",
    },
  );
  assert.equal(
    Date.parse(replay.projectorMessages[0].expiresAt)
      - Date.parse(replay.projectorMessages[0].createdAt),
    8_000,
  );
});

test("chat history retains expired messages in order while projector messages stay transient", async () => {
  const expiredAt = new Date(Date.now() - 60_000);
  const retained = [{
    id: randomUUID(),
    text: "Earlier announcement",
    senderName: "Owner",
    senderRole: "owner" as const,
    createdAt: new Date(expiredAt.getTime() - 8_000).toISOString(),
    expiresAt: expiredAt.toISOString(),
  }];
  const [room] = await db.insert(pairingRooms).values({
    code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    state: baseState(),
    projectorMessages: retained,
  }).returning();
  roomIds.push(room.id);
  const [member] = await db.insert(pairingMembers).values({
    roomId: room.id,
    name: "Current sender",
    role: "counselor",
    tokenHash: randomUUID(),
  }).returning();

  const current = await sendProjectorMessage(member, {
    id: randomUUID(),
    text: "Current announcement",
  });

  assert.deepEqual(current.projectorMessages.map((message) => message.text), [
    "Current announcement",
  ]);
  assert.deepEqual(current.chatMessages.map((message) => message.text), [
    "Earlier announcement",
    "Current announcement",
  ]);
  assert.equal(current.chatMessages[0].senderId, undefined);
  assert.equal(current.chatMessages[1].senderId, member.id);
  assert.ok(Date.parse(current.chatMessages[0].expiresAt) < Date.now());
});

test("chat history is oldest-to-newest and bounded to the latest 100 messages", async () => {
  const baseTime = Date.now() - 200_000;
  const retained = Array.from({ length: 100 }, (_, index) => ({
    id: randomUUID(),
    text: `Message ${index}`,
    senderName: "Owner",
    senderRole: "owner" as const,
    createdAt: new Date(baseTime + index * 1_000).toISOString(),
    expiresAt: new Date(baseTime + index * 1_000 + 8_000).toISOString(),
  })).reverse();
  const [room] = await db.insert(pairingRooms).values({
    code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    state: baseState(),
    projectorMessages: retained,
  }).returning();
  roomIds.push(room.id);
  const [member] = await db.insert(pairingMembers).values({
    roomId: room.id,
    name: "Latest sender",
    role: "owner",
    tokenHash: randomUUID(),
  }).returning();

  const latest = await sendProjectorMessage(member, {
    id: randomUUID(),
    text: "Message 100",
  });

  assert.equal(latest.chatMessages.length, 100);
  assert.equal(latest.chatMessages[0].text, "Message 1");
  assert.equal(latest.chatMessages[99].text, "Message 100");
  assert.equal(latest.chatMessages[99].senderId, member.id);
  assert.deepEqual(
    latest.chatMessages.map((message) => Date.parse(message.createdAt)),
    [...latest.chatMessages]
      .map((message) => Date.parse(message.createdAt))
      .sort((left, right) => left - right),
  );
});

test("revoked member cannot send a projector message", async () => {
  const retained = [{
    id: randomUUID(),
    text: "Already retained",
    senderName: "Owner",
    senderRole: "owner" as const,
    createdAt: new Date(Date.now() - 16_000).toISOString(),
    expiresAt: new Date(Date.now() - 8_000).toISOString(),
  }];
  const [room] = await db.insert(pairingRooms).values({
    code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    state: baseState(),
    projectorMessages: retained,
  }).returning();
  roomIds.push(room.id);
  const [member] = await db.insert(pairingMembers).values({
    roomId: room.id,
    name: "Revoked sender",
    role: "counselor",
    tokenHash: randomUUID(),
    revokedAt: new Date(),
  }).returning();
  await assert.rejects(
    sendProjectorMessage(member, { id: randomUUID(), text: "Should not appear" }),
    /Unauthorized/,
  );
  const [unchanged] = await db.select().from(pairingRooms).where(eq(pairingRooms.id, room.id));
  assert.equal(unchanged.version, 1);
  assert.deepEqual(unchanged.projectorMessages, retained);
});

test("concurrent commands serialize after one monthly activities rollover", async () => {
  const state = baseState();
  state.activities = [{ id: "old-mission", title: "Old mission" }];
  const [room] = await db.insert(pairingRooms).values({
    code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    state,
    activitiesMonth: "2000-01",
  }).returning();
  roomIds.push(room.id);
  const [owner] = await db.insert(pairingMembers).values({
    roomId: room.id,
    name: "Concurrency owner",
    role: "owner",
    tokenHash: randomUUID(),
  }).returning();

  await Promise.all([
    executePairingCommand(owner, {
      id: randomUUID(),
      type: "addPoints",
      payload: { groupId: "ladybugs", amount: 3, reason: "One" },
    }),
    executePairingCommand(owner, {
      id: randomUUID(),
      type: "addPoints",
      payload: { groupId: "ladybugs", amount: 4, reason: "Two" },
    }),
  ]);
  const [latest] = await db.select().from(pairingRooms).where(eq(pairingRooms.id, room.id));
  assert.equal(latest.version, 4);
  assert.equal((latest.state as PairingState).groups[0].score, 7);
  assert.deepEqual((latest.state as PairingState).activities, []);
});

test("member removal enforces owner, room, and owner-member boundaries and revokes access", async () => {
  const [room, otherRoom] = await Promise.all([
    db.insert(pairingRooms).values({
      code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
      state: baseState(),
    }).returning().then(([value]) => value),
    db.insert(pairingRooms).values({
      code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
      state: baseState(),
    }).returning().then(([value]) => value),
  ]);
  roomIds.push(room.id, otherRoom.id);
  const [owner, counselor, secondOwner, otherCounselor] = await Promise.all([
    db.insert(pairingMembers).values({
      roomId: room.id, name: "Owner", role: "owner", tokenHash: randomUUID(),
    }).returning().then(([value]) => value),
    db.insert(pairingMembers).values({
      roomId: room.id, name: "Counselor", role: "counselor", tokenHash: randomUUID(),
    }).returning().then(([value]) => value),
    db.insert(pairingMembers).values({
      roomId: room.id, name: "Second owner", role: "owner", tokenHash: randomUUID(),
    }).returning().then(([value]) => value),
    db.insert(pairingMembers).values({
      roomId: otherRoom.id, name: "Other room", role: "counselor", tokenHash: randomUUID(),
    }).returning().then(([value]) => value),
  ]);

  assert.deepEqual(await removePairingMember(counselor, owner.id), { error: "forbidden" });
  assert.deepEqual(await removePairingMember(owner, owner.id), { error: "self" });
  assert.deepEqual(await removePairingMember(owner, secondOwner.id), { error: "owner" });
  assert.deepEqual(await removePairingMember(owner, otherCounselor.id), { error: "not-found" });

  const removed = await removePairingMember(owner, counselor.id);
  if (!("session" in removed) || !removed.session) {
    assert.fail(`Expected removal session, received ${JSON.stringify(removed)}`);
  }
  assert.equal(removed.session.version, 2);
  assert.equal(removed.session.members.some((member) => member.id === counselor.id), false);
  assert.deepEqual(await removePairingMember(owner, counselor.id), { error: "not-found" });
  await assert.rejects(
    executePairingCommand(counselor, {
      id: randomUUID(),
      type: "addPoints",
      payload: { groupId: "ladybugs", amount: 1, reason: "Revoked" },
    }),
    /Unauthorized/,
  );
});