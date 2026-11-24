"use client";

import Link from "next/link";
import { ActionForm, Checkbox, FormActions, SubmitButton, TextField } from "../../../components/sonara/forms.tsx";
import { startCheckoutAction } from "../actions.ts";

export function CheckoutForm({ planId, recurringAvailable, disabled }: { planId: string; recurringAvailable: boolean; disabled: boolean }) {
  return (
    <ActionForm action={startCheckoutAction} aria-label="Checkout">
      <input type="hidden" name="planId" value={planId} />
      <fieldset className="sn-fieldset">
        <legend>How do you want to renew?</legend>
        <div className="sn-choice">
          <label>
            <input type="radio" name="renewal" value="manual" defaultChecked />
            <span>
              <strong>Pay for one period</strong>
              <br />
              <span className="sn-small">Card or mobile money. We remind you before it ends; nothing is charged automatically.</span>
            </span>
          </label>
          <label>
            <input type="radio" name="renewal" value="card_auto" disabled={!recurringAvailable} />
            <span>
              <strong>Automatic card renewal</strong>
              <br />
              <span className="sn-small">
                {recurringAvailable ? "Card only. Flutterwave charges your card each period until you cancel." : "Not yet available for this plan."}
              </span>
            </span>
          </label>
        </div>
      </fieldset>
      <TextField name="promoCode" label="Promotional code" optionalLabel autoComplete="off" maxLength={32} />
      <Checkbox
        name="acceptTerms"
        required
        label={
          <>
            I agree to the <Link className="sn-link" href="/legal/terms" target="_blank">subscription terms</Link>. I can cancel any time and keep access until the end of the paid
            period.
          </>
        }
      />
      <FormActions>
        <SubmitButton pendingLabel="Contacting Flutterwave…" disabled={disabled}>
          Continue to secure payment
        </SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
