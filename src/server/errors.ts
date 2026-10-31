export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "OTP_INVALID"
  | "OTP_EXPIRED"
  | "OTP_LOCKED"
  | "ACCOUNT_SUSPENDED"
  | "LAST_OWNER";

/** Expected, user-facing failure. `code` maps to a localized message in the UI. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
