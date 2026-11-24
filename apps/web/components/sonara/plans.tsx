import Link from "next/link";
import { formatMoney, INTERVAL_LABEL, type Plan } from "@kito/billing";

export function PlanCard({ plan, cta, featured }: { plan: Plan; cta: { href: string; label: string } | null; featured?: boolean }) {
  return (
    <article className={`sn-plan${featured ? " sn-plan--featured" : ""}`} aria-labelledby={`plan-${plan.id}`}>
      <h3 className="sn-plan__name" id={`plan-${plan.id}`}>
        {plan.name}
      </h3>
      <p className="sn-plan__price">
        {formatMoney({ amount: plan.amount, currency: plan.currency })} <span>{INTERVAL_LABEL[plan.interval]}</span>
      </p>
      {plan.priceIsPlaceholder ? <p className="sn-placeholder">Development price — not approved for launch.</p> : null}
      {plan.description ? <p className="sn-small" style={{ margin: 0 }}>{plan.description}</p> : null}
      <ul className="sn-plan__features">
        {plan.features.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {cta ? (
        <Link className={`kt-btn ${featured ? "kt-btn--primary" : "kt-btn--secondary"}`} href={cta.href}>
          {cta.label}
        </Link>
      ) : null}
    </article>
  );
}
