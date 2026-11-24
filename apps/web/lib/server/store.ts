/**
 * LOCAL DEVELOPMENT PERSISTENCE — NOT PRODUCTION STORAGE.
 *
 * A single JSON document on the server's disk (apps/web/.data/sonara-dev.json,
 * git-ignored). It exists so every server-side rule (sessions, entitlements,
 * payments, editorial workflow, audit) can run and be tested end to end before
 * the dedicated Sonara Supabase project is provisioned. The browser never reads
 * this file; all access goes through server code.
 *
 * Guarantees: one writer at a time (in-process mutex), atomic replace on write
 * (write temp file, fsync, rename), and a refusal to start in production unless
 * SONARA_ALLOW_DEV_BACKEND=1 is set explicitly (for local production-build smoke
 * tests only). It does not scale past one process and is not backed up.
 *
 * The production adapter is Supabase Postgres with the schema and RLS in
 * supabase/migrations 0120–0140, which already enforce the same rules.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_GRACE_DAYS } from "@kito/billing";
import type { DataShape, McCategory } from "./types.ts";
import { DEV_PLANS } from "./seed.ts";

const DATA_DIR = process.env.SONARA_DATA_DIR || path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "sonara-dev.json");

export const dataDirectory = (): string => DATA_DIR;

export function assertDevBackendAllowed(): void {
  if (process.env.NODE_ENV === "production" && process.env.SONARA_ALLOW_DEV_BACKEND !== "1") {
    throw new Error(
      "Sonara is running in production with the local development store. Configure the Supabase adapter, or set SONARA_ALLOW_DEV_BACKEND=1 for a local smoke test only.",
    );
  }
}

const CATEGORY_SEED: [string, string, McCategory["kind"]][] = [
  ["anatomy", "Anatomy", "topic"],
  ["physiology", "Physiology", "topic"],
  ["pathology", "Pathology", "topic"],
  ["pharmacology", "Pharmacology", "topic"],
  ["microbiology", "Microbiology", "topic"],
  ["internal-medicine", "Internal Medicine", "specialty"],
  ["surgery", "Surgery", "specialty"],
  ["paediatrics", "Paediatrics", "specialty"],
  ["obstetrics-and-gynaecology", "Obstetrics and Gynaecology", "specialty"],
  ["community-medicine", "Community Medicine", "specialty"],
  ["clinical-skills", "Clinical Skills", "topic"],
  ["emergency-medicine", "Emergency Medicine", "specialty"],
  ["public-health", "Public Health", "topic"],
  ["medical-research", "Medical Research", "topic"],
];

function initialData(): DataShape {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    users: [],
    sessions: [],
    tokens: [],
    mcCategories: CATEGORY_SEED.map(([slug, name, kind], index) => ({
      id: `cat_${slug.replace(/-/g, "_")}`,
      slug,
      name,
      description: "",
      kind,
      sortOrder: (index + 1) * 10,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })),
    mcSeries: [],
    mcEpisodes: [],
    mcVersions: [],
    mcEditorialEvents: [],
    mcCorrections: [],
    media: [],
    plans: DEV_PLANS.map((plan) => ({ ...plan })),
    promos: [],
    subscriptions: [],
    transactions: [],
    webhookEvents: [],
    overrides: [],
    refunds: [],
    listening: [],
    saved: [],
    notifications: [],
    outbox: [],
    audit: [],
    creatorApplications: [],
    settings: {
      defaultFreeEpisodeAllowance: 2,
      freeRequiresAccount: false,
      graceDays: DEFAULT_GRACE_DAYS,
      trialsEnabled: false,
      defaultCurrency: "UGX",
      livePaymentsEnabled: false,
      maintenanceMode: false,
      regions: ["UG"],
      authorisedAudioHosts: [],
      termsVersion: "2026-11-draft",
      privacyVersion: "2026-11-draft",
    },
  };
}

type Cache = { data: DataShape | null; mtimeMs: number; chain: Promise<unknown> };
const globalCache = globalThis as unknown as { __sonaraStore?: Cache };
const cache: Cache = (globalCache.__sonaraStore ??= { data: null, mtimeMs: 0, chain: Promise.resolve() });

async function load(): Promise<DataShape> {
  assertDevBackendAllowed();
  try {
    const stat = await fs.stat(DATA_FILE);
    if (cache.data && stat.mtimeMs === cache.mtimeMs) return cache.data;
    const parsed = JSON.parse(await fs.readFile(DATA_FILE, "utf8")) as DataShape;
    const defaults = initialData();
    // Forward-compatible: collections added after the file was created start empty.
    const merged = { ...defaults, ...parsed, settings: { ...defaults.settings, ...parsed.settings } } as DataShape;
    cache.data = merged;
    cache.mtimeMs = stat.mtimeMs;
    return merged;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const fresh = initialData();
    await persist(fresh);
    return fresh;
  }
}

async function persist(data: DataShape): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  const handle = await fs.open(tmp, "w", 0o600);
  try {
    await handle.writeFile(JSON.stringify(data));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, DATA_FILE);
  const stat = await fs.stat(DATA_FILE);
  cache.data = data;
  cache.mtimeMs = stat.mtimeMs;
}

/** Read-only snapshot. Callers must not mutate it. */
export async function read(): Promise<Readonly<DataShape>> {
  await cache.chain.catch(() => undefined);
  return load();
}

/**
 * Serialised read-modify-write. The mutator works on a deep copy; if it throws,
 * nothing is written. Returns the mutator's result.
 */
export function transact<T>(mutate: (data: DataShape) => T | Promise<T>): Promise<T> {
  const run = cache.chain.catch(() => undefined).then(async () => {
    const current = await load();
    const draft = structuredClone(current) as DataShape;
    const result = await mutate(draft);
    await persist(draft);
    return result;
  });
  cache.chain = run;
  return run;
}

/** Test hook: wipe the store. Refused outside development and tests. */
export async function resetStoreForTests(): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("refused");
  await persist(initialData());
}
