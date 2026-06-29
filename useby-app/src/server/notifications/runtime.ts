import { loadRuntimeEnv } from "../db/env";
import { publicErrorMessage } from "../db/introspection";
import {
  executeSql,
  sqlParam,
  type QueryRow,
  type SqlValue,
} from "../db/sql";
import type { DemoActorContext } from "../demo/context";
import type { MerchantActorContext } from "../merchant/context";
import {
  checkNotificationTable,
  notificationIdempotencyKey,
  type NotificationCandidate,
  type NotificationDto,
} from "./contracts";
import { emailStatusForCandidate } from "./email";

export type NotificationScope =
  | {
      kind: "household";
      householdId: string;
      userId?: string | null;
      demoScope: string;
    }
  | {
      kind: "merchant";
      merchantId: string;
      demoScope: string;
    };

export type NotificationRuntimeResult<T> = {
  ok: boolean;
  status: "ok" | "unavailable" | "error";
  result: T;
};

export type NotificationListResult = {
  notifications: NotificationDto[];
  unreadCount: number;
  scope: "household" | "merchant";
};

export type NotificationWriteSummary = {
  candidates: number;
  created: number;
  existing: number;
  emailStatusCounts: Record<string, number>;
};

type CandidateRow = QueryRow & {
  recipient_household_id?: string | null;
  merchant_id?: string | null;
  neighbourhood_id?: string | null;
  source_id: string;
  item_title?: string | null;
  pool_title?: string | null;
  drop_title?: string | null;
  counterpart_label?: string | null;
  coarse_pickup_hint?: string | null;
  pickup_window_start?: string | null;
  pickup_window_end?: string | null;
};

