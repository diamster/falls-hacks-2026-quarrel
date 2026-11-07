import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JudgeJob } from "@/lib/judge-types";
import { generateJudgeResult } from "./judge-engine";

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

export function judgeServerConfig() {
  const rawLimit = Number(process.env.JUDGE_MAX_MESSAGES_PER_TURN ?? 2);
  return {
    serverKey: process.env.JUDGE_SERVER_SECRET ?? "",
    mode: process.env.GEMINI_API_KEY && process.env.JUDGE_AI_MODE !== "demo" ? "ai" : "demo",
    messageLimit: Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 5 ? rawLimit : 2,
  };
}
