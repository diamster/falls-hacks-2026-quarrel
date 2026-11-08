import "server-only";

export type JuryFailureCode = "rate_limited" | "quota_exhausted" | "provider_unavailable" | "timeout" | "invalid_response" | "missing_configuration" | "demo_mode" | "unsafe_dispute";

/** Safe metadata only: never attach provider bodies, prompts, or credentials. */
export class JuryUnavailableError extends Error {
  constructor(public readonly reasonCode: JuryFailureCode, public readonly retryable = true, public readonly retryAfterSeconds?: number) {
    super("Jury evaluation is unavailable; no verdict has been generated.");
    this.name = "JuryUnavailableError";
  }
}
