import { createECDH, createHmac } from "node:crypto";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import webPush from "web-push";
import {
  db,
  pairingMembers,
  pairingNotificationDeliveries,
  pairingNotifications,
  pairingPushSubscriptions,
  pairingRooms,
} from "@workspace/db";

const P256_ORDER = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
const MAX_DELIVERY_ATTEMPTS = 6;
const DELIVERY_BATCH_SIZE = 20;
const DELIVERY_LEASE_MS = 60_000;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "https://edisonras.onrender.com";

type VapidKeys = { publicKey: string; privateKey: string };

function base64Url(value: Buffer): string {
  return value.toString("base64url");
}

export function deriveVapidKeys(secret: string): VapidKeys {
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters to enable browser alerts.");
  }

  // Domain-separate the Web Push key from session signing uses, and derive the
  // same VAPID identity after restarts without storing its private key in the DB.
  const candidate = createHmac("sha256", secret)
    .update("ras-edison-web-push-v1")
    .digest();
  const scalar = (BigInt(`0x${candidate.toString("hex")}`) % (P256_ORDER - 1n)) + 1n;
  const privateBytes = Buffer.from(scalar.toString(16).padStart(64, "0"), "hex");
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(privateBytes);
  return {
    publicKey: base64Url(ecdh.getPublicKey(undefined, "uncompressed")),
    privateKey: base64Url(privateBytes),
  };
}

function currentVapidKeys(): VapidKeys | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return deriveVapidKeys(secret);
}

export function getVapidPublicKey(): string | null {
  return currentVapidKeys()?.publicKey ?? null;
}

type ClaimedDelivery = {
  id: string;
  attempts: number;
  subscriptionId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  notificationId: string;
  kind: "mission_added" | "points_approved";
};

async function claimDeliveries(): Promise<ClaimedDelivery[]> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const ready = or(
      and(
        eq(pairingNotificationDeliveries.status, "pending"),
        lte(pairingNotificationDeliveries.availableAt, now),
      ),
      and(
        eq(pairingNotificationDeliveries.status, "sending"),
        lte(pairingNotificationDeliveries.leaseUntil, now),
      ),
    );
    const candidates = await tx.select({
      id: pairingNotificationDeliveries.id,
      attempts: pairingNotificationDeliveries.attempts,
      subscriptionId: pairingPushSubscriptions.id,
      endpoint: pairingPushSubscriptions.endpoint,
      p256dh: pairingPushSubscriptions.p256dh,
      auth: pairingPushSubscriptions.auth,
      notificationId: pairingNotifications.id,
      kind: pairingNotifications.kind,
    }).from(pairingNotificationDeliveries)
      .innerJoin(
        pairingNotifications,
        eq(pairingNotifications.id, pairingNotificationDeliveries.notificationId),
      )
      .innerJoin(
        pairingPushSubscriptions,
        eq(pairingPushSubscriptions.id, pairingNotificationDeliveries.subscriptionId),
      )
      .innerJoin(pairingMembers, and(
        eq(pairingMembers.id, pairingPushSubscriptions.memberId),
        eq(pairingMembers.roomId, pairingPushSubscriptions.roomId),
      ))
      .innerJoin(pairingRooms, eq(pairingRooms.id, pairingPushSubscriptions.roomId))
      .where(and(
        ready,
        isNull(pairingMembers.revokedAt),
        isNull(pairingRooms.endedAt),
        eq(pairingNotifications.roomId, pairingPushSubscriptions.roomId),
        eq(pairingNotifications.recipientMemberId, pairingPushSubscriptions.memberId),
      ))
      .orderBy(asc(pairingNotificationDeliveries.availableAt))
      .limit(DELIVERY_BATCH_SIZE)
      .for("update", { of: pairingNotificationDeliveries, skipLocked: true });

    if (candidates.length === 0) return [];
    const ids = candidates.map((candidate) => candidate.id);
    await tx.update(pairingNotificationDeliveries).set({
      status: "sending",
      attempts: sql`${pairingNotificationDeliveries.attempts} + 1`,
      leaseUntil: new Date(now.getTime() + DELIVERY_LEASE_MS),
      updatedAt: now,
    }).where(inArray(pairingNotificationDeliveries.id, ids));
    return candidates.map((candidate) => ({ ...candidate, attempts: candidate.attempts + 1 }));
  });
}

async function finishDelivery(
  deliveryId: string,
  status: "delivered" | "failed" | "pending",
  options: { retryAt?: Date } = {},
): Promise<void> {
  await db.update(pairingNotificationDeliveries).set({
    status,
    ...(options.retryAt ? { availableAt: options.retryAt } : {}),
    leaseUntil: null,
    updatedAt: new Date(),
  }).where(eq(pairingNotificationDeliveries.id, deliveryId));
}

export async function dispatchPendingPairingPush(): Promise<void> {
  const keys = currentVapidKeys();
  if (!keys) return;
  const deliveries = await claimDeliveries();
  if (deliveries.length === 0) return;

  webPush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey);
  await Promise.all(deliveries.map(async (delivery) => {
    try {
      // Push payloads intentionally omit names, activity titles, point amounts,
      // and reasons. Full details stay behind authenticated in-app requests.
      await webPush.sendNotification({
        endpoint: delivery.endpoint,
        keys: { p256dh: delivery.p256dh, auth: delivery.auth },
      }, JSON.stringify({ id: delivery.notificationId, kind: delivery.kind }), {
        TTL: 60 * 60,
        urgency: "normal",
        topic: delivery.notificationId.replaceAll("-", "").slice(0, 32),
      });
      await finishDelivery(delivery.id, "delivered");
    } catch (error) {
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(pairingPushSubscriptions)
          .where(eq(pairingPushSubscriptions.id, delivery.subscriptionId));
        return;
      }

      if (delivery.attempts >= MAX_DELIVERY_ATTEMPTS) {
        await finishDelivery(delivery.id, "failed");
        return;
      }
      const backoffMs = Math.min(30_000 * (2 ** (delivery.attempts - 1)), 30 * 60_000);
      await finishDelivery(delivery.id, "pending", {
        retryAt: new Date(Date.now() + backoffMs),
      });
    }
  }));
}