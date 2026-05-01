import { promises as fs } from "node:fs";
import path from "node:path";

const STORE_DIR = process.env.SPEEDYTURTLE_STORE_DIR || "/tmp/speedyturtle";
const BILLING_DIR = path.join(STORE_DIR, "billing");
const USERS_FILE = path.join(BILLING_DIR, "users.json");

export type Tier = "free" | "starter" | "pro" | "unlimited";
export type Status = "active" | "inactive";

export type UserBilling = {
  email: string;
  tier: Tier;
  status: Status;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  monthlyScans: Record<string, number>;
  updatedAt: string;
};

type UsersFile = Record<string, UserBilling>;

async function ensureDir() {
  await fs.mkdir(BILLING_DIR, { recursive: true });
}

async function readAll(): Promise<UsersFile> {
  try {
    await ensureDir();
    const raw = await fs.readFile(USERS_FILE, "utf8");
    return JSON.parse(raw) as UsersFile;
  } catch {
    return {};
  }
}

async function writeAll(users: UsersFile): Promise<void> {
  await ensureDir();
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

function currentMonth(): string {
  const d = new Date();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function defaultRecord(email: string): UserBilling {
  return {
    email,
    tier: "free",
    status: "active",
    monthlyScans: {},
    updatedAt: new Date().toISOString(),
  };
}

// Quotas are env-tunable. Set SPEEDYTURTLE_FREE_CAP=0 (or any non-positive
// number) to disable the limit entirely — useful for Show HN traffic spikes
// or self-host setups where the operator wants no per-email gating.
function capForTier(tier: Tier): number | null {
  switch (tier) {
    case "free": {
      const raw = Number(process.env.SPEEDYTURTLE_FREE_CAP);
      if (Number.isFinite(raw) && raw <= 0) return null;
      return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 25;
    }
    case "starter": {
      const raw = Number(process.env.SPEEDYTURTLE_STARTER_CAP);
      return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 100;
    }
    case "pro":
    case "unlimited":
      return null;
  }
}

export async function getEntitlement(
  email: string
): Promise<{ tier: Tier; scansThisMonth: number; scanCap: number | null; status: Status }> {
  const key = normEmail(email);
  const users = await readAll();
  const record = users[key] ?? defaultRecord(key);
  const month = currentMonth();
  const scansThisMonth = record.monthlyScans?.[month] ?? 0;
  const scanCap = capForTier(record.tier);
  return {
    tier: record.tier,
    scansThisMonth,
    scanCap,
    status: record.status,
  };
}

export async function recordScan(email: string): Promise<void> {
  const key = normEmail(email);
  const users = await readAll();
  const record = users[key] ?? defaultRecord(key);
  const month = currentMonth();
  record.monthlyScans = record.monthlyScans ?? {};
  record.monthlyScans[month] = (record.monthlyScans[month] ?? 0) + 1;
  record.updatedAt = new Date().toISOString();
  users[key] = record;
  await writeAll(users);
}

export async function canScan(
  email: string
): Promise<{ ok: boolean; reason?: string; tier: Tier; scansThisMonth: number; scanCap: number | null }> {
  const ent = await getEntitlement(email);

  const effectiveTier: Tier = ent.status === "active" ? ent.tier : "free";
  const cap = capForTier(effectiveTier);

  if (cap === null) {
    return { ok: true, tier: ent.tier, scansThisMonth: ent.scansThisMonth, scanCap: null };
  }

  if (ent.scansThisMonth >= cap) {
    const reason =
      effectiveTier === "free"
        ? `You've used your free scan this month (${ent.scansThisMonth}/${cap}). Upgrade for more.`
        : `You've used all ${cap} Starter scans this month (${ent.scansThisMonth}/${cap}). Upgrade to Pro for unlimited.`;
    return {
      ok: false,
      reason,
      tier: ent.tier,
      scansThisMonth: ent.scansThisMonth,
      scanCap: cap,
    };
  }

  return { ok: true, tier: ent.tier, scansThisMonth: ent.scansThisMonth, scanCap: cap };
}

export async function upsertSubscription(args: {
  email: string;
  tier: Tier;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}): Promise<void> {
  const key = normEmail(args.email);
  const users = await readAll();
  const existing = users[key] ?? defaultRecord(key);
  const updated: UserBilling = {
    ...existing,
    email: key,
    tier: args.tier,
    status: "active",
    stripeCustomerId: args.stripeCustomerId ?? existing.stripeCustomerId,
    stripeSubscriptionId: args.stripeSubscriptionId ?? existing.stripeSubscriptionId,
    updatedAt: new Date().toISOString(),
  };
  users[key] = updated;
  await writeAll(users);
}

export async function markInactive(stripeSubscriptionId: string): Promise<void> {
  const users = await readAll();
  let changed = false;
  for (const key of Object.keys(users)) {
    const record = users[key];
    if (record.stripeSubscriptionId === stripeSubscriptionId) {
      record.status = "inactive";
      record.tier = "free";
      record.updatedAt = new Date().toISOString();
      users[key] = record;
      changed = true;
    }
  }
  if (changed) await writeAll(users);
}
