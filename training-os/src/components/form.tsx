"use client";

import { createContext, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  data?: Record<string, unknown>;
};
export type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const Ctx = createContext<ActionState>({});

export function Form({
  action,
  children,
  className = "space-y-4",
  resetOnSuccess = false,
  confirm,
  encType,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
  encType?: "multipart/form-data";
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <Ctx.Provider value={state}>
      <form
        ref={ref}
        action={formAction}
        className={className}
        encType={encType}
        onSubmit={(e) => {
          if (confirm && !window.confirm(confirm)) e.preventDefault();
        }}
      >
        <FormMessage />
        {children}
      </form>
    </Ctx.Provider>
  );
}

export function useFormState() {
  return useContext(Ctx);
}

function FormMessage() {
  const s = useContext(Ctx);
  if (s.error)
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {s.error}
      </div>
    );
  if (s.ok && s.message)
    return (
      <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 whitespace-pre-line">
        {s.message}
      </div>
    );
  return null;
}

function FieldError({ name }: { name: string }) {
  const s = useContext(Ctx);
  const errs = s.fieldErrors?.[name];
  if (!errs?.length) return null;
  return <p className="mt-1 text-xs text-red-600">{errs[0]}</p>;
}

type BaseProps = { name: string; label: string; required?: boolean; hint?: ReactNode; className?: string };

export function Field({
  name,
  label,
  required,
  hint,
  className,
  type = "text",
  defaultValue,
  placeholder,
  autoComplete,
  min,
  max,
  step,
  accept,
}: BaseProps & {
  type?: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  autoComplete?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  accept?: string;
}) {
  return (
    <div className={className}>
      <label className="label" htmlFor={`f-${name}`}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={`f-${name}`}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? undefined}
        placeholder={placeholder}
        autoComplete={autoComplete}
        min={min}
        max={max}
        step={step}
        accept={accept}
        className={type === "file" ? "block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-700" : "input"}
      />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <FieldError name={name} />
    </div>
  );
}

export function TextArea({ name, label, required, hint, className, defaultValue, rows = 3, placeholder }: BaseProps & { defaultValue?: string | null; rows?: number; placeholder?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={`f-${name}`}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <textarea id={`f-${name}`} name={name} rows={rows} required={required} defaultValue={defaultValue ?? undefined} placeholder={placeholder} className="input" />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <FieldError name={name} />
    </div>
  );
}

export function Select({
  name,
  label,
  required,
  hint,
  className,
  options,
  defaultValue,
  placeholder,
}: BaseProps & { options: { value: string; label: string }[]; defaultValue?: string | null; placeholder?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={`f-${name}`}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select id={`f-${name}`} name={name} required={required} defaultValue={defaultValue ?? ""} className="input">
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <FieldError name={name} />
    </div>
  );
}

export function Checkbox({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm text-slate-700">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600" />
      <span>
        {label}
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

export function Submit({ children, className = "btn-primary", pendingText = "Enregistrement…" }: { children: ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}

/** Petit formulaire d'une action (bouton seul), avec confirmation optionnelle. */
export function ActionButton({
  action,
  children,
  hidden,
  className = "btn-secondary btn-sm",
  confirm,
}: {
  action: FormAction;
  children: ReactNode;
  hidden?: Record<string, string>;
  className?: string;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-start"
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Submit className={className} pendingText="…">
        {children}
      </Submit>
      {state.error && <span className="mt-1 max-w-xs text-xs text-red-600">{state.error}</span>}
      {state.ok && state.message && <span className="mt-1 text-xs text-emerald-700">{state.message}</span>}
    </form>
  );
}
