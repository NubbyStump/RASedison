import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import app from "../app";
import type { Session } from "@workspace/api-zod";
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
  clearProjectorMessage,
  executePairingCommand,
  hashPassword,
  passwordMatches,
  removePairingMember,
  resolveDuePointApprovals,
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

test("owner dismissal reaches every polling session, preserves data, and enforces permissions", async () => {
  const state = baseState();
  state.groups[0].score = 42;
  const [room] = await db.insert(pairingRooms).values({
    code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    state,
    activitiesMonth: calendarMonth(),
  }).returning();
  roomIds.push(room.id);
  const tokens = [randomUUID(), randomUUID(), randomUUID()];
  const members = await db.insert(pairingMembers).values(tokens.map((token, index) => ({
    roomId: room.id,
    name: `Dismissal test ${index}`,
    role: index === 0 ? "owner" as const : "counselor" as const,
    tokenHash: createHash("sha256").update(token).digest("hex"),
  }))).returning();
  await sendProjectorMessage(members[1], { id: randomUUID(), text: "Older announcement" });
  await sendProjectorMessage(members[0], { id: randomUUID(), text: "Latest announcement" });
  const [before] = await db.select().from(pairingRooms).where(eq(pairingRooms.id, room.id));
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/pairing`;
  const request = (path: string, method: string, token?: string) => fetch(url + path, {
    method, headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  try {
    assert.equal((await request("/message", "DELETE")).status, 401);
    assert.equal((await request("/message", "DELETE", tokens[1])).status, 403);
    const [unchanged] = await db.select().from(pairingRooms).where(eq(pairingRooms.id, room.id));
    assert.deepEqual(unchanged, before);
    const cleared = await request("/message", "DELETE", tokens[0]);
    assert.equal(cleared.status, 200);
    assert.deepEqual(((await cleared.json()) as Session).projectorMessages, []);
    for (const token of tokens) {
      const response = await request("/session", "GET", token);
      assert.equal(response.status, 200);
      const session = await response.json() as Session;
      assert.equal(session.roomId, room.id);
      assert.deepEqual(session.projectorMessages, []);
      assert.deepEqual(session.state, before.state);
      assert.equal(session.version, before.version + 1);
    }
    const replay = await clearProjectorMessage(members[0]);
    assert.equal(replay.version, before.version + 1);
    await sendProjectorMessage(members[1], { id: randomUUID(), text: "New after clear" });
    await db.update(pairingMembers).set({ revokedAt: new Date() }).where(eq(pairingMembers.id, members[0].id));
    await assert.rejects(clearProjectorMessage(members[0]), /Unauthorized/);
    assert.equal((await request("/message", "DELETE", tokens[0])).status, 401);
    await db.update(pairingRooms).set({ endedAt: new Date() }).where(eq(pairingRooms.id, room.id));
    await assert.rejects(clearProjectorMessage(members[1]), /Unauthorized/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

after(async () => {
  for (const id of roomIds) {
    await db.delete(pairingRooms).where(eq(pairingRooms.id, id));
  }
});

test("pairing HTTP lifecycle remains functional alongside message dismissal", async () => {
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/pairing`;
  const request = async (path: string, body?: unknown, token?: string, method = "POST") => {
    const response = await fetch(url + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal(response.status, 200, `${method} ${path}: ${response.status}`);
    return await response.json() as Session;
  };
  try {
    const password = "test-room-password";
    const assignmentDate = "2026-09-24";
    const owner = await request("/create", {
      name: "Manager", password, assignmentDate, groupId: null, state: baseState(),
    });
    roomIds.push(owner.roomId);
    assert.ok(owner.token);
    const counselor = await request("/join", {
      name: "Counselor", password, code: owner.code, assignmentDate, groupId: "ladybugs",
    });
    assert.ok(counselor.token);
    await request("/assignment", { groupId: "ladybugs", assignmentDate }, counselor.token, "PATCH");
    const scored = await request("/command", {
      id: randomUUID(),
      type: "addPoints",
      payload: {
        groupId: "ladybugs",
        amount: 5,
        reason: "Teamwork",
        specialMentions: "Jordan helped their teammates",
      },
    }, counselor.token);
    assert.equal(scored.state.groups[0].score, 0);
    const pendingRequestId = scored.state.pendingPointApprovals?.[0]?.id;
    assert.ok(pendingRequestId);
    assert.equal(scored.state.pendingPointApprovals?.[0]?.submittedByName, "Counselor");
    assert.equal(scored.state.pendingPointApprovals?.[0]?.specialMentions, "Jordan helped their teammates");
    await request("/command", {
      id: randomUUID(), type: "approvePoints", payload: { requestId: pendingRequestId },
    }, owner.token);
    await request("/command", {
      id: randomUUID(),
      type: "addPoints",
      payload: {
        groupId: "ladybugs",
        amount: 2,
        reason: "Manager recognition",
        specialMentions: "Excellent teamwork",
      },
    }, owner.token);
    await request("/message", { id: randomUUID(), text: "Ready to go" }, counselor.token);
    const visible = await request("/session", undefined, owner.token, "GET");
    assert.equal(visible.projectorMessages.length, 1);
    assert.equal(visible.state.groups[0].score, 7);
    assert.equal(visible.state.history[0].submittedByName, "Manager");
    assert.equal(visible.state.history[0].specialMentions, "Excellent teamwork");
    assert.equal(visible.state.history[1].submittedByName, "Counselor");
    assert.equal(visible.state.history[1].specialMentions, "Jordan helped their teammates");
    await request("/message", undefined, owner.token, "DELETE");
    const polled = await request("/session", undefined, counselor.token, "GET");
    assert.deepEqual(polled.projectorMessages, []);
    assert.equal(polled.state.groups[0].score, 7);
    const rotated = await request("/rotate-code", undefined, owner.token);
    assert.notEqual(rotated.code, owner.code);
    const removable = await request("/join", {
      name: "Other counselor", password, code: rotated.code, assignmentDate, groupId: "ladybugs",
    });
    await request("/remove-member", { memberId: removable.memberId }, owner.token);
    await request("/session", undefined, counselor.token, "GET");
    await request("/leave", undefined, counselor.token);
    await request("/session", undefined, owner.token, "GET");
    await request("/end", undefined, owner.token);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
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

  await assert.rejects(
    executePairingCommand(member, {
      id: randomUUID(),
      type: "addPoints",
      payload: { groupId: "tigers", amount: -10, reason: "Cannot deduct from another group" },
    }),
    /assigned group/,
  );

  const scored = await executePairingCommand(member, {
    id: randomUUID(),
    type: "addPoints",
    payload: {
      groupId: "ladybugs",
      amount: 5,
      reason: "Good work",
      specialMentions: "Avery encouraged the group",
    },
  });
  assert.equal((scored.state as PairingState).groups[0].score, 0);
  assert.equal((scored.state as PairingState).pendingPointApprovals?.length, 1);
  assert.equal((scored.state as PairingState).pendingPointApprovals?.[0]?.specialMentions, "Avery encouraged the group");

  const [owner] = await db.select().from(pairingMembers).where(eq(pairingMembers.roomId, room.id));
  const requestId = (scored.state as PairingState).pendingPointApprovals![0].id;
  const approved = await executePairingCommand(owner, {
    id: randomUUID(),
    type: "approvePoints",
    payload: { requestId },
  });
  assert.equal((approved.state as PairingState).groups[0].score, 5);
  assert.equal((approved.state as PairingState).history[0].reason, "Good work");
  assert.equal((approved.state as PairingState).history[0].specialMentions, "Avery encouraged the group");
  assert.equal((approved.state as PairingState).history[0].submittedByName, "Counselor");
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

test("counselors can request half or all of their assigned group's points removed", async () => {
  const state = baseState();
  state.groups[0].score = 20;
  const [room] = await db.insert(pairingRooms).values({
    code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    state,
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
    assignmentDate: "2025-01-01",
    tokenHash: randomUUID(),
  }).returning();

  await assert.rejects(
    executePairingCommand(counselor, {
      id: randomUUID(),
      type: "reduceGroupPoints",
      payload: { groupId: "tigers", mode: "all", reason: "Wrong group" },
    }),
    /assigned group/,
  );

  const halfRequest = await executePairingCommand(counselor, {
    id: randomUUID(),
    type: "reduceGroupPoints",
    payload: {
      groupId: "ladybugs",
      mode: "half",
      reason: "Reset after rough play",
      specialMentions: "The team can earn these back",
    },
  });
  const halfPending = (halfRequest.state as PairingState).pendingPointApprovals?.at(-1);
  assert.equal(halfPending?.amount, -10);
  assert.equal((halfRequest.state as PairingState).groups[0].score, 20);

  const halfApproved = await executePairingCommand(owner, {
    id: randomUUID(),
    type: "approvePoints",
    payload: { requestId: halfPending!.id },
  });
  assert.equal((halfApproved.state as PairingState).groups[0].score, 10);
  assert.equal((halfApproved.state as PairingState).history[0].amount, -10);
  assert.equal((halfApproved.state as PairingState).history[0].submittedByName, "Counselor");
  assert.equal((halfApproved.state as PairingState).history[0].specialMentions, "The team can earn these back");

  const allRequest = await executePairingCommand(counselor, {
    id: randomUUID(),
    type: "reduceGroupPoints",
    payload: { groupId: "ladybugs", mode: "all", reason: "Full reset" },
  });
  const allPending = (allRequest.state as PairingState).pendingPointApprovals?.at(-1);
  assert.equal(allPending?.amount, -10);
  const allApproved = await executePairingCommand(owner, {
    id: randomUUID(),
    type: "approvePoints",
    payload: { requestId: allPending!.id },
  });
  assert.equal((allApproved.state as PairingState).groups[0].score, 0);
  assert.equal((allApproved.state as PairingState).history[0].amount, -10);
});

test("counselors can request an exact assigned-group score for owner approval", async () => {
  const state = baseState();
  state.groups[0].score = 20;
  const [room] = await db.insert(pairingRooms).values({
    code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    state,
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
    assignmentDate: "2025-01-01",
    tokenHash: randomUUID(),
  }).returning();

  const invalidScore = commandSchema.safeParse({
    id: randomUUID(),
    type: "setGroupPoints",
    payload: { groupId: "ladybugs", score: 2.5, reason: "Fractional score" },
  });
  assert.equal(invalidScore.success, false);

  await assert.rejects(
    executePairingCommand(counselor, {
      id: randomUUID(),
      type: "setGroupPoints",
      payload: { groupId: "tigers", score: 50, reason: "Wrong group" },
    }),
    /assigned group/,
  );

  const submitted = await executePairingCommand(counselor, {
    id: randomUUID(),
    type: "setGroupPoints",
    payload: {
      groupId: "ladybugs",
      score: 45,
      reason: "Correct the score tally",
      specialMentions: "Updated after checking the board",
    },
  });
  const request = (submitted.state as PairingState).pendingPointApprovals?.at(-1);
  assert.equal(request?.setScore, 45);
  assert.equal(request?.amount, 25);
  assert.equal((submitted.state as PairingState).groups[0].score, 20);

  await executePairingCommand(owner, {
    id: randomUUID(),
    type: "addPoints",
    payload: { groupId: "ladybugs", amount: 5, reason: "Manager update before approval" },
  });
  const approved = await executePairingCommand(owner, {
    id: randomUUID(),
    type: "approvePoints",
    payload: { requestId: request!.id },
  });
  assert.equal((approved.state as PairingState).groups[0].score, 45);
  assert.equal((approved.state as PairingState).history[0].amount, 20);
  assert.equal((approved.state as PairingState).history[0].reason, "Correct the score tally");
  assert.equal((approved.state as PairingState).history[0].specialMentions, "Updated after checking the board");
  assert.equal((approved.state as PairingState).pendingPointApprovals?.at(-1)?.status, "approved");

  const autoSubmitted = await executePairingCommand(counselor, {
    id: randomUUID(),
    type: "setGroupPoints",
    payload: { groupId: "ladybugs", score: 9, reason: "Correct another tally" },
  });
  const autoRequest = (autoSubmitted.state as PairingState).pendingPointApprovals?.at(-1);
  const [currentRoom] = await db.select().from(pairingRooms).where(eq(pairingRooms.id, room.id));
  const overdueState = structuredClone(currentRoom.state as PairingState);
  const storedAutoRequest = overdueState.pendingPointApprovals?.find((item) => item.id === autoRequest?.id);
  storedAutoRequest!.dueAt = new Date(Date.now() - 1_000).toISOString();
  await db.update(pairingRooms).set({ state: overdueState }).where(eq(pairingRooms.id, room.id));
  await resolveDuePointApprovals();

  const [resolvedRoom] = await db.select().from(pairingRooms).where(eq(pairingRooms.id, room.id));
  const resolvedState = resolvedRoom.state as PairingState;
  assert.equal(resolvedState.groups[0].score, 9);
  assert.equal(resolvedState.history[0].amount, -36);
  assert.equal(
    resolvedState.pendingPointApprovals?.find((item) => item.id === autoRequest?.id)?.status,
    "autoApproved",
  );
});

test("Program Managers can set any group's total immediately and record the actual score delta", async () => {
  const state = baseState();
  state.groups[0].score = 20;
  state.groups.push({ id: "tigers", name: "Tigers", score: 12 });
  const [room] = await db.insert(pairingRooms).values({
    code: randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase(),
    state,
  }).returning();
  roomIds.push(room.id);
  const [owner] = await db.insert(pairingMembers).values({
    roomId: room.id,
    name: "Manager",
    role: "owner",
    tokenHash: randomUUID(),
  }).returning();

  const updated = await executePairingCommand(owner, {
    id: randomUUID(),
    type: "setGroupPoints",
    payload: {
      groupId: "tigers",
      score: 37,
      reason: "Correct the group tally",
      specialMentions: "Verified with the scoreboard",
    },
  });
  const updatedState = updated.state as PairingState;
  assert.equal(updatedState.groups.find((group) => group.id === "ladybugs")?.score, 20);
  assert.equal(updatedState.groups.find((group) => group.id === "tigers")?.score, 37);
  assert.equal(updatedState.history[0].amount, 25);
  assert.equal(updatedState.history[0].reason, "Correct the group tally");
  assert.equal(updatedState.history[0].specialMentions, "Verified with the scoreboard");
  assert.equal(updatedState.history[0].submittedByName, "Manager");
  assert.equal(updatedState.pendingPointApprovals?.length ?? 0, 0);
});

test("counselors can save regular missions but cannot set Super Scrambles or delete activities", async () => {
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

  const scramble = {
    title: "My Own Word Puzzle",
    type: "Super Scramble",
    points: 275,
    location: "Classroom",
    scrambledPhrase: "WOTKREMA",
    solvedPhrase: "TEAMWORK",
    hint: "A value we practice together",
    steps: "Write the prompt on the board.",
  };
  await assert.rejects(
    executePairingCommand(counselor, {
      id: randomUUID(),
      type: "addActivity",
      payload: { activity: scramble },
    }),
    /Only the Program Manager can set a Super Scramble/,
  );
  assert.equal((await db.select().from(pairingRooms).where(eq(pairingRooms.id, room.id)))[0].state.activities.length, 0);

  const withScramble = await executePairingCommand(owner, {
    id: randomUUID(),
    type: "addActivity",
    payload: { activity: scramble },
  });
  const scrambleState = withScramble.state as PairingState;
  assert.deepEqual(scrambleState.activities[0], {
    ...scramble,
    id: scrambleState.activities[0].id,
  });

  const mission = {
    title: "Counselor-Created Relay",
    type: "Mission",
    points: 425,
    location: "Playground",
    steps: "Create a relay using these exact instructions.",
    materials: "Three cones",
    safety: "Walk between stations.",
  };
  const withMission = await executePairingCommand(counselor, {
    id: randomUUID(),
    type: "addActivity",
    payload: { activity: mission },
  });
  const missionState = withMission.state as PairingState;
  assert.deepEqual(missionState.activities[0], {
    ...mission,
    id: missionState.activities[0].id,
  });
  assert.equal(missionState.activities[1].scrambledPhrase, "WOTKREMA");

  await assert.rejects(
    executePairingCommand(counselor, {
      id: randomUUID(),
      type: "deleteActivity",
      payload: { id: missionState.activities[0].id },
    }),
    /Owner role required/,
  );
  assert.equal(owner.role, "owner");
  assert.equal(commandSchema.safeParse({
    id: randomUUID(),
    type: "addActivity",
    payload: {
      activity: {
        title: "Missing scramble content",
        type: "Super Scramble",
        points: 100,
        location: "Classroom",
      },
    },
  }).success, false);
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
    payload: {
      groupId: "ladybugs",
      amount: 10,
      reason: "Helpful cleanup",
      specialMentions: "The group tidied together",
    },
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
    payload: {
      groupId: "ladybugs",
      amount: 25,
      reason: "Old but valid",
      specialMentions: "A counselor-led demo",
    },
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
  assert.equal(resolvedState.history[0].specialMentions, "A counselor-led demo");
  assert.equal(resolvedState.history[0].submittedByName, "Counselor");
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