"use client";

import { useActionState } from "react";
import type { ActionState } from "@/server/web";

type Props = {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  submitLabel: string;
  children?: React.ReactNode;
  className?: string;
  testId?: string;
};

/** Form bound to a server action; shows the server's success or error message. */
export function ActionForm({ action, submitLabel, children, className, testId }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className ?? "flex flex-wrap items-end gap-2"} data-testid={testId}>
      {children}
      <button type="submit" disabled={pending} className="btn">
        {submitLabel}
      </button>
      {state?.error && (
        <p role="alert" className="w-full text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state?.ok && state.message && (
        <p role="status" className="w-full text-sm text-green-700 dark:text-green-400">
          {state.message}
        </p>
      )}
    </form>
  );
}
