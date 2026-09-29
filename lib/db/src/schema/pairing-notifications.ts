import {
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
import { pairingMembers, pairingRooms } from "./pairing";

export type PairingNotificationKind = "mission_added" | "points_approved";

export const pairingNotifications = pgTable(
  "pairing_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => pairingRooms.id, { onDelete: "cascade" }),
    recipientMemberId: uuid("recipient_member_id")
      .notNull()
      .references(() => pairingMembers.id, { onDelete: "cascade" }),
    actorMemberId: uuid("actor_member_id")
      .references(() => pairingMembers.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["mission_added", "points_approved"] }).notNull(),
    sourceId: text("source_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("pairing_notifications_recipient_event_uidx")
      .on(table.recipientMemberId, table.kind, table.sourceId),
    index("pairing_notifications_recipient_created_idx")
      .on(table.recipientMemberId, table.createdAt),
    index("pairing_notifications_room_created_idx")
      .on(table.roomId, table.createdAt),
  ],
);

export const pairingPushSubscriptions = pgTable(
  "pairing_push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => pairingRooms.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => pairingMembers.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("pairing_push_subscriptions_endpoint_uidx").on(table.endpoint),
    index("pairing_push_subscriptions_member_room_idx").on(table.memberId, table.roomId),
  ],
);

export const pairingNotificationDeliveries = pgTable(
  "pairing_notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => pairingNotifications.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => pairingPushSubscriptions.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "sending", "delivered", "failed"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("pairing_notification_deliveries_event_subscription_uidx")
      .on(table.notificationId, table.subscriptionId),
    index("pairing_notification_deliveries_pending_idx")
      .on(table.status, table.availableAt),
  ],
);