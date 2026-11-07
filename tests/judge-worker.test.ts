import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { judgeServerConfig, processJudgeWork } from "@/server/judge-worker";
import { generateJudgeResult } from "@/server/judge-engine";
vi.mock("@/server/judge-engine",()=>({generateJudgeResult:vi.fn()}));
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
