"use client";

import { useState } from "react";
import { ActionForm, Checkbox, FormActions, SelectField, SubmitButton, TextArea, TextField } from "../../components/sonara/forms.tsx";
import {
  accountStatusAction,
  billingJobsAction,
  forgedWebhookAction,
  overrideAction,
  providerPlanAction,
  reconcileAction,
  refundDecisionAction,
  revokeOverrideAction,
  roleAction,
  savePlanAction,
  savePromoAction,
  saveSettingsAction,
} from "./actions.ts";

type PlanValues = {
  id?: string;
  audience: "listener" | "creator";
  code: string;
  name: string;
  description: string;
  interval: "monthly" | "annual";
  amount: number;
  currency: string;
  active: boolean;
  trialDays: number;
  features: readonly string[];
  priceIsPlaceholder: boolean;
  sortOrder: number;
  creatorLimits: { maxShows: number; maxEpisodes: number; uploadAllowanceMb: number; storageMb: number; canPublish: boolean; analytics: string; promotion: boolean; supportLevel: string } | null;
};

export function PlanForm({ values }: { values?: PlanValues }) {
  const [audience, setAudience] = useState<"listener" | "creator">(values?.audience ?? "listener");
  const limits = values?.creatorLimits;
  return (
    <ActionForm action={savePlanAction} aria-label={values?.id ? `Edit ${values.name}` : "New plan"}>
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <div className="ws-form-grid">
        <div className="ws-field">
          <label className="ws-field__label" htmlFor={`aud-${values?.id ?? "new"}`}>Product</label>
          <select id={`aud-${values?.id ?? "new"}`} name="audience" className="ws-input ws-input--select" value={audience} onChange={(e) => setAudience(e.target.value as "listener" | "creator")} disabled={Boolean(values?.id)}>
            <option value="listener">Listener</option>
            <option value="creator">Creator</option>
          </select>
          {values?.id ? <input type="hidden" name="audience" value={audience} /> : null}
        </div>
        <TextField name="code" label="Code" defaultValue={values?.code} required hint="e.g. listener-monthly" />
        <TextField name="name" label="Name" defaultValue={values?.name} required />
        <SelectField name="interval" label="Billing interval" defaultValue={values?.interval ?? "monthly"} options={[{ value: "monthly", label: "Monthly" }, { value: "annual", label: "Annual" }]} />
        <TextField name="amount" label="Price (whole units)" inputMode="numeric" defaultValue={values ? String(values.amount) : ""} required hint="UGX has no cents: 15000 = UGX 15,000." />
        <SelectField name="currency" label="Currency" defaultValue={values?.currency ?? "UGX"} options={["UGX", "KES", "TZS", "RWF", "USD"].map((c) => ({ value: c, label: c }))} />
        <TextField name="trialDays" label="Trial days" type="number" min={0} max={90} defaultValue={String(values?.trialDays ?? 0)} hint="Honoured only when trials are enabled in Settings." />
        <TextField name="sortOrder" label="Display order" type="number" defaultValue={String(values?.sortOrder ?? 0)} />
      </div>
      <TextField name="description" label="Description" defaultValue={values?.description} optionalLabel />
      <TextArea name="features" label="Features (one per line)" defaultValue={(values?.features ?? []).join("\n")} rows={3} />
      {audience === "creator" ? (
        <fieldset className="sn-fieldset">
          <legend>Creator limits</legend>
          <div className="ws-form-grid">
            <TextField name="maxShows" label="Max shows" type="number" min={0} defaultValue={String(limits?.maxShows ?? 1)} />
            <TextField name="maxEpisodes" label="Max episodes" type="number" min={0} defaultValue={String(limits?.maxEpisodes ?? 50)} />
            <TextField name="uploadAllowanceMb" label="Upload allowance per period (MB)" type="number" min={0} defaultValue={String(limits?.uploadAllowanceMb ?? 2000)} />
            <TextField name="storageMb" label="Storage (MB)" type="number" min={0} defaultValue={String(limits?.storageMb ?? 10000)} />
            <SelectField name="analytics" label="Analytics" defaultValue={limits?.analytics ?? "basic"} options={[{ value: "none", label: "None" }, { value: "basic", label: "Basic" }, { value: "full", label: "Full" }]} />
            <SelectField name="supportLevel" label="Support" defaultValue={limits?.supportLevel ?? "standard"} options={[{ value: "community", label: "Community" }, { value: "standard", label: "Standard" }, { value: "priority", label: "Priority" }]} />
          </div>
          <Checkbox name="canPublish" label="Includes publishing" defaultChecked={limits?.canPublish ?? true} />
          <Checkbox name="promotion" label="Includes promotional features" defaultChecked={limits?.promotion ?? false} />
        </fieldset>
      ) : null}
      <Checkbox name="active" label="Offered to customers" defaultChecked={values?.active ?? false} />
      <Checkbox name="priceIsPlaceholder" label="Price is a placeholder (not approved)" defaultChecked={values?.priceIsPlaceholder ?? true} hint="Shown to customers as a development price. Clear it only once the owner approves the price." />
      <FormActions>
        <SubmitButton>{values?.id ? "Save plan" : "Create plan"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function ProviderPlanButton({ planId }: { planId: string }) {
  return (
    <ActionForm action={providerPlanAction} className="sn-inline-form" confirm="Create a recurring card plan for this price with Flutterwave?">
      <input type="hidden" name="planId" value={planId} />
      <SubmitButton variant="ghost">Create Flutterwave card plan</SubmitButton>
    </ActionForm>
  );
}

export function PromoForm() {
  return (
    <ActionForm action={savePromoAction} aria-label="Promotional code" resetOnSuccess>
      <div className="ws-form-grid">
        <TextField name="code" label="Code" required hint="Letters and numbers" />
        <TextField name="percentOff" label="Percent off" type="number" min={1} max={99} optionalLabel />
        <TextField name="amountOff" label="Amount off (whole units)" type="number" min={1} optionalLabel />
        <SelectField name="currency" label="Currency (for amount off)" options={[{ value: "", label: "—" }, { value: "UGX", label: "UGX" }]} />
        <TextField name="validUntil" label="Valid until" type="date" optionalLabel />
        <TextField name="maxRedemptions" label="Max redemptions" type="number" min={1} optionalLabel />
      </div>
      <TextField name="description" label="Internal note" optionalLabel />
      <Checkbox name="active" label="Active" defaultChecked />
      <SubmitButton>Save code</SubmitButton>
    </ActionForm>
  );
}

export function OverrideForm({ creatorPlans }: { creatorPlans: { value: string; label: string }[] }) {
  return (
    <ActionForm action={overrideAction} aria-label="Entitlement adjustment" resetOnSuccess confirm="Record this entitlement adjustment? It is audited with your name and reason.">
      <div className="ws-form-grid">
        <TextField name="email" label="User email" type="email" required />
        <SelectField name="audience" label="Product" options={[{ value: "listener", label: "Listener (premium listening)" }, { value: "creator", label: "Creator (publishing)" }]} />
        <SelectField name="effect" label="Effect" options={[{ value: "grant", label: "Grant access" }, { value: "revoke", label: "Suspend access (overrides payment)" }]} />
        <TextField name="validUntil" label="Until" type="date" optionalLabel hint="Blank = no end date." />
        <SelectField name="planId" label="Creator plan limits" options={[{ value: "", label: "—" }, ...creatorPlans]} hint="Creator grants only." />
      </div>
      <TextField name="reason" label="Reason" required minLength={5} hint="Recorded in the audit log." />
      <SubmitButton>Record adjustment</SubmitButton>
    </ActionForm>
  );
}

export function RevokeOverrideForm({ id }: { id: string }) {
  return (
    <ActionForm action={revokeOverrideAction} className="sn-row" aria-label="Revoke override">
      <input type="hidden" name="id" value={id} />
      <input className="ws-input" name="reason" placeholder="Reason" aria-label="Reason for revoking" required minLength={5} />
      <SubmitButton variant="ghost">Revoke</SubmitButton>
    </ActionForm>
  );
}

export function JobButtons({ simulator }: { simulator: boolean }) {
  return (
    <div className="sn-row">
      <ActionForm action={reconcileAction} className="sn-inline-form">
        <SubmitButton variant="secondary" pendingLabel="Re-verifying…">Re-verify pending payments</SubmitButton>
      </ActionForm>
      <ActionForm action={billingJobsAction} className="sn-inline-form">
        <SubmitButton variant="ghost">Run billing jobs</SubmitButton>
      </ActionForm>
      {simulator ? (
        <ActionForm action={forgedWebhookAction} className="sn-inline-form">
          <SubmitButton variant="ghost">Send a forged webhook (test)</SubmitButton>
        </ActionForm>
      ) : null}
    </div>
  );
}

export function RefundDecisionForm({ id }: { id: string }) {
  return (
    <ActionForm action={refundDecisionAction} aria-label="Refund decision">
      <input type="hidden" name="id" value={id} />
      <SelectField
        name="decision"
        label="Decision"
        options={[
          { value: "approved", label: "Approve (refund to be sent from the Flutterwave dashboard)" },
          { value: "rejected", label: "Reject" },
          { value: "refunded", label: "Mark refunded (money has been returned)" },
        ]}
      />
      <TextField name="note" label="Decision note" required />
      <SubmitButton>Record decision</SubmitButton>
    </ActionForm>
  );
}

export function RoleForm({ userId, roles }: { userId: string; roles: { value: string; label: string }[] }) {
  return (
    <ActionForm action={roleAction} aria-label="Change role" resetOnSuccess>
      <input type="hidden" name="userId" value={userId} />
      <div className="ws-form-grid">
        <SelectField name="role" label="Role" options={roles} />
        <SelectField name="change" label="Change" options={[{ value: "grant", label: "Grant" }, { value: "revoke", label: "Revoke" }]} />
      </div>
      <TextField name="reason" label="Reason" required minLength={5} />
      <SubmitButton>Apply</SubmitButton>
    </ActionForm>
  );
}

export function AccountStatusForm({ userId, suspended }: { userId: string; suspended: boolean }) {
  return (
    <ActionForm action={accountStatusAction} aria-label="Account status" confirm={suspended ? "Reactivate this account?" : "Suspend this account? They will be signed out everywhere."}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={suspended ? "active" : "suspended"} />
      <TextField name="reason" label="Reason" required minLength={5} />
      <SubmitButton variant={suspended ? "secondary" : "danger"}>{suspended ? "Reactivate account" : "Suspend account"}</SubmitButton>
    </ActionForm>
  );
}

export function SettingsForm({ settings, canToggleLive }: { settings: { defaultFreeEpisodeAllowance: number; graceDays: number; freeRequiresAccount: boolean; trialsEnabled: boolean; maintenanceMode: boolean; livePaymentsEnabled: boolean; authorisedAudioHosts: string[]; termsVersion: string; privacyVersion: string }; canToggleLive: boolean }) {
  return (
    <ActionForm action={saveSettingsAction} aria-label="Platform settings">
      <fieldset className="sn-fieldset">
        <legend>Medical Chronicles</legend>
        <TextField name="defaultFreeEpisodeAllowance" label="Default free episodes per series" type="number" min={0} max={500} defaultValue={String(settings.defaultFreeEpisodeAllowance)} hint="Used when a series does not set its own allowance." />
        <Checkbox name="freeRequiresAccount" label="Free episodes require a (free) account" defaultChecked={settings.freeRequiresAccount} />
        <TextArea name="authorisedAudioHosts" label="Authorised audio hosts" defaultValue={settings.authorisedAudioHosts.join("\n")} rows={3} hint="One host per line, e.g. media.example.org. Only https audio on these hosts can be attached as an authorised URL." />
      </fieldset>
      <fieldset className="sn-fieldset">
        <legend>Subscriptions</legend>
        <TextField name="graceDays" label="Grace period after a missed renewal (days)" type="number" min={0} max={30} defaultValue={String(settings.graceDays)} />
        <Checkbox name="trialsEnabled" label="Honour plan trial days" defaultChecked={settings.trialsEnabled} hint="Keep off until free trials are approved." />
        <Checkbox name="livePaymentsEnabled" label="Allow live Flutterwave payments" defaultChecked={settings.livePaymentsEnabled} hint={canToggleLive ? "Also requires FLW_ENVIRONMENT=live and FLW_LIVE_APPROVED=yes on the server. Do not enable before owner approval and KYC." : "Only a super administrator can change this."} />
        {!canToggleLive && settings.livePaymentsEnabled ? <input type="hidden" name="livePaymentsEnabled" value="on" /> : null}
        <Checkbox name="maintenanceMode" label="Maintenance mode (pauses checkout)" defaultChecked={settings.maintenanceMode} />
      </fieldset>
      <fieldset className="sn-fieldset">
        <legend>Policies</legend>
        <div className="ws-form-grid">
          <TextField name="termsVersion" label="Terms version" defaultValue={settings.termsVersion} />
          <TextField name="privacyVersion" label="Privacy notice version" defaultValue={settings.privacyVersion} />
        </div>
      </fieldset>
      <TextField name="reason" label="Reason for this change" required minLength={5} hint="Recorded in the audit log with the before and after values." />
      <FormActions>
        <SubmitButton>Save settings</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
