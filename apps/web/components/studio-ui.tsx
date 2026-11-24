"use client";

/**
 * Workspace primitives shared by the Creator Studio and the admin console.
 * They deliberately reuse the listener design tokens so the two experiences
 * read as one product, while the density and structure differ.
 */

import Link from "next/link";
import { cloneElement, isValidElement, useId } from "react";
import type { ChangeEvent, ReactElement, ReactNode } from "react";
import { Badge, Button } from "@kito/ui";
import { PUBLICATION_FLOW } from "@kito/studio";
import type { PublicationStatus, ReviewStatus, StationSubmissionStatus, StreamHealth } from "@kito/studio";
import { useStudio } from "../lib/studio/store.tsx";

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

export function PageHead({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="ws-head">
      <div>
        <h1 className="ws-head__title">{title}</h1>
        {description ? <p className="ws-head__desc">{description}</p> : null}
      </div>
      {actions ? <div className="ws-head__actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  id,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="ws-panel" id={id}>
      {title ? (
        <div className="ws-panel__head">
          <div>
            <h2 className="ws-panel__title">{title}</h2>
            {subtitle ? <p className="ws-panel__sub">{subtitle}</p> : null}
          </div>
          {actions ? <div className="ws-panel__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="ws-panel__body">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: "warn" | "ok" }) {
  return (
    <div className={`ws-stat${tone ? ` ws-stat--${tone}` : ""}`}>
      <p className="ws-stat__label">{label}</p>
      <p className="ws-stat__value">{value}</p>
      {hint ? <p className="ws-stat__hint">{hint}</p> : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode }) {
  return (
    <div className={`ws-notice ws-notice--${tone}`} role={tone === "danger" ? "alert" : undefined}>
      {children}
    </div>
  );
}

export function EmptyHint({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ws-empty">
      <p className="ws-empty__title">{title}</p>
      {children ? <p className="ws-empty__body">{children}</p> : null}
      {action ? <div className="ws-empty__action">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

const STATION_LABEL: Record<StationSubmissionStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
};

const STREAM_LABEL: Record<StreamHealth, string> = {
  unverified: "Not verified",
  healthy: "Healthy",
  failing: "Failing",
  blocked: "Blocked",
};

export function StatusPill({ value, kind }: { value: string; kind: "publication" | "review" | "station" | "stream" | "plain" }) {
  const label =
    kind === "station"
      ? (STATION_LABEL[value as StationSubmissionStatus] ?? value)
      : kind === "stream"
        ? (STREAM_LABEL[value as StreamHealth] ?? value)
        : value.replace(/_/g, " ");
  return <span className={`ws-pill ws-pill--${kind} ws-pill--${value}`}>{label}</span>;
}

export function PublicationPill({ status }: { status: PublicationStatus }) {
  return <StatusPill kind="publication" value={status} />;
}

export function ReviewPill({ status }: { status: ReviewStatus }) {
  return <StatusPill kind="review" value={status} />;
}

/** The five-step pipeline, with the current step highlighted. */
export function WorkflowStepper({ status }: { status: PublicationStatus }) {
  const index = PUBLICATION_FLOW.indexOf(status);
  const offFlow = index === -1;
  return (
    <ol className="ws-steps" aria-label="Publication workflow">
      {PUBLICATION_FLOW.map((step, stepIndex) => {
        const state = offFlow ? "todo" : stepIndex < index ? "done" : stepIndex === index ? "current" : "todo";
        return (
          <li key={step} className={`ws-step ws-step--${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="ws-step__dot" aria-hidden="true" />
            <span className="ws-step__label">{step}</span>
          </li>
        );
      })}
      {offFlow ? <li className="ws-step ws-step--off">Currently {status.replace(/_/g, " ")}</li> : null}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/* Forms                                                                      */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  children,
  htmlFor,
  error,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
  error?: string | null;
}) {
  // Associate the label with its control even when the caller did not pass an
  // id: a field whose label points at nothing is unusable with a screen reader.
  const generated = useId();
  const id = htmlFor ?? generated;
  const control =
    isValidElement(children) && !(children as ReactElement<{ id?: string }>).props.id
      ? cloneElement(children as ReactElement<{ id?: string }>, { id })
      : children;

  return (
    <div className="ws-field">
      <label className="ws-field__label" htmlFor={id}>
        {label}
      </label>
      {control}
      {hint ? <p className="ws-field__hint">{hint}</p> : null}
      {error ? (
        <p className="ws-field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      id={id}
      className="ws-input"
      type={type}
      value={value}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
    />
  );
}

export function TextArea({
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <textarea
      id={id}
      className="ws-input ws-input--area"
      rows={rows}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function Select({
  id,
  value,
  onChange,
  options,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select id={id} className="ws-input ws-input--select" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function ToggleChips({
  options,
  selected,
  onToggle,
  disabled,
}: {
  options: readonly string[];
  selected: readonly string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="ws-chips">
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            className={`ws-chip${active ? " ws-chip--on" : ""}`}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onToggle(option)}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Data table                                                                 */
/* -------------------------------------------------------------------------- */

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  width?: string;
};

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty,
  caption,
}: {
  columns: readonly Column<T>[];
  rows: readonly T[];
  empty?: ReactNode;
  caption?: string;
}) {
  if (rows.length === 0) return <>{empty ?? <EmptyHint title="Nothing here yet" />}</>;
  return (
    <div className="ws-table-wrap">
      <table className="ws-table">
        {caption ? <caption className="ws-table__caption">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" style={column.width ? { width: column.width } : undefined}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key}>{column.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Permissions                                                                */
/* -------------------------------------------------------------------------- */

const ROLES = [
  { value: "creator", label: "Creator" },
  { value: "broadcaster", label: "Broadcaster" },
  { value: "reviewer", label: "Reviewer" },
  { value: "admin", label: "Administrator" },
] as const;

/**
 * Simulated role switcher. Real authorisation will come from Supabase Auth +
 * RLS; this exists so every journey can be exercised in one browser.
 */
export function RoleSwitcher() {
  const studio = useStudio();
  return (
    <label className="ws-role">
      <span className="ws-role__label">Acting as</span>
      <select
        className="ws-role__select"
        value={studio.actor.role}
        onChange={(event) => studio.setRole(event.target.value as (typeof ROLES)[number]["value"])}
        aria-label="Simulated role"
      >
        {ROLES.map((role) => (
          <option key={role.value} value={role.value}>
            {role.label}
          </option>
        ))}
      </select>
      <span className="ws-role__hint" title="Roles are simulated locally; no authentication exists in this build.">
        simulated
      </span>
    </label>
  );
}

export function ActionRow({ children }: { children: ReactNode }) {
  return <div className="ws-actions">{children}</div>;
}

export function LinkButton({ href, children, variant = "secondary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <Link href={href} className={`kt-btn kt-btn--${variant} kt-btn--sm`}>
      {children}
    </Link>
  );
}

export function DemoBadge() {
  return <Badge tone="demo">Demo data</Badge>;
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="ws-back">
      ← {children}
    </Link>
  );
}

export { Button };
