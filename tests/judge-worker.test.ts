import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { judgeServerConfig, processJudgeWork, processLawyerWork } from "@/server/judge-worker";
import { generateJudgeResult, generateLawyerResult } from "@/server/judge-engine";
vi.mock("@/server/judge-engine",()=>({generateJudgeResult:vi.fn(),generateLawyerResult:vi.fn()}));
const generate=vi.mocked(generateJudgeResult);
beforeEach(()=>{vi.stubEnv("JUDGE_SERVER_SECRET","worker-key");vi.stubEnv("GEMINI_API_KEY","");vi.stubEnv("JUDGE_AI_MODE","auto");vi.stubEnv("JUDGE_MAX_MESSAGES_PER_TURN","2");});
describe("server judge worker",()=>{
  it("claims once and persists a validated result",async()=>{
    const job={id:"server-generated-id",kind:"chat"}; const result={text:"A neutral question",reaction:"questioning" as const,source:"demo" as const};
    const rpc=vi.fn().mockResolvedValueOnce({data:job,error:null}).mockResolvedValueOnce({data:{},error:null});generate.mockResolvedValue(result);
    expect(await processJudgeWork({rpc} as unknown as SupabaseClient,"worker-key")).toBe(true);
    expect(generate).toHaveBeenCalledWith(job);
    expect(rpc).toHaveBeenNthCalledWith(2,"finish_quarrel_judge_work",{p_id:job.id,p_result:result,p_server_key:"worker-key"});
  });
  it.each([{data:null,error:null},{data:null,error:{message:"private error"}}])("never calls the model without a successful claim",async outcome=>{
    const rpc=vi.fn().mockResolvedValue(outcome);expect(await processJudgeWork({rpc} as unknown as SupabaseClient,"key")).toBe(false);expect(generate).not.toHaveBeenCalled();
  });
  it("leaves provider/transport exceptions to the durable lease fallback",async()=>{
    const rpc=vi.fn().mockResolvedValue({data:{id:"id"},error:null});generate.mockRejectedValue(new Error("private error"));
    expect(await processJudgeWork({rpc} as unknown as SupabaseClient,"key")).toBe(false);expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("does not retry the model after a save failure",async()=>{
    const rpc=vi.fn().mockResolvedValueOnce({data:{id:"id"},error:null}).mockResolvedValueOnce({error:{message:"write failed"}});generate.mockResolvedValue({text:"Text",reaction:"speaking",source:"demo"});
    expect(await processJudgeWork({rpc} as unknown as SupabaseClient,"key")).toBe(false);expect(generate).toHaveBeenCalledTimes(1);
  });
  it("selects demo without a key and bounds the configurable quota",()=>{
    expect(judgeServerConfig()).toMatchObject({mode:"demo",messageLimit:2});vi.stubEnv("GEMINI_API_KEY","key");expect(judgeServerConfig().mode).toBe("ai");vi.stubEnv("JUDGE_AI_MODE","demo");expect(judgeServerConfig().mode).toBe("demo");
    for(const limit of ["0","6","1.5","NaN"]) {vi.stubEnv("JUDGE_MAX_MESSAGES_PER_TURN",limit);expect(judgeServerConfig().messageLimit).toBe(2);}
    vi.stubEnv("JUDGE_MAX_MESSAGES_PER_TURN","5");expect(judgeServerConfig().messageLimit).toBe(5);vi.stubEnv("JUDGE_SERVER_SECRET","");expect(judgeServerConfig().serverKey).toBe("");
  });
});

describe("Stage 5 claimed work", () => {
  const generateLawyer = vi.mocked(generateLawyerResult);
  const job = { id: "private-job", kind: "consult", claimToken: "attempt-token" };
  const result = { kind: "consult" as const, source: "demo" as const, text: "Private advice" };
  it("saves exactly one result through the caller's authorized database client", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: job, error: null }).mockResolvedValueOnce({ data: {}, error: null });
    generateLawyer.mockResolvedValue(result);
    expect(await processLawyerWork({ rpc } as unknown as SupabaseClient, "capability")).toBe(true);
    expect(rpc).toHaveBeenNthCalledWith(1, "claim_quarrel_lawyer_work_v2", { p_server_key: "capability" });
    expect(rpc).toHaveBeenNthCalledWith(2, "finish_quarrel_lawyer_work_v2", { p_id: job.id, p_result: result, p_server_key: "capability", p_claim_token: job.claimToken });
    expect(generateLawyer).toHaveBeenCalledExactlyOnceWith(job);
  });
  it.each([{ data: null, error: null }, { data: null, error: { message: "Denied" } }])("does not generate without an authorized claim", async response => {
    const rpc = vi.fn().mockResolvedValue(response);
    expect(await processLawyerWork({ rpc } as unknown as SupabaseClient, "capability")).toBe(false);
    expect(generateLawyer).not.toHaveBeenCalled();
  });
  it("leaves a failed save to the lease rather than repeating a paid generation", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: job, error: null }).mockResolvedValueOnce({ error: { message: "Failed" } });
    generateLawyer.mockResolvedValue(result);
    expect(await processLawyerWork({ rpc } as unknown as SupabaseClient, "capability")).toBe(false);
    expect(generateLawyer).toHaveBeenCalledTimes(1);
  });
  it("recovers thrown transport errors without exposing private provider details", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("Private error"));
    expect(await processLawyerWork({ rpc } as unknown as SupabaseClient, "capability")).toBe(false);
  });
  it("requires the database's attempt token before making a paid call", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "job", kind: "jury" }, error: null });
    expect(await processLawyerWork({ rpc } as unknown as SupabaseClient, "capability")).toBe(false);
    expect(generateLawyer).not.toHaveBeenCalled();
  });
  it.each(["quota_exhausted", "rate_limited", "timeout", "invalid_response", "missing_configuration", "demo_mode", "unsafe_dispute"])("records %s without producing a jury verdict", async reasonCode => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { ...job, kind: "jury" }, error: null }).mockResolvedValueOnce({ error: null });
    generateLawyer.mockRejectedValue(Object.assign(new Error("private provider response"), { reasonCode }));
    expect(await processLawyerWork({ rpc } as unknown as SupabaseClient, "capability")).toBe(false);
    expect(rpc).toHaveBeenLastCalledWith("fail_quarrel_lawyer_work", { p_id: job.id, p_claim_token: job.claimToken, p_server_key: "capability", p_error_code: reasonCode });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("reduces unknown errors to a fixed safe code and tolerates failure-record outages", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: job, error: null }).mockRejectedValueOnce(new Error("database outage"));
    generateLawyer.mockRejectedValue({ reasonCode: "secret data" });
    expect(await processLawyerWork({ rpc } as unknown as SupabaseClient, "capability")).toBe(false);
    expect(rpc).toHaveBeenLastCalledWith("fail_quarrel_lawyer_work", { p_id: job.id, p_claim_token: job.claimToken, p_server_key: "capability", p_error_code: "provider_unavailable" });
  });
});
