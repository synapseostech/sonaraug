"use client";

/**
 * Form toolkit for server actions (React 19 useActionState).
 * Every field has a programmatic label, hint and error, wired with aria-*.
 * Validation happens on the server; these components only display its result.
 */
import { createContext, useActionState, useContext, useEffect, useId, useRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

export type FormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Echoed values so a failed submission keeps what the user typed. */
  values?: Record<string, string>;
};

export type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;

const FormContext = createContext<FormState>({});

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  encType,
  confirm,
  "aria-label": ariaLabel,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  encType?: string;
  /** A confirmation prompt for destructive actions. */
  confirm?: string;
  "aria-label"?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
    if (state.message) messageRef.current?.focus();
  }, [state, resetOnSuccess]);
  return (
    <FormContext.Provider value={state}>
      <form
        ref={ref}
        action={formAction}
        className={className ?? "ws-form sn-form"}
        encType={encType}
        aria-label={ariaLabel}
        noValidate
        onSubmit={(event) => {
          if (confirm && !window.confirm(confirm)) event.preventDefault();
        }}
      >
        {state.message ? (
          <div ref={messageRef} tabIndex={-1} className={`ws-notice ${state.ok ? "ws-notice--ok" : "ws-notice--danger"} sn-form__message`} role={state.ok ? "status" : "alert"}>
            {state.message}
          </div>
        ) : null}
        {children}
      </form>
    </FormContext.Provider>
  );
}

export function useFormState(): FormState {
  return useContext(FormContext);
}

export function SubmitButton({ children, pendingLabel, variant = "primary", name, value, disabled }: { children: ReactNode; pendingLabel?: string; variant?: "primary" | "secondary" | "ghost" | "danger"; name?: string; value?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`kt-btn kt-btn--${variant === "danger" ? "secondary sn-btn--danger" : variant}`} disabled={pending || disabled} aria-busy={pending} name={name} value={value}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}

function FieldShell({ id, label, hint, error, children, required, optionalLabel }: { id: string; label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; required?: boolean; optionalLabel?: boolean }) {
  return (
    <div className={`ws-field${error ? " sn-field--error" : ""}`}>
      <label className="ws-field__label" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : optionalLabel ? <span className="sn-optional"> (optional)</span> : null}
      </label>
      {children}
      {hint ? (
        <p className="ws-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="ws-field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint: unknown, error: unknown) {
  return [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
}

type BaseProps = { name: string; label: ReactNode; hint?: ReactNode; optionalLabel?: boolean };

export function TextField({ name, label, hint, optionalLabel, defaultValue, ...rest }: BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, "name">) {
  const id = useId();
  const state = useFormState();
  const error = state.fieldErrors?.[name];
  const value = state.values?.[name] ?? defaultValue;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={rest.required} optionalLabel={optionalLabel}>
      <input id={id} name={name} className="ws-input" defaultValue={value} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} key={String(value ?? "")} />
    </FieldShell>
  );
}

export function TextArea({ name, label, hint, optionalLabel, defaultValue, ...rest }: BaseProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  const id = useId();
  const state = useFormState();
  const error = state.fieldErrors?.[name];
  const value = state.values?.[name] ?? defaultValue;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={rest.required} optionalLabel={optionalLabel}>
      <textarea id={id} name={name} className="ws-input ws-input--area" defaultValue={value} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} rows={4} {...rest} key={String(value ?? "")} />
    </FieldShell>
  );
}

export function SelectField({ name, label, hint, optionalLabel, options, defaultValue, ...rest }: BaseProps & { options: { value: string; label: string }[] } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  const id = useId();
  const state = useFormState();
  const error = state.fieldErrors?.[name];
  const value = state.values?.[name] ?? defaultValue;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={rest.required} optionalLabel={optionalLabel}>
      <select id={id} name={name} className="ws-input ws-input--select" defaultValue={value} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...rest} key={String(value ?? "")}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function Checkbox({ name, label, hint, defaultChecked, value = "on", required }: { name: string; label: ReactNode; hint?: ReactNode; defaultChecked?: boolean; value?: string; required?: boolean }) {
  const id = useId();
  const state = useFormState();
  const error = state.fieldErrors?.[name];
  return (
    <div className={`sn-check${error ? " sn-field--error" : ""}`}>
      <input type="checkbox" id={id} name={name} value={value} defaultChecked={defaultChecked} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} required={required} />
      <div>
        <label htmlFor={id}>{label}</label>
        {hint ? (
          <p className="ws-field__hint" id={`${id}-hint`}>
            {hint}
          </p>
        ) : null}
        {error ? (
          <p className="ws-field__error" id={`${id}-error`}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function PasswordField({ name, label, hint, autoComplete }: { name: string; label: string; hint?: ReactNode; autoComplete: "current-password" | "new-password" }) {
  const id = useId();
  const state = useFormState();
  const [visible, setVisible] = useState(false);
  const error = state.fieldErrors?.[name];
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required>
      <div className="sn-password">
        <input id={id} name={name} type={visible ? "text" : "password"} className="ws-input" autoComplete={autoComplete} required aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} />
        <button type="button" className="kt-btn kt-btn--ghost kt-btn--sm" onClick={() => setVisible((v) => !v)} aria-controls={id} aria-pressed={visible}>
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </FieldShell>
  );
}

/** Groups form actions at the end of a form. */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className="sn-form__actions">{children}</div>;
}
