import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createResponsesCall } from "./ai-responses.server";

type RequestInput = { role: string; level: string; goal: string; hours: number; skills: string };

export type JobMatchResult = {
  score: number;
  summary: string;
  matchedKeywords: string[];
  missingKeywords: { keyword: string; priority: "high" | "medium" | "low"; evidence: string }[];
  experienceGaps: { requirement: string; resumeEvidence: string; nextStep: string }[];
  recommendations: string[];
};

export function normalizeJobMatchResult(input: unknown): JobMatchResult {
  if (!input || typeof input !== "object") throw new Error("The match report could not be formatted. Please try again.");
  const value = input as Record<string, unknown>;
  if (typeof value["score"] !== "number" || typeof value["summary"] !== "string") {
    throw new Error("The match report was incomplete. Please try scanning again.");
  }
  const strings = (item: unknown, limit = 10) => Array.isArray(item)
    ? item.filter((entry): entry is string => typeof entry === "string").slice(0, limit).map((entry) => entry.slice(0, 240))
    : [];
  const missingKeywords = Array.isArray(value["missingKeywords"]) ? value["missingKeywords"].slice(0, 12).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row["keyword"] !== "string") return [];
    const priority: JobMatchResult["missingKeywords"][number]["priority"] = row["priority"] === "high" || row["priority"] === "low" ? row["priority"] : "medium";
    return [{
      keyword: row["keyword"].slice(0, 100),
      priority,
      evidence: typeof row["evidence"] === "string" ? row["evidence"].slice(0, 240) : "Not clearly demonstrated in the resume.",
    }];
  }) : [];
  const experienceGaps = Array.isArray(value["experienceGaps"]) ? value["experienceGaps"].slice(0, 10).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row["requirement"] !== "string") return [];
    return [{
      requirement: row["requirement"].slice(0, 180),
      resumeEvidence: typeof row["resumeEvidence"] === "string" ? row["resumeEvidence"].slice(0, 240) : "The resume does not clearly show this yet.",
      nextStep: typeof row["nextStep"] === "string" ? row["nextStep"].slice(0, 240) : "Add a relevant example if you have one.",
    }];
  }) : [];
  return {
    score: Math.min(100, Math.max(0, Math.round(value["score"]))),
    summary: value["summary"].slice(0, 500),
    matchedKeywords: strings(value["matchedKeywords"], 12),
    missingKeywords,
    experienceGaps,
    recommendations: strings(value["recommendations"], 8),
  };
}

function validateRequest(input: unknown): RequestInput {
  if (!input || typeof input !== "object") throw new Error("Add your career details before continuing.");
  const value = input as Record<string, unknown>;
  const role = typeof value["role"] === "string" ? value["role"].trim().slice(0, 140) : "";
  const goal = typeof value["goal"] === "string" ? value["goal"].trim().slice(0, 1400) : "";
  const level = typeof value["level"] === "string" ? value["level"].trim().slice(0, 80) : "";
  const skills = typeof value["skills"] === "string" ? value["skills"].trim().slice(0, 900) : "";
  const hours = typeof value["hours"] === "number" ? Math.min(40, Math.max(1, Math.round(value["hours"]))) : 5;
  if (!role) throw new Error("Add a target role so your coaching can be tailored to it.");
  return { role, goal, level, skills, hours };
}

const FREE_TOKEN_LIMIT = 5000;

async function checkTokenAllowance(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("ai_usage_records")
    .select("input_tokens, output_tokens")
    .eq("user_id", userId);

  if (error) return; // Do not block if lookup fails unexpectedly

  const totalUsed = (data || []).reduce(
    (sum, row) => sum + (row.input_tokens || 0) + (row.output_tokens || 0),
    0
  );

  if (totalUsed >= FREE_TOKEN_LIMIT) {
    throw new Error(
      "TOKEN_LIMIT_REACHED: You have used all your free tokens. Upgrade to Polar Jobs Pro (₹100/mo) to continue."
    );
  }
}

async function recordTokenUsage(
  userId: string,
  feature: "roadmap" | "resume_review" | "job_match" | "interview_review" | "interview_question",
  inputTokens: number,
  outputTokens: number
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("ai_usage_records").insert({
    user_id: userId,
    feature,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  });
}

async function generate(request: Request, system: string, user: string) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI coaching is temporarily unavailable.");
  
  const call = createResponsesCall(
    request,
    { baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, model: "openai/gpt-6-astra" },
    [{ role: "user", content: user }],
    system,
  );
  
  const [text, usage] = await Promise.all([
    call.result.text,
    call.result.usage, // Vercel AI SDK provides promptTokens and completionTokens
  ]);

  if (!text.trim()) throw new Error("No coaching was generated. Please try again.");

  return {
    text,
    inputTokens: usage.promptTokens ?? 0,
    outputTokens: usage.completionTokens ?? 0,
  };
}

const roadmapFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateRequest)
  .handler(async ({ data, context }) => {
    await checkTokenAllowance(context.userId);

    const result = await generate(
      new Request("https://polar-jobs.local/roadmap", { method: "POST" }),
      "You are a practical, encouraging career coach. Generate a specific, realistic career roadmap. Return only valid JSON with an object containing a tasks array. Each task must have title (short), description (one useful sentence), category (one of Skill building, Portfolio, Networking, Interview prep, Career growth), week (integer from 1 to 4), day (integer from 1 to 7). Plan 4 weeks with exactly 7 daily tasks per week (28 tasks), sized to the weekly hours: Day 1 fundamentals, Day 2 skill drill, Day 3 hands-on build, Day 4 problem solving, Day 5 mock practice, Day 6 portfolio or networking, Day 7 review and plan ahead. No markdown fences.",
      JSON.stringify({ targetRole: data.role, experience: data.level, careerGoal: data.goal, availableHoursPerWeek: data.hours, currentSkills: data.skills }),
    );

    await recordTokenUsage(context.userId, "roadmap", result.inputTokens, result.outputTokens);

    let parsed: { tasks?: unknown };
    try { parsed = JSON.parse(result.text) as { tasks?: unknown }; } catch { throw new Error("Your roadmap could not be formatted. Please try generating it again."); }
    if (!Array.isArray(parsed.tasks) || parsed.tasks.length < 1) throw new Error("Your roadmap did not include any steps. Please try again.");
    const tasks = parsed.tasks.slice(0, 28).map((task, index) => {
      const row = task as Record<string, unknown>;
      const week = typeof row["week"] === "number" ? Math.min(4, Math.max(1, Math.round(row["week"]))) : Math.floor(index / 7) + 1;
      const day = typeof row["day"] === "number" ? Math.min(7, Math.max(1, Math.round(row["day"]))) : (index % 7) + 1;
      const rawTitle = typeof row["title"] === "string" ? row["title"].trim().replace(/^day\s*\d+\s*[:\-]?\s*/i, "") : `Career milestone ${index + 1}`;
      return {
        user_id: context.userId,
        title: `Day ${day}: ${rawTitle}`.slice(0, 140),
        description: typeof row["description"] === "string" ? row["description"].slice(0, 360) : "Take a focused step toward your next role.",
        category: typeof row["category"] === "string" ? row["category"].slice(0, 60) : "Career growth",
        week_number: week,
        sort_order: index,
      };
    });
    return { tasks };
  });

const resumeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Paste your resume and target role first.");
    const value = input as Record<string, unknown>;
    const resume = typeof value["resume"] === "string" ? value["resume"].trim().slice(0, 12000) : "";
    const role = typeof value["role"] === "string" ? value["role"].trim().slice(0, 140) : "";
    if (resume.length < 80 || !role) throw new Error("Add at least a few lines of resume text and your target role.");
    return { resume, role };
  })
  .handler(async ({ data, context }) => {
    await checkTokenAllowance(context.userId);
    const result = await generate(
      new Request("https://polar-jobs.local/resume", { method: "POST" }),
      "You are an expert resume coach. Review the provided resume for the named target role. Be specific and constructive. Organize the response into: Strong matches, Highest-impact improvements, and One rewritten example bullet. Do not invent candidate achievements or add qualifications not provided. Address the candidate directly.",
      `Target role: ${data.role}\n\nResume text:\n${data.resume}`,
    );
    await recordTokenUsage(context.userId, "resume_review", result.inputTokens, result.outputTokens);
    return result.text;
  });

const interviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Add your interview question and answer first.");
    const value = input as Record<string, unknown>;
    const question = typeof value["question"] === "string" ? value["question"].trim().slice(0, 800) : "";
    const answer = typeof value["answer"] === "string" ? value["answer"].trim().slice(0, 5000) : "";
    const role = typeof value["role"] === "string" ? value["role"].trim().slice(0, 140) : "";
    if (!question || answer.length < 20 || !role) throw new Error("Write a little more so your answer can be reviewed.");
    return { question, answer, role };
  })
  .handler(async ({ data, context }) => {
    await checkTokenAllowance(context.userId);
    const response = await generate(
      new Request("https://polar-jobs.local/interview", { method: "POST" }),
      'You are an empathetic but honest interview coach. Evaluate the answer for clarity, specificity, relevance, and evidence. Return only valid JSON with an integer score from 1 to 100 and a concise feedback field in markdown with two strengths and two concrete next steps. Do not invent details. No markdown fences.',
      JSON.stringify({ targetRole: data.role, question: data.question, answer: data.answer }),
    );
    await recordTokenUsage(context.userId, "interview_review", response.inputTokens, response.outputTokens);
    try {
      const parsed = JSON.parse(response) as { score?: unknown; feedback?: unknown };
      return {
        score: typeof parsed.score === "number" ? Math.min(100, Math.max(1, Math.round(parsed.score))) : 70,
        feedback: typeof parsed.feedback === "string" ? parsed.feedback.slice(0, 3000) : response.slice(0, 3000),
      };
    } catch {
      return { score: 70, feedback: response.slice(0, 3000) };
    }
  });

const interviewQuestionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Pick a question category first.");
    const value = input as Record<string, unknown>;
    const role = typeof value["role"] === "string" ? value["role"].trim().slice(0, 140) : "";
    const category = typeof value["category"] === "string" ? value["category"].trim().slice(0, 60) : "";
    if (!role) throw new Error("Add a target role so your practice questions fit it.");
    return { role, category };
  })
  .handler(async ({ data, context }) => {
    await checkTokenAllowance(context.userId);
    const response = await generate(
      new Request("https://polar-jobs.local/interview-question", { method: "POST" }),
      "You are an experienced interview coach. Generate ONE realistic interview question for the named target role in the named category. Make it specific to the role and something a real interviewer would ask. Return only valid JSON with an object containing: question (string), tip (one short sentence on what a strong answer demonstrates), and category (the category you used, one of Behavioral, Situational, Technical, Leadership, Culture fit). No markdown fences.",
      JSON.stringify({ targetRole: data.role, category: data.category || "Behavioral" }),
    );
    await recordTokenUsage(context.userId, "interview_question", response.inputTokens, response.outputTokens);
    let parsed: unknown;
    try { parsed = JSON.parse(response); } catch { parsed = null; }
    const value = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    const question = value && typeof value["question"] === "string" ? value["question"].trim().slice(0, 800) : "";
    if (!question) throw new Error("A fresh question couldn’t be generated. Please try again.");
    return {
      question,
      tip: value && typeof value["tip"] === "string" ? value["tip"].trim().slice(0, 240) : "",
      category: value && typeof value["category"] === "string" ? value["category"].trim().slice(0, 60) : "",
    };
  });

const jobDescriptionMatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Paste your resume and a job description first.");
    const value = input as Record<string, unknown>;
    const resume = typeof value["resume"] === "string" ? value["resume"].trim().slice(0, 12000) : "";
    const jobDescription = typeof value["jobDescription"] === "string" ? value["jobDescription"].trim().slice(0, 12000) : "";
    const role = typeof value["role"] === "string" ? value["role"].trim().slice(0, 140) : "";
    if (resume.length < 80 || jobDescription.length < 80) {
      throw new Error("Add at least a few lines to both your resume and the job description.");
    }
    return { resume, jobDescription, role };
  })
  .handler(async ({ data, context }) => {
    await checkTokenAllowance(context.userId);
    const response = await generate(
      new Request("https://polar-jobs.local/job-match", { method: "POST" }),
      "You are a careful ATS and recruiting analyst. Compare the resume only against the supplied job description. Estimate a 0–100 ATS match score based on demonstrated skills, relevant experience, and required qualifications; do not imply that you know a real ATS algorithm. Separate exact or close keyword matches from missing or not-evidenced terms. Prioritize genuinely important requirements, distinguish absent evidence from proven lack of experience, never invent candidate qualifications, and give actionable suggestions grounded in the resume. Return only valid JSON with an object containing: score (integer 0–100), summary (string), matchedKeywords (array of strings), missingKeywords (array of objects with keyword, priority [high|medium|low], evidence), experienceGaps (array of objects with requirement, resumeEvidence, nextStep), and recommendations (array of strings). No markdown fences.",
      JSON.stringify({ targetRole: data.role, resume: data.resume, jobDescription: data.jobDescription }),
    );
    await recordTokenUsage(context.userId, "job_match", response.inputTokens, response.outputTokens);
    let parsed: unknown;
    try { parsed = JSON.parse(response); } catch { throw new Error("The match report could not be formatted. Please scan again."); }
    return normalizeJobMatchResult(parsed);
  });

export const generateCareerRoadmap = roadmapFn;
export const reviewResume = resumeFn;
export const reviewInterviewAnswer = interviewFn;
export const generateInterviewQuestion = interviewQuestionFn;
export const matchJobDescription = jobDescriptionMatchFn;
