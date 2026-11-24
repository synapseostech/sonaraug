import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFeatureFlags } from "./features.ts";

test("commercial surfaces default to OFF when unset", () => {
  const flags = resolveFeatureFlags({});
  assert.equal(flags.advertising, false);
  assert.equal(flags.downloads, false);
});

test("safe defaults stay ON when unset", () => {
  const flags = resolveFeatureFlags({});
  assert.equal(flags.comments, true);
  assert.equal(flags.dataSaverDefault, true);
});

test("accepts 'true' case-insensitively but rejects truthy-looking values", () => {
  for (const yes of ["true", "TRUE", " True "]) {
    assert.equal(resolveFeatureFlags({ FF_ENABLE_ADVERTISING: yes }).advertising, true, `expected ${yes} to enable`);
  }
  for (const no of ["1", "yes", "on", "enabled", "false", ""]) {
    assert.equal(resolveFeatureFlags({ FF_ENABLE_ADVERTISING: no }).advertising, false, `expected ${no} to stay off`);
  }
});
