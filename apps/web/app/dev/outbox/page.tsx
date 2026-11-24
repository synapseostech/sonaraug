import { notFound } from "next/navigation";
import { Empty, Notice, PageHeader, formatDate } from "../../../components/sonara/ui.tsx";
import { emailProvider } from "../../../lib/server/notify.ts";
import { read } from "../../../lib/server/store.ts";

export const metadata = { title: "Development outbox", robots: { index: false } };

/**
 * DEVELOPMENT ONLY: emails the app would have sent. 404 in production.
 * Shows only the newest messages; links are rendered as plain text to copy.
 */
export default async function OutboxPage() {
  if (emailProvider() !== "dev_outbox") notFound();
  const { outbox } = await read();
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }} className="sn-stack">
      <PageHeader title="Development outbox" description="Emails Sonara would send. Nothing here leaves this machine." />
      <Notice tone="warn">Development tool. Not available in production. Verification and reset links are single-use.</Notice>
      {outbox.length === 0 ? (
        <Empty title="No emails yet" />
      ) : (
        [...outbox].reverse().slice(0, 50).map((m) => (
          <article key={m.id} className="ws-panel">
            <div className="ws-panel__body">
              <p className="sn-small">
                {formatDate(m.createdAt, true)} · to {m.to} · {m.kind}
              </p>
              <h2 style={{ margin: "4px 0 8px", fontSize: 16 }}>{m.subject}</h2>
              <pre className="sn-code">
                {m.text.split(/(https?:\/\/\S+)/g).map((part, i) =>
                  /^https?:\/\//.test(part) ? (
                    <a key={i} className="sn-link" href={part}>
                      {part}
                    </a>
                  ) : (
                    part
                  ),
                )}
              </pre>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
