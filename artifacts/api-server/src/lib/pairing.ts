import { randomUUID } from "node:crypto";
import { z } from "zod";

export type PairingState = {
  groups: Array<Record<string, unknown> & { id: string; name: string; score: number }>;
  history: Array<Record<string, unknown> & {
    id: string;
    groupId: string;
    groupName: string;
    amount: number;
    reason: string;
    timestamp: string;
  }>;
  lapRecords: Array<Record<string, unknown> & { id: string }>;
  monthlyRecords: Array<Record<string, unknown> & {
    id: string;
    rewardClaimed: boolean;
  }>;
  activities: Array<Record<string, unknown> & { id: string }>;
};

const shortId = z.string().min(1).max(80);
const lapRecord = z.object({
  id: shortId.optional(),
  runnerName: z.string().trim().min(1).max(100),
  group: z.string().trim().min(1).max(100),
  minutes: z.number().int().min(0).max(999),
  seconds: z.number().int().min(0).max(59),
  ms: z.number().int().min(0).max(99),
  timeFormatted: z.string().min(1).max(30),
  totalSeconds: z.number().finite().min(0).max(100000),
  courseName: z.string().trim().min(1).max(200),
  date: z.string().min(1).max(30),
  monthYear: z.string().min(1).max(100),
}).strict();

const activity = z.object({
  id: shortId.optional(),
  title: z.string().trim().min(1).max(300),
  type: z.string().trim().min(1).max(100),
  points: z.number().finite().min(-1000000).max(1000000),
  location: z.string().trim().min(1).max(100),
  scrambledPhrase: z.string().max(2000).optional(),
  solvedPhrase: z.string().max(2000).optional(),
  hint: z.string().max(2000).optional(),
  lesson: z.string().max(5000).optional(),
  materials: z.string().max(5000).optional(),
  steps: z.string().max(10000).optional(),
  harder: z.string().max(5000).optional(),
  safety: z.string().max(5000).optional(),
}).strict();

export const commandSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string().uuid(),
    type: z.literal("addPoints"),
    payload: z.object({
      groupId: shortId,
      amount: z.number().finite().min(-1000000).max(1000000),
      reason: z.string().trim().min(1).max(500),
    }).strict(),
  }).strict(),
  z.object({ id: z.string().uuid(), type: z.literal("undo"), payload: z.object({ logId: shortId }).strict() }).strict(),
  z.object({ id: z.string().uuid(), type: z.literal("resetMonth"), payload: z.object({ month: z.string().trim().min(1).max(100) }).strict() }).strict(),
  z.object({ id: z.string().uuid(), type: z.literal("saveLap"), payload: z.object({ record: lapRecord }).strict() }).strict(),
  z.object({ id: z.string().uuid(), type: z.literal("deleteLap"), payload: z.object({ id: shortId }).strict() }).strict(),
  z.object({ id: z.string().uuid(), type: z.literal("addActivity"), payload: z.object({ activity }).strict() }).strict(),
  z.object({ id: z.string().uuid(), type: z.literal("deleteActivity"), payload: z.object({ id: shortId }).strict() }).strict(),
  z.object({ id: z.string().uuid(), type: z.literal("clearActivities"), payload: z.object({}).strict() }).strict(),
  z.object({ id: z.string().uuid(), type: z.literal("toggleReward"), payload: z.object({ id: shortId }).strict() }).strict(),
]);

export type PairingCommand = z.infer<typeof commandSchema>;

export function reducePairingState(state: PairingState, command: PairingCommand): PairingState {
  const next = structuredClone(state);
  switch (command.type) {
    case "addPoints": {
      const group = next.groups.find((item) => item.id === command.payload.groupId);
      if (!group) throw new Error("Group not found");
      const oldScore = group.score;
      group.score = Math.max(0, Math.min(1_000_000_000, oldScore + command.payload.amount));
      const actualDelta = group.score - oldScore;
      next.history = [{
        id: randomUUID(),
        groupId: group.id,
        groupName: group.name,
        amount: actualDelta,
        reason: command.payload.reason,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }, ...next.history].slice(0, 36);
      break;
    }
    case "undo": {
      const log = next.history.find((item) => item.id === command.payload.logId);
      if (!log) throw new Error("History entry not found");
      const group = next.groups.find((item) => item.id === log.groupId);
      if (!group) throw new Error("Group not found");
      group.score = Math.max(0, Math.min(1_000_000_000, group.score - log.amount));
      next.history = next.history.filter((item) => item.id !== log.id);
      break;
    }
    case "resetMonth": {
      const maxScore = Math.max(0, ...next.groups.map((group) => group.score));
      const winners = next.groups
        .filter((group) => maxScore > 0 && group.score === maxScore)
        .map((group) => group.name);
      next.monthlyRecords.unshift({
        id: randomUUID(),
        month: command.payload.month,
        winner: winners.length ? winners.join(" & ") : "No winner",
        scores: next.groups.map((group) => `${group.name}: ${group.score} pts`).join(" | "),
        rewardClaimed: false,
      });
      next.groups.forEach((group) => { group.score = 0; });
      next.history = [];
      break;
    }
    case "saveLap":
      next.lapRecords.unshift({ ...command.payload.record, id: randomUUID() });
      break;
    case "deleteLap":
      next.lapRecords = next.lapRecords.filter((item) => item.id !== command.payload.id);
      break;
    case "addActivity":
      next.activities.unshift({ ...command.payload.activity, id: randomUUID() });
      break;
    case "deleteActivity":
      next.activities = next.activities.filter((item) => item.id !== command.payload.id);
      break;
    case "clearActivities":
      next.activities = [];
      break;
    case "toggleReward": {
      const record = next.monthlyRecords.find((item) => item.id === command.payload.id);
      if (!record) throw new Error("Monthly record not found");
      record.rewardClaimed = !record.rewardClaimed;
      break;
    }
  }
  return next;
}