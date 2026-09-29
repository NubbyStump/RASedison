import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  pairingNotificationDeliveries,
  pairingNotifications,
  pairingPushSubscriptions,
} from "@workspace/db";
import type { PairingNotificationKind } from "@workspace/db";

export type PairingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PairingNotificationDraft = {
  roomId: string;
  recipientMemberId: string;
  actorMemberId?: string | null;
  kind: PairingNotificationKind;
  sourceId: string;
  title: string;
  body: string;
  details?: Record<string, unknown>;
};

export async function queuePairingNotifications(
  tx: PairingTransaction,
  drafts: PairingNotificationDraft[],
): Promise<void> {
  if (drafts.length === 0) return;

  const inserted = await tx.insert(pairingNotifications).values(drafts.map((draft) => ({
    roomId: draft.roomId,
    recipientMemberId: draft.recipientMemberId,
    actorMemberId: draft.actorMemberId ?? null,
    kind: draft.kind,
    sourceId: draft.sourceId,
    title: draft.title,
    body: draft.body,
    details: draft.details ?? {},
  }))).onConflictDoNothing().returning({
    id: pairingNotifications.id,
    recipientMemberId: pairingNotifications.recipientMemberId,
    roomId: pairingNotifications.roomId,
  });
  if (inserted.length === 0) return;

  const recipientIds = [...new Set(inserted.map((notification) => notification.recipientMemberId))];
  const subscriptions = await tx.select({
    id: pairingPushSubscriptions.id,
    memberId: pairingPushSubscriptions.memberId,
    roomId: pairingPushSubscriptions.roomId,
  }).from(pairingPushSubscriptions).where(and(
    inArray(pairingPushSubscriptions.memberId, recipientIds),
    eq(pairingPushSubscriptions.roomId, inserted[0].roomId),
  ));
  if (subscriptions.length === 0) return;

  const deliveries = inserted.flatMap((notification) => subscriptions
    .filter((subscription) => (
      subscription.memberId === notification.recipientMemberId
      && subscription.roomId === notification.roomId
    ))
    .map((subscription) => ({
      notificationId: notification.id,
      subscriptionId: subscription.id,
    })));
  if (deliveries.length > 0) {
    await tx.insert(pairingNotificationDeliveries).values(deliveries).onConflictDoNothing();
  }
}

export async function listPairingNotifications(
  executor: PairingTransaction,
  roomId: string,
  recipientMemberId: string,
) {
  return executor.select({
    id: pairingNotifications.id,
    kind: pairingNotifications.kind,
    title: pairingNotifications.title,
    body: pairingNotifications.body,
    details: pairingNotifications.details,
    createdAt: pairingNotifications.createdAt,
    readAt: pairingNotifications.readAt,
  }).from(pairingNotifications).where(and(
    eq(pairingNotifications.roomId, roomId),
    eq(pairingNotifications.recipientMemberId, recipientMemberId),
  )).orderBy(desc(pairingNotifications.createdAt)).limit(30);
}

export async function markPairingNotificationsRead(
  tx: PairingTransaction,
  roomId: string,
  recipientMemberId: string,
): Promise<void> {
  await tx.update(pairingNotifications).set({ readAt: new Date() }).where(and(
    eq(pairingNotifications.roomId, roomId),
    eq(pairingNotifications.recipientMemberId, recipientMemberId),
    isNull(pairingNotifications.readAt),
  ));
}