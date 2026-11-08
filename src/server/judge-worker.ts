import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JudgeJob } from "@/lib/judge-types";
import { generateJudgeResult, generateLawyerResult } from "./judge-engine";
import type { LawyerJob } from "@/lib/lawyer-types";

/** Each database job is claimed once, across all app instances and refreshes. */
export async function processJudgeWork(db: SupabaseClient, serverKey: string): Promise<boolean> {
  try {
    const claim = await db.rpc("claim_quarrel_judge_work", { p_server_key: serverKey });
    if (claim.error || !claim.data) return false;
    const job = claim.data as JudgeJob;
    const result = await generateJudgeResult(job);
    const finished = await db.rpc("finish_quarrel_judge_work", { p_id: job.id, p_result: result, p_server_key: serverKey });
    return !finished.error;
  } catch {
    // The database lease supplies a saved fallback after a worker outage. Never
    // restart a claimed model call, log player content or expose provider errors.
    return false;
  }
}

/** Private consultations can only be claimed through their owner's session. */
export async function processLawyerWork(db: SupabaseClient, serverKey: string): Promise<boolean> {
  try {
    const claim = await db.rpc("claim_quarrel_lawyer_work_v2", { p_server_key: serverKey });
    if (claim.error || !claim.data) return false;
    const job = claim.data as LawyerJob;
    if (!job.claimToken) return false;
    let result;
    try {
      result = await generateLawyerResult(job);
    } catch (error) {
      // Only fixed diagnostic codes cross the database boundary. Provider
      // bodies, prompts and credentials must never be saved as error text.
      const code = error && typeof error === "object" && "reasonCode" in error ? error.reasonCode : "unavailable";
      const allowed = ["quota_exhausted", "rate_limited", "provider_unavailable", "timeout", "invalid_response", "missing_configuration", "demo_mode", "unsafe_dispute"];
      await db.rpc("fail_quarrel_lawyer_work", {
        p_id: job.id, p_claim_token: job.claimToken, p_server_key: serverKey,
        p_error_code: typeof code === "string" && allowed.includes(code) ? code : "provider_unavailable",
      });
      return false;
    }
    const finished = await db.rpc("finish_quarrel_lawyer_work_v2", { p_id: job.id, p_result: result, p_server_key: serverKey, p_claim_token: job.claimToken });
    return !finished.error;
  } catch {
    return false;
  }
}

export function judgeServerConfig() {
  const rawLimit = Number(process.env.JUDGE_MAX_MESSAGES_PER_TURN ?? 2);
  return {
    serverKey: process.env.JUDGE_SERVER_SECRET ?? "",
    mode: process.env.GEMINI_API_KEY && process.env.JUDGE_AI_MODE !== "demo" ? "ai" : "demo",
    messageLimit: Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 5 ? rawLimit : 2,
  };
}