function params(values: Record<string, SqlValue>) {
  return Object.entries(values).map(([name, value]) => sqlParam(name, value));
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function countStatus(
  counts: Record<string, number>,
  status: string,
): Record<string, number> {
  return {
    ...counts,
    [status]: (counts[status] ?? 0) + 1,
  };
}

function safeTitle(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function pickupWindowText(row: CandidateRow): string {
  if (!row.pickup_window_start) {
    return "Pickup details are ready in UseBy.";
  }

  const start = new Date(row.pickup_window_start);
  const end = row.pickup_window_end ? new Date(row.pickup_window_end) : null;
  if (Number.isNaN(start.getTime())) {
    return "Pickup details are ready in UseBy.";
  }

  const startText = start.toISOString();
  const endText = end && !Number.isNaN(end.getTime()) ? ` to ${end.toISOString()}` : "";
  return `Pickup window: ${startText}${endText}.`;
}

function bookingCandidate(
  row: CandidateRow,
  role: "requester" | "owner",
): NotificationCandidate {
  const title = safeTitle(row.item_title, "your booking");
  const counterpart = safeTitle(row.counterpart_label, "the other household");
  return {
    audience: "household",
    householdId: row.recipient_household_id,
    merchantId: null,
    neighbourhoodId: row.neighbourhood_id,
    sourceType: "booking",
    sourceId: row.source_id,
    eventType: "booking_pickup_reminder",
    title: role === "requester" ? `Pickup reminder: ${title}` : `Handoff reminder: ${title}`,
    body:
      role === "requester"
        ? `${pickupWindowText(row)} Check UseBy for the coarse pickup hint; direct contact details stay private.`
        : `${counterpart} is due for a pickup. ${pickupWindowText(row)}`,
    actionHref: `/bookings?bookingId=${row.source_id}`,
    reminderAt: row.pickup_window_start ?? null,
    metadata: {
      role,
      coarsePickupHint: row.coarse_pickup_hint ?? null,
      privacy: "no direct contact fields",
    },
  };
}

function lendingCandidate(
  row: CandidateRow,
  role: "borrower" | "owner",
): NotificationCandidate {
  const title = safeTitle(row.item_title, "your lending reservation");
  return {
    audience: "household",
    householdId: row.recipient_household_id,
    merchantId: null,
    neighbourhoodId: row.neighbourhood_id,
    sourceType: "lending_reservation",
    sourceId: row.source_id,
    eventType: "lending_pickup_reminder",
    title: role === "borrower" ? `Borrowing reminder: ${title}` : `Lending reminder: ${title}`,
    body: `${pickupWindowText(row)} Condition evidence and handoff details stay inside UseBy.`,
    actionHref: `/lending?bookingId=${row.source_id}`,
    reminderAt: row.pickup_window_start ?? null,
    metadata: {
      role,
      privacy: "no direct contact fields",
    },
  };
}

function demandPoolCandidate(row: CandidateRow): NotificationCandidate {
  const title = safeTitle(row.pool_title, "DemandPool");
  return {
    audience: "household",
    householdId: row.recipient_household_id,
    merchantId: null,
    neighbourhoodId: row.neighbourhood_id,
    sourceType: "demand_pool",
    sourceId: row.source_id,
    eventType: "demand_pool_awarded",
    title: `${title} was awarded`,
    body: "Your pool has a winning merchant. UseBy will show pickup details when orders are ready.",
    actionHref: `/demand-pools?poolId=${row.source_id}`,
    reminderAt: null,
    metadata: {
      privacy: "no payment state or direct contact fields",
    },
  };
}

function poolOrderCandidate(row: CandidateRow): NotificationCandidate {
  const title = safeTitle(row.pool_title, "DemandPool order");
  return {
    audience: "household",
    householdId: row.recipient_household_id,
    merchantId: null,
    neighbourhoodId: row.neighbourhood_id,
    sourceType: "pool_order",
    sourceId: row.source_id,
    eventType: "pool_order_ready",
    title: `${title} is ready`,
    body: `${pickupWindowText(row)} Payment remains deferred demo intent.`,
    actionHref: `/demand-pools/orders?orderId=${row.source_id}`,
    reminderAt: row.pickup_window_start ?? null,
    metadata: {
      privacy: "no payment state or direct contact fields",
    },
  };
}

function pickupTaskCandidate(
  row: CandidateRow,
  audience: "household" | "merchant",
): NotificationCandidate {
  const title = safeTitle(row.pool_title, "pickup task");
  return {
    audience,
    householdId: audience === "household" ? row.recipient_household_id : null,
    merchantId: audience === "merchant" ? row.merchant_id : null,
    neighbourhoodId: row.neighbourhood_id,
    sourceType: "pickup_task",
    sourceId: row.source_id,
    eventType: "pickup_task_ready",
    title: audience === "household" ? `${title} pickup is ready` : `${title} pickup task is ready`,
    body: `${pickupWindowText(row)} UseBy shows coarse pickup labels only.`,
    actionHref: audience === "household" ? "/demand-pools/orders" : "/merchant/pickups",
    reminderAt: row.pickup_window_start ?? null,
    metadata: {
      coarsePickupHint: row.coarse_pickup_hint ?? null,
      privacy: "no exact household coordinates or contact fields",
    },
  };
}

function storeDropCandidate(
  row: CandidateRow,
  audience: "household" | "merchant",
): NotificationCandidate {
  const title = safeTitle(row.drop_title, "surplus drop");
  return {
    audience,
    householdId: audience === "household" ? row.recipient_household_id : null,
    merchantId: audience === "merchant" ? row.merchant_id : null,
    neighbourhoodId: row.neighbourhood_id,
    sourceType: "store_drop_reservation",
    sourceId: row.source_id,
    eventType: "store_drop_pickup_reminder",
    title:
      audience === "household"
        ? `Pickup reminder: ${title}`
        : `Reservation pickup reminder: ${title}`,
    body: `${pickupWindowText(row)} Reservation remains unpaid demo intent.`,
    actionHref: audience === "household" ? "/store-drops/reservations" : "/merchant/store-drops",
    reminderAt: row.pickup_window_start ?? null,
    metadata: {
      privacy: "no direct contact fields",
      paymentState: "deferred_demo_intent",
    },
  };
}

async function queryBookingCandidates(nowIso: string, horizonIso: string) {
  const result = await executeSql<CandidateRow>({
    sql: `
      select
        b.id::text as source_id,
        b.requester_household_id::text as requester_household_id,
        b.owner_household_id::text as owner_household_id,
        b.neighbourhood_id::text as neighbourhood_id,
        i.title as item_title,
        h.coarse_pickup_hint,
        h.pickup_window_start::text as pickup_window_start,
        h.pickup_window_end::text as pickup_window_end,
        requester.public_label as requester_label,
        owner.public_label as owner_label
      from bookings b
      join item_instances i on i.id = b.item_instance_id
      join handoffs h on h.booking_id = b.id
      join households requester on requester.id = b.requester_household_id
      join households owner on owner.id = b.owner_household_id
      where b.deleted_at is null
        and i.category = 'grocery'
        and b.status in ('reserved', 'pickup_scheduled')
        and h.pickup_window_start is not null
        and h.pickup_window_start >= :now::timestamp with time zone
        and h.pickup_window_start < :horizon::timestamp with time zone
    `,
    parameters: params({ now: nowIso, horizon: horizonIso }),
  });

  return result.rows.flatMap((row) => [
    bookingCandidate(
      {
        ...row,
        recipient_household_id: String(row.requester_household_id),
        counterpart_label: String(row.owner_label ?? ""),
      },
      "requester",
    ),
    bookingCandidate(
      {
        ...row,
        recipient_household_id: String(row.owner_household_id),
        counterpart_label: String(row.requester_label ?? ""),
      },
      "owner",
    ),
  ]);
}

async function queryLendingCandidates(nowIso: string, horizonIso: string) {
  const result = await executeSql<CandidateRow>({
    sql: `
      select
        lr.id::text as source_id,
        lr.requester_household_id::text as requester_household_id,
        lr.owner_household_id::text as owner_household_id,
        b.neighbourhood_id::text as neighbourhood_id,
        i.title as item_title,
        lr.window_start::text as pickup_window_start,
        lr.window_end::text as pickup_window_end
      from lending_reservations lr
      join bookings b on b.id = lr.booking_id
      join item_instances i on i.id = lr.item_instance_id
      where i.category in ('fashion', 'household')
        and lr.status in ('requested', 'active')
        and lr.window_start >= :now::timestamp with time zone
        and lr.window_start < :horizon::timestamp with time zone
    `,
    parameters: params({ now: nowIso, horizon: horizonIso }),
  });

  return result.rows.flatMap((row) => [
    lendingCandidate(
      {
        ...row,
        recipient_household_id: String(row.requester_household_id),
      },
      "borrower",
    ),
    lendingCandidate(
      {
        ...row,
        recipient_household_id: String(row.owner_household_id),
      },
      "owner",
    ),
  ]);
}

async function queryDemandPoolCandidates() {
  const result = await executeSql<CandidateRow>({
    sql: `
      select
        dp.id::text as source_id,
        c.household_id::text as recipient_household_id,
        dp.neighbourhood_id::text as neighbourhood_id,
        dp.title as pool_title
      from demand_pools dp
      join demand_pool_commitments c
        on c.demand_pool_id = dp.id
        and c.status in ('active', 'fulfilled')
      where dp.status in ('awarded', 'ready_for_pickup')
    `,
  });

  return result.rows.map(demandPoolCandidate);
}

async function queryPoolOrderCandidates(nowIso: string, horizonIso: string) {
  const result = await executeSql<CandidateRow>({
    sql: `
      select
        po.id::text as source_id,
        po.household_id::text as recipient_household_id,
        dp.neighbourhood_id::text as neighbourhood_id,
        dp.title as pool_title,
        po.pickup_window_start::text as pickup_window_start,
        po.pickup_window_end::text as pickup_window_end
      from pool_orders po
      join demand_pools dp on dp.id = po.demand_pool_id
      where po.deleted_at is null
        and po.status = 'ready'
        and (
          po.pickup_window_start is null
          or (
            po.pickup_window_start >= :now::timestamp with time zone
            and po.pickup_window_start < :horizon::timestamp with time zone
          )
        )
    `,
    parameters: params({ now: nowIso, horizon: horizonIso }),
  });

  return result.rows.map(poolOrderCandidate);
}

async function queryPickupTaskCandidates(nowIso: string, horizonIso: string) {
  const result = await executeSql<CandidateRow>({
    sql: `
      select
        pt.id::text as source_id,
        pt.household_id::text as recipient_household_id,
        pt.merchant_id::text as merchant_id,
        dp.neighbourhood_id::text as neighbourhood_id,
        dp.title as pool_title,
        pt.coarse_pickup_label as coarse_pickup_hint,
        pt.pickup_window_start::text as pickup_window_start,
        pt.pickup_window_end::text as pickup_window_end
      from pickup_tasks pt
      join demand_pools dp on dp.id = pt.demand_pool_id
      where pt.status = 'ready'
        and (
          pt.pickup_window_start is null
          or (
            pt.pickup_window_start >= :now::timestamp with time zone
            and pt.pickup_window_start < :horizon::timestamp with time zone
          )
        )
    `,
    parameters: params({ now: nowIso, horizon: horizonIso }),
  });

  return result.rows.flatMap((row) => [
    pickupTaskCandidate(row, "household"),
    ...(row.merchant_id ? [pickupTaskCandidate(row, "merchant")] : []),
  ]);
}

async function queryStoreDropCandidates(nowIso: string, horizonIso: string) {
  const result = await executeSql<CandidateRow>({
    sql: `
      select
        r.id::text as source_id,
        r.household_id::text as recipient_household_id,
        d.merchant_id::text as merchant_id,
        d.neighbourhood_id::text as neighbourhood_id,
        d.title as drop_title,
        d.pickup_window_start::text as pickup_window_start,
        d.pickup_window_end::text as pickup_window_end
      from store_drop_reservations r
      join store_drops d on d.id = r.store_drop_id
      where r.status = 'active'
        and d.status = 'published'
        and d.pickup_window_start >= :now::timestamp with time zone
        and d.pickup_window_start < :horizon::timestamp with time zone
    `,
    parameters: params({ now: nowIso, horizon: horizonIso }),
  });

  return result.rows.flatMap((row) => [
    storeDropCandidate(row, "household"),
    ...(row.merchant_id ? [storeDropCandidate(row, "merchant")] : []),
  ]);
}

export async function buildNotificationCandidates(now = new Date()) {
  const nowIso = now.toISOString();
  const pickupHorizon = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const lendingHorizon = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

  const groups = await Promise.all([
    queryBookingCandidates(nowIso, pickupHorizon),
    queryLendingCandidates(nowIso, lendingHorizon),
    queryDemandPoolCandidates(),
    queryPoolOrderCandidates(nowIso, pickupHorizon),
    queryPickupTaskCandidates(nowIso, pickupHorizon),
    queryStoreDropCandidates(nowIso, pickupHorizon),
  ]);

  return groups.flat().filter((candidate) => {
    if (candidate.audience === "household") {
      return Boolean(candidate.householdId);
    }
    return Boolean(candidate.merchantId);
  });
}

export async function writeNotificationCandidate(candidate: NotificationCandidate) {
  const emailStatus = emailStatusForCandidate(candidate);
  const idempotencyKey = notificationIdempotencyKey(candidate);
  const result = await executeSql<{ id: string }>({
    sql: `
      insert into notifications (
        audience,
        household_id,
        merchant_id,
        neighbourhood_id,
        source_type,
        source_id,
        event_type,
        title,
        body,
        action_href,
        status,
        channel_status,
        reminder_at,
        metadata,
        idempotency_key,
        demo_scope_id,
        is_demo,
        created_at
      )
      select
        :audience,
        nullif(:householdId, '')::uuid,
        nullif(:merchantId, '')::uuid,
        nullif(:neighbourhoodId, '')::uuid,
        :sourceType,
        :sourceId::uuid,
        :eventType,
        :title,
        :body,
        :actionHref,
        'unread',
        :channelStatus,
        nullif(:reminderAt, '')::timestamp with time zone,
        :metadata::jsonb,
        :idempotencyKey,
        'riverside-quarter',
        true,
        now()
      where not exists (
        select 1 from notifications where idempotency_key = :idempotencyKey
      )
      returning id::text as id
    `,
    parameters: params({
      audience: candidate.audience,
      householdId: candidate.householdId ?? "",
      merchantId: candidate.merchantId ?? "",
      neighbourhoodId: candidate.neighbourhoodId ?? "",
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      eventType: candidate.eventType,
      title: candidate.title,
      body: candidate.body,
      actionHref: candidate.actionHref,
      channelStatus: emailStatus.status,
      reminderAt: candidate.reminderAt ?? "",
      metadata: {
        ...candidate.metadata,
        email: {
          provider: emailStatus.provider,
          status: emailStatus.status,
          reason: emailStatus.reason,
        },
      },
      idempotencyKey,
    }),
  });

  return {
    created: result.rows.length > 0,
    id: result.rows[0]?.id ?? null,
    channelStatus: emailStatus.status,
  };
}

export async function generateNotificationsFromLiveRows(now = new Date()) {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      status: "unavailable" as const,
      summary: {
        candidates: 0,
        created: 0,
        existing: 0,
        emailStatusCounts: {},
      },
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  const contract = await checkNotificationTable();
  if (!contract.available) {
    return {
      status: "unavailable" as const,
      summary: {
        candidates: 0,
        created: 0,
        existing: 0,
        emailStatusCounts: {},
      },
      reason: contract.reason,
      missingColumns: contract.missingColumns,
    };
  }

  const candidates = await buildNotificationCandidates(now);
  let created = 0;
  let existing = 0;
  let emailStatusCounts: Record<string, number> = {};

  for (const candidate of candidates) {
    const result = await writeNotificationCandidate(candidate);
    if (result.created) {
      created += 1;
    } else {
      existing += 1;
    }
    emailStatusCounts = countStatus(emailStatusCounts, result.channelStatus);
  }

  return {
    status: "ok" as const,
    summary: {
      candidates: candidates.length,
      created,
      existing,
      emailStatusCounts,
    },
  };
}

function dtoFromRow(row: QueryRow): NotificationDto {
  return {
    id: String(row.id),
    audience: String(row.audience) as NotificationDto["audience"],
    householdId: row.household_id ? String(row.household_id) : null,
    merchantId: row.merchant_id ? String(row.merchant_id) : null,
    sourceType: String(row.source_type) as NotificationDto["sourceType"],
    sourceId: String(row.source_id),
    eventType: String(row.event_type),
    title: String(row.title),
    body: String(row.body),
    actionHref: row.action_href ? String(row.action_href) : null,
    status: String(row.status),
    channelStatus: row.channel_status ? String(row.channel_status) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
    readAt: row.read_at ? String(row.read_at) : null,
    metadata: metadataObject(row.metadata),
  };
}

export function householdScopeFromContext(context: DemoActorContext): NotificationScope {
  return {
    kind: "household",
    householdId: context.household.id,
    userId: context.user.id,
    demoScope: context.demoScope,
  };
}

export function merchantScopeFromContext(context: MerchantActorContext): NotificationScope {
  return {
    kind: "merchant",
    merchantId: context.merchant.id,
    demoScope: context.demoScope,
  };
}

function scopeWhere(scope: NotificationScope) {
  if (scope.kind === "household") {
    return {
      sql: "audience = 'household' and household_id = :scopeId::uuid",
      scopeId: scope.householdId,
    };
  }

  return {
    sql: "audience = 'merchant' and merchant_id = :scopeId::uuid",
    scopeId: scope.merchantId,
  };
}

export async function listNotifications(scope: NotificationScope) {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      ok: false,
      status: "unavailable",
      result: {
        notifications: [],
        unreadCount: 0,
        scope: scope.kind,
      },
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  const contract = await checkNotificationTable();
  if (!contract.available) {
    return {
      ok: false,
      status: "unavailable",
      result: {
        notifications: [],
        unreadCount: 0,
        scope: scope.kind,
      },
      reason: contract.reason,
      missingColumns: contract.missingColumns,
    };
  }

  const where = scopeWhere(scope);
  const result = await executeSql<QueryRow>({
    sql: `
      select
        id::text as id,
        audience,
        household_id::text as household_id,
        merchant_id::text as merchant_id,
        source_type,
        source_id::text as source_id,
        event_type,
        title,
        body,
        action_href,
        status,
        channel_status,
        created_at::text as created_at,
        read_at::text as read_at,
        metadata
      from notifications
      where ${where.sql}
        and coalesce(demo_scope_id, :demoScope) = :demoScope
        and status <> 'archived'
      order by created_at desc
      limit 50
    `,
    parameters: params({
      scopeId: where.scopeId,
      demoScope: scope.demoScope,
    }),
  });

  const notifications = result.rows.map(dtoFromRow);
  return {
    ok: true,
    status: "ok",
    result: {
      notifications,
      unreadCount: notifications.filter((notification) => notification.status === "unread").length,
      scope: scope.kind,
    },
  };
}

export async function markNotificationRead(
  scope: NotificationScope,
  notificationId: string,
) {
  const env = loadRuntimeEnv();
  if (!env.databaseConfigured) {
    return {
      ok: false,
      status: "unavailable",
      result: null,
      reason: `Aurora env missing: ${env.missing.join(", ")}`,
    };
  }

  const contract = await checkNotificationTable();
  if (!contract.available) {
    return {
      ok: false,
      status: "unavailable",
      result: null,
      reason: contract.reason,
      missingColumns: contract.missingColumns,
    };
  }

  const where = scopeWhere(scope);
  const result = await executeSql<QueryRow>({
    sql: `
      update notifications
      set
        status = 'read',
        read_at = coalesce(read_at, now()),
        metadata = coalesce(metadata, '{}'::jsonb) || :metadata::jsonb
      where id = :notificationId::uuid
        and ${where.sql}
        and coalesce(demo_scope_id, :demoScope) = :demoScope
      returning
        id::text as id,
        audience,
        household_id::text as household_id,
        merchant_id::text as merchant_id,
        source_type,
        source_id::text as source_id,
        event_type,
        title,
        body,
        action_href,
        status,
        channel_status,
        created_at::text as created_at,
        read_at::text as read_at,
        metadata
    `,
    parameters: params({
      notificationId,
      scopeId: where.scopeId,
      demoScope: scope.demoScope,
      metadata: {
        readBy: scope.kind,
        readAtSource: "api",
      },
    }),
  });

  const row = result.rows[0];
  if (!row) {
    return {
      ok: false,
      status: "error",
      result: null,
      reason: "Notification was not found for this actor scope.",
    };
  }

  return {
    ok: true,
    status: "ok",
    result: dtoFromRow(row),
  };
}

export function notificationRuntimeError(error: unknown) {
  return publicErrorMessage(error);
}
