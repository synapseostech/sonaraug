import { KeyValues, Notice, PageHeader, Panel } from "../../../components/sonara/ui.tsx";
import { brand } from "@kito/config";
import { requireStaff } from "../../../lib/server/auth.ts";
import { storageStatus } from "../../../lib/server/media.ts";
import { emailProvider } from "../../../lib/server/notify.ts";
import { credentialReport, publicPaymentStatus } from "../../../lib/server/payments-config.ts";
import { read } from "../../../lib/server/store.ts";
import { SettingsForm } from "../forms.tsx";

export const metadata = { title: "Settings · Admin" };

export default async function SettingsPage() {
  const viewer = await requireStaff("settings:manage", "/admin/settings");
  const { settings } = await read();
  const creds = credentialReport();
  const storage = storageStatus();
  return (
    <>
      <PageHeader title="Platform settings" description="Changes are audited with before and after values. Secrets are never stored here; they live in server environment variables." />
      <div className="sn-admin-grid">
        <Panel>
          <SettingsForm settings={settings} canToggleLive={viewer.roles.includes("super_admin")} />
        </Panel>
        <div className="sn-stack">
          <Panel title="Payments">
            <p className="sn-small">{publicPaymentStatus(settings).label}</p>
            <KeyValues items={Object.entries(creds).map(([k, v]) => [<span key={k} className="sn-mono">{k}</span>, v])} />
          </Panel>
          <Panel title="Infrastructure">
            <KeyValues
              items={[
                ["Data store", "Local development JSON store (not production)"],
                ["Media storage", storage.note],
                ["Email", emailProvider() === "dev_outbox" ? "Development outbox (/dev/outbox); nothing is sent" : "Not configured"],
                ["Brand", `${brand.name} (internal codename ${brand.codename})`],
                ["Currency", settings.defaultCurrency],
                ["Regions", settings.regions.join(", ")],
              ]}
            />
          </Panel>
          <Notice tone="info">Feature flags (FF_*) and the brand name are set in the server environment and need a redeploy to change.</Notice>
        </div>
      </div>
    </>
  );
}
