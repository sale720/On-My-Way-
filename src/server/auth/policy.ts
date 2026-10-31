/**
 * Authentication security policy. These are security controls, not commercial settings,
 * so they are code constants reviewed with the code (docs/DECISIONS.md, D-007).
 */
export const AUTH_POLICY = {
  otpTtlMs: 5 * 60_000,
  otpMaxAttempts: 5,
  /** Max OTP requests per phone in the window. */
  otpPerPhoneLimit: 3,
  /** Max OTP requests per client IP in the window. */
  otpPerIpLimit: 10,
  otpWindowMs: 15 * 60_000,
  sessionTtlMs: 30 * 24 * 60 * 60_000,
  sessionCookie: "omw_session",
} as const;
