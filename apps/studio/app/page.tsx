import { brand } from "@kito/config";

/**
 * Broadcaster / creator self-service shell (Phase 4).
 * Not yet implemented: organisation onboarding, station management, uploads.
 */
export default function StudioHome() {
  return (
    <main style={{ padding: 48, fontFamily: "system-ui, sans-serif", background: "#FAF7F2", color: "#1A1815", minHeight: "100vh" }}>
      <h1>{brand.name} Studio</h1>
      <p>Broadcaster and creator tools. Build status: not implemented (Phase 4).</p>
    </main>
  );
}
