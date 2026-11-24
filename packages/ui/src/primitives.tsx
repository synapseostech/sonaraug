import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.ts";
import { gradientFor, initials } from "./theme.ts";

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  icon?: ReactNode;
  block?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  block = false,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("kt-btn", `kt-btn--${variant}`, size === "sm" && "kt-btn--sm", block && "kt-btn--block", className)}
      {...rest}
    >
      {icon ? <span className="kt-btn__icon">{icon}</span> : null}
      {children}
    </button>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: "sm" | "md" | "lg";
  tone?: "default" | "accent" | "inverse";
};

export function IconButton({ label, size = "md", tone = "default", className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx("kt-iconbtn", `kt-iconbtn--${size}`, tone !== "default" && `kt-iconbtn--${tone}`, className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Badges, chips                                                              */
/* -------------------------------------------------------------------------- */

export function Badge({ tone = "neutral", children }: { tone?: "live" | "demo" | "neutral" | "accent"; children: ReactNode }) {
  return (
    <span className={cx("kt-badge", `kt-badge--${tone}`)}>
      {tone === "live" ? <span className="kt-badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function Chip({
  active = false,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button type="button" className={cx("kt-chip", active && "kt-chip--active")} aria-pressed={active} {...rest}>
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Artwork                                                                    */
/* -------------------------------------------------------------------------- */

export function Artwork({
  seed,
  title,
  shape = "square",
  label,
  className,
}: {
  seed: string;
  title: string;
  shape?: "square" | "wide" | "round";
  label?: string;
  className?: string;
}) {
  const { from, to } = gradientFor(seed);
  return (
    <div
      className={cx("kt-artwork", `kt-artwork--${shape}`, className)}
      style={{ backgroundImage: `radial-gradient(120% 120% at 15% 10%, ${from} 0%, ${to} 70%)` }}
      role="img"
      aria-label={`${title} artwork`}
    >
      <span className="kt-artwork__initials" aria-hidden="true">
        {initials(label ?? title)}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="kt-section">
      <div>
        <h2 className="kt-section__title">{title}</h2>
        {subtitle ? <p className="kt-section__subtitle">{subtitle}</p> : null}
      </div>
      {action ? (
        <a className="kt-section__link" href={action.href}>
          {action.label}
        </a>
      ) : null}
    </div>
  );
}

export function Scroller({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="kt-scroller" role="list" aria-label={label}>
      {children}
    </div>
  );
}

export function Skeleton({ height = 16, width = "100%", radius = 8 }: { height?: number | string; width?: number | string; radius?: number }) {
  return <div className="kt-skeleton" style={{ height, width, borderRadius: radius }} aria-hidden="true" />;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="kt-empty">
      <p className="kt-empty__title">{title}</p>
      <p className="kt-empty__body">{description}</p>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={cx("kt-progress", className)} role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
      <div className="kt-progress__fill" style={{ width: `${clamped}%` }} />
    </div>
  );
}

type RangeProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: number;
  onValueChange: (value: number) => void;
  label: string;
};

export function Range({ value, onValueChange, label, min = 0, max = 100, step = 1, className, ...rest }: RangeProps) {
  const span = Number(max) - Number(min) || 1;
  const fill = ((value - Number(min)) / span) * 100;
  return (
    <input
      type="range"
      className={cx("kt-range", className)}
      style={{ ["--kt-fill" as string]: `${Math.min(100, Math.max(0, fill))}%` }}
      value={value}
      min={min}
      max={max}
      step={step}
      aria-label={label}
      onChange={(event) => onValueChange(Number(event.target.value))}
      {...rest}
    />
  );
}
