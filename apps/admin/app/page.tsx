import { brand } from "@kito/config";

/**
 * Platform control centre shell (Phase 4).
 * Not yet implemented: verification queue, moderation, rights, revenue.
 */
export default function AdminHome() {
  return (
    <main style={{ padding: 48, fontFamily: "system-ui, sans-serif", minHeight: "100vh" }}>
      <h1>{brand.name} Control Centre</h1>
      <p>Internal administration. Build status: not implemented (Phase 4).</p>
    </main>
  );
}
