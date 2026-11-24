/**
 * Sonara UI kit — server-renderable building blocks shared by the listener
 * account pages, Medical Chronicles and the admin console. Built on the
 * existing design tokens (--kt-*) and workspace classes (ws-*).
 */
import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="sn-head">
      <div className="sn-head__text">
        {eyebrow ? <p className="sn-head__eyebrow">{eyebrow}</p> : null}
        <h1 className="sn-head__title">{title}</h1>
        {description ? <div className="sn-head__desc">{description}</div> : null}
      </div>
      {actions ? <div className="sn-head__actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({ title, subtitle, actions, children, id, tone }: { title?: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; id?: string; tone?: "danger" }) {
  return (
    <section className={`ws-panel${tone ? ` sn-panel--${tone}` : ""}`} id={id} aria-labelledby={title && id ? `${id}-title` : undefined}>
      {title ? (
        <div className="ws-panel__head">
          <div>
            <h2 className="ws-panel__title" id={id ? `${id}-title` : undefined}>
              {title}
            </h2>
            {subtitle ? <p className="ws-panel__sub">{subtitle}</p> : null}
          </div>
          {actions ? <div className="ws-panel__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="ws-panel__body">{children}</div>
    </section>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "danger" | "ok"; title?: string; children: ReactNode }) {
  return (
    <div className={`ws-notice ws-notice--${tone} sn-notice`} role={tone === "danger" ? "alert" : undefined}>
      {title ? <strong className="sn-notice__title">{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "warn" | "danger" | "info" | "accent"; children: ReactNode }) {
  return <span className={`sn-pill sn-pill--${tone}`}>{children}</span>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "warn" | "ok" }) {
  return (
    <div className={`ws-stat${tone ? ` ws-stat--${tone}` : ""}`}>
      <p className="ws-stat__label">{label}</p>
      <p className="ws-stat__value">{value}</p>
      {hint ? <p className="ws-stat__hint">{hint}</p> : null}
    </div>
  );
}

export function Stats({ children }: { children: ReactNode }) {
  return <div className="ws-stats">{children}</div>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ws-empty">
      <p className="ws-empty__title">{title}</p>
      {children ? <div className="ws-empty__body">{children}</div> : null}
      {action ? <div className="ws-empty__action">{action}</div> : null}
    </div>
  );
}

export type Column<T> = { key: string; header: string; cell: (row: T) => ReactNode; numeric?: boolean; className?: string };

export function DataTable<T>({ caption, columns, rows, rowKey, empty }: { caption: string; columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; empty?: ReactNode }) {
  if (rows.length === 0) return <>{empty ?? <Empty title="Nothing here yet" />}</>;
  return (
    <div className="ws-table-wrap" tabIndex={0} role="region" aria-label={caption}>
      <table className="ws-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? "ws-table__num" : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className={[c.numeric ? "ws-table__num" : "", c.className ?? ""].join(" ").trim() || undefined}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KeyValues({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="sn-kv">
      {items.map(([k, v], index) => (
        <div key={index} className="sn-kv__row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Pagination({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="sn-pagination" aria-label="Pagination">
      {page > 1 ? (
        <Link className="kt-btn kt-btn--ghost kt-btn--sm" href={href(page - 1)} rel="prev">
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="muted small">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link className="kt-btn kt-btn--ghost kt-btn--sm" href={href(page + 1)} rel="next">
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function AccessDenied({ title = "You do not have access to this area", children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="sn-denied" role="alert">
      <h1>{title}</h1>
      <p>{children ?? "Your account does not have the permissions this page needs. If you think this is a mistake, contact a Sonara administrator."}</p>
      <div className="sn-row">
        <Link className="kt-btn kt-btn--primary" href="/">
          Back to Sonara
        </Link>
        <Link className="kt-btn kt-btn--ghost" href="/account">
          Your account
        </Link>
      </div>
    </div>
  );
}

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-UG", withTime ? { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kampala" } : { dateStyle: "medium", timeZone: "Africa/Kampala" }).format(date);
}

export function SimulatedTag({ children = "Simulated" }: { children?: ReactNode }) {
  return <span className="sn-tag-sim" title="Uses local demo data or simulated behaviour, not production data.">{children}</span>;
}
