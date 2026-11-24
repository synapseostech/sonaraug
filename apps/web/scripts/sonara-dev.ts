/**
 * Local development helper for the Sonara dev store. NOT for production.
 *
 *   pnpm --filter @kito/web sonara:dev grant <email> <role>   Bootstrap staff roles (e.g. the first super_admin)
 *   pnpm --filter @kito/web sonara:dev verify <email>         Mark an email verified (when the outbox is inconvenient)
 *   pnpm --filter @kito/web sonara:dev seed-sample            Add a clearly labelled SAMPLE series with generated test tones
 *   pnpm --filter @kito/web sonara:dev audit-verify           Check the audit log hash chain
 *
 * Role grants from this script are audited with actor "local-cli".
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { ALL_PLATFORM_ROLES } from "@kito/auth";
import type { PlatformRole } from "@kito/types";
import { appendAudit, verifyAuditChain } from "../lib/server/audit.ts";
import { randomId, sha256 } from "../lib/server/crypto.ts";
import { dataDirectory, read, transact } from "../lib/server/store.ts";
import type { McEpisode } from "../lib/server/types.ts";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run against production.");
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);

/** A short 16-bit mono WAV sine tone: honest sample audio, obviously not a programme. */
function toneWav(seconds: number, frequency: number): Buffer {
  const rate = 8000;
  const samples = rate * seconds;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1) {
    const envelope = Math.min(1, i / 400, (samples - i) / 400);
    buffer.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequency * i) / rate) * 6000 * envelope), 44 + i * 2);
  }
  return buffer;
}

async function main() {
  switch (command) {
    case "grant": {
      const [email, role] = args;
      if (!email || !role || !ALL_PLATFORM_ROLES.includes(role as PlatformRole)) {
        console.error(`usage: grant <email> <${ALL_PLATFORM_ROLES.join("|")}>`);
        process.exit(2);
      }
      await transact((data) => {
        const user = data.users.find((u) => u.email === email.toLowerCase());
        if (!user) throw new Error(`No account for ${email}. Register at /auth/register first.`);
        const before = [...user.roles];
        user.roles = [...new Set([...user.roles, role as PlatformRole])];
        appendAudit(data, { actor: null, action: "role.grant.local_cli", entityType: "user", entityId: user.id, before: { roles: before }, after: { roles: user.roles }, reason: "Local development bootstrap (scripts/sonara-dev.ts)" }, "local-cli");
      });
      console.log(`Granted ${role} to ${email}. Sign out and back in is not required; roles are read per request.`);
      break;
    }
    case "verify": {
      const [email] = args;
      await transact((data) => {
        const user = data.users.find((u) => u.email === (email ?? "").toLowerCase());
        if (!user) throw new Error("No such account");
        user.emailVerifiedAt ??= new Date().toISOString();
        appendAudit(data, { actor: null, action: "account.email_verified.local_cli", entityType: "user", entityId: user.id }, "local-cli");
      });
      console.log(`Verified ${email}.`);
      break;
    }
    case "seed-sample": {
      const mediaDir = path.join(dataDirectory(), "media");
      await fs.mkdir(mediaDir, { recursive: true, mode: 0o700 });
      await transact(async (data) => {
        if (data.mcSeries.some((s) => s.isSample)) throw new Error("Sample content already exists.");
        const now = new Date();
        const seriesId = randomId("ser");
        const category = data.mcCategories.find((c) => c.slug === "physiology");
        data.mcSeries.push({
          id: seriesId,
          slug: "sample-series-test-tones",
          title: "[Sample] Test series — generated tones",
          description: "SAMPLE CONTENT FOR LOCAL TESTING. The audio is a generated test tone, not a medical programme. It exists to exercise free and premium access, the player and the editorial workflow.",
          coverAssetId: null,
          categoryId: category?.id ?? null,
          specialtyId: null,
          editorDisplay: "Sonara development",
          hostDisplay: "Test tone",
          status: "published",
          requiresSubscription: true,
          freeEpisodeAllowance: null,
          publishedAt: now.toISOString(),
          seoTitle: "",
          seoDescription: "",
          relatedSeriesIds: [],
          isSample: true,
          createdBy: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
        for (let n = 1; n <= 4; n += 1) {
          const id = randomId("aud");
          const wav = toneWav(20 + n * 5, 330 + n * 110);
          await fs.writeFile(path.join(mediaDir, `${id}.wav`), wav, { mode: 0o600 });
          data.media.push({ id, kind: "audio", mime: "audio/wav", bytes: wav.length, sha256: sha256(wav), storage: "local_disk", path: `${id}.wav`, originalName: `sample-tone-${n}.wav`, uploadedBy: "local-cli", createdAt: now.toISOString() });
          const published = new Date(now.getTime() - (10 - n) * 86_400_000).toISOString();
          const episode: McEpisode = {
            id: randomId("epi"),
            seriesId,
            slug: `sample-test-tone-${n}`,
            title: `[Sample] Test tone ${n}`,
            description: `Sample episode ${n}. A ${20 + n * 5}-second generated tone for testing playback. Not medical content.`,
            season: 1,
            episodeNumber: n,
            coverAssetId: null,
            durationSeconds: 20 + n * 5,
            transcript: "",
            contentNotes: "Generated test audio.",
            references: [{ title: "Not applicable — generated test content" }],
            aiDisclosure: "human_produced",
            accessOverride: "inherit",
            downloadAllowed: false,
            status: "published",
            version: 1,
            source: { kind: "uploaded_audio", url: null, assetId: id, status: "active", statusNote: "", checkedAt: null, updatedAt: now.toISOString() },
            submittedBy: null,
            submittedAt: null,
            lastEditedBy: null,
            approvedVersion: 1,
            approvedBy: "local-cli",
            approvedAt: published,
            publishedAt: published,
            withdrawnAt: null,
            withdrawnReason: null,
            lastReviewedAt: null,
            lastReviewedBy: null,
            relatedEpisodeIds: [],
            isSample: true,
            createdBy: null,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          };
          data.mcEpisodes.push(episode);
        }
        appendAudit(data, { actor: null, action: "sample.seeded.local_cli", entityType: "mc_series", entityId: seriesId, reason: "Local sample content" }, "local-cli");
      });
      console.log("Sample series created at /medical-chronicles/series/sample-series-test-tones (episodes 1–2 free, 3–4 premium).");
      break;
    }
    case "audit-verify": {
      const data = await read();
      const result = verifyAuditChain(data.audit);
      console.log(result.ok ? `Audit chain intact (${data.audit.length} records).` : `Audit chain BROKEN at record ${result.brokenAtSeq}.`);
      if (!result.ok) process.exit(1);
      break;
    }
    default:
      console.log("commands: grant <email> <role> | verify <email> | seed-sample | audit-verify");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
