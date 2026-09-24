import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const PAIRING_DEFAULT_TIME_ZONE = "America/Los_Angeles";

export type ProjectorMessage = {
  id: string;
  text: string;
  senderId?: string;
  senderName: string;
  senderRole: "owner" | "counselor";
  createdAt: string;
  expiresAt: string;
};

export const pairingRooms = pgTable(
  "pairing_rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    passwordHash: text("password_hash"),
    version: integer("version").notNull().default(1),
    state: jsonb("state").notNull(),
    projectorMessages: jsonb("projector_messages")
      .$type<ProjectorMessage[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // Rooms use the Edison school calendar rather than the database/server's
    // deployment timezone. The SQL default also initializes existing rows
    // during schema push without changing their current activities.
    timeZone: text("time_zone").notNull().default(PAIRING_DEFAULT_TIME_ZONE),
    activitiesMonth: text("activities_month")
      .notNull()
      .default(sql`to_char(CURRENT_TIMESTAMP AT TIME ZONE 'America/Los_Angeles', 'YYYY-MM')`),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("pairing_rooms_code_uidx").on(table.code)],
);

export const pairingMembers = pgTable(
  "pairing_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => pairingRooms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role", { enum: ["owner", "counselor"] }).notNull(),
    groupId: text("group_id"),
    assignmentDate: date("assignment_date", { mode: "string" }),
    tokenHash: text("token_hash").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pairing_members_token_hash_uidx").on(table.tokenHash),
    index("pairing_members_room_idx").on(table.roomId),
  ],
);

export const pairingCommands = pgTable(
  "pairing_commands",
  {
    id: uuid("id").notNull(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => pairingRooms.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => pairingMembers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pairing_commands_room_id_uidx").on(table.roomId, table.id),
    index("pairing_commands_created_idx").on(table.createdAt),
  ],
);