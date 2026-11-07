import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateJudgeResult } from "@/server/judge-engine";
import type { JudgeJob } from "@/lib/judge-types";
const live = process.env.RUN_LIVE_JUDGE_TESTS === "true";
const job: JudgeJob = {id:"synthetic-live-check",mode:"ai",kind:"chat",slot:"A",turnIndex:2,playerText:"Can you help me understand why B thinks I should wash tonight?",context:{topic:"Who should wash the dishes tonight?",phase:"rebuttal",themeId:"jungle",players:[{slot:"A",name:"Alex",position:"Cooking dinner should count as my share of chores."},{slot:"B",name:"Sam",position:"We should account for who washed dishes earlier this week."}],arguments:[{id:"opening-a",slot:"A",phase:"opening",turnIndex:0,text:"I cooked dinner tonight, so I should not have to wash the dishes.",submittedAt:"2026-11-07T20:00:00Z",status:"submitted"},{id:"opening-b",slot:"B",phase:"opening",turnIndex:1,text:"I already washed the dishes every day this week, so it should be your turn.",submittedAt:"2026-11-07T20:00:10Z",status:"submitted"},{id:"rebuttal-a",slot:"A",phase:"rebuttal",turnIndex:2,text:"Cooking took an hour. We have not agreed how cooking and washing should count.",submittedAt:"2026-11-07T20:00:20Z",status:"submitted"},{id:"rebuttal-b",slot:"B",phase:"rebuttal",turnIndex:3,text:"I appreciate cooking, but I want our total work across the week to be fair.",submittedAt:"2026-11-07T20:00:30Z",status:"submitted"}],questions:[],conversation:[]}};
describe.skipIf(!live)("Gemini live synthetic smoke (explicit opt-in)",()=>{
  beforeEach(() => {
    if (process.env.LIVE_JUDGE_DIAGNOSTICS !== "true") return;
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (...args) => {
      const response = await realFetch(...args);
      const payload = await response.clone().json().catch(() => null);
      // Synthetic fixtures only. Never print request URLs, headers, environment
      // values, provider error payloads, response IDs or token credentials.
      const candidates = payload?.candidates?.map((candidate: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }) => ({
        finishReason: candidate.finishReason,
        output: candidate.content?.parts?.filter(part => !part.thought).map(part => (part.text ?? "").replaceAll(process.env.GEMINI_API_KEY ?? "missing-key", "[redacted]")).join("").slice(0, 2400),
      }));
      console.log("LIVE_GEMINI_DIAGNOSTIC", { status: response.status, blocked: Boolean(payload?.promptFeedback?.blockReason), candidates });
      return response;
    });
  });
  it("answers Player A using shared arguments without a winner",async()=>{
    const r=await generateJudgeResult(job); expect(r.source).toBe("ai");expect(r.text).toMatch(/week|wash|chore|cook/i);expect(r.text).not.toMatch(/(?:player|side)\s*[AB]\s+wins/i);console.log("LIVE_A",r);
  });
  it("saves two distinct questions grounded in both sides",async()=>{
    const r=await generateJudgeResult({...job,kind:"questions",slot:null,playerText:null,context:{...job.context,phase:"questions",themeId:"courtroom"}});expect(r.source).toBe("ai");expect(r.questions).toHaveLength(2);expect(r.questions![0].text).not.toBe(r.questions![1].text);expect(r.questions!.map(q=>q.text).join(" ")).toMatch(/cook|wash|chore|week|dinner/i);console.log("LIVE_QUESTIONS",r);
  });
  it("answers Player B with earlier room conversation in memory",async()=>{
    const r=await generateJudgeResult({...job,slot:"B",turnIndex:3,playerText:"You suggested agreeing how to count the chores. Why would that help with my concern about the week?",context:{...job.context,themeId:"detective",conversation:[{id:"prior",kind:"chat",slot:"A",turnIndex:2,playerText:"How do we compare cooking and washing?",text:"Agreeing how to count both chores may help you compare total work across the week.",status:"complete",source:"ai",reaction:"speaking",createdAt:"2026-11-07T20:00:25Z",completedAt:"2026-11-07T20:00:27Z"}]}});expect(r.source).toBe("ai");expect(r.text).toMatch(/week|chore|cook|wash/i);console.log("LIVE_B",r);
  });
});
