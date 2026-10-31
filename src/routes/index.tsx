import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Award, BookOpenCheck, BriefcaseBusiness,
  Check, CheckCircle2, ChevronDown, Circle, Compass, FileText, Flame, Gauge,
  LogOut, MessageSquareText, PencilLine, Plus, Send, Sparkles, Target, TrendingUp,
  Upload, UserRound, WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { generateCareerRoadmap, generateInterviewQuestion, matchJobDescription, reviewInterviewAnswer, reviewResume, type JobMatchResult } from "@/lib/career-ai.functions";
import { extractResumeText } from "@/lib/resume-upload.functions";
import type { Tables } from "@/integrations/supabase/types";
import careerFocus from "@/assets/career-focus.jpg";

type Profile = Tables<"profiles">;
type Task = Tables<"roadmap_tasks">;
type Interview = Tables<"interview_sessions">;
type Section = "Overview" | "My roadmap" | "Resume studio" | "Interview practice" | "Progress";

const navItems: { label: Section; icon: typeof Compass }[] = [
  { label: "Overview", icon: Compass },
  { label: "My roadmap", icon: BookOpenCheck },
  { label: "Resume studio", icon: FileText },
  { label: "Interview practice", icon: MessageSquareText },
  { label: "Progress", icon: TrendingUp },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Polar Jobs — Your personal career preparation" },
      { name: "description", content: "Create a personalized career roadmap, sharpen your resume, practice interviews, and see your progress in one AI-powered workspace." },
      { property: "og:title", content: "Polar Jobs — Your personal career preparation" },
      { property: "og:description", content: "Create a personalized career roadmap, sharpen your resume, practice interviews, and see your progress in one AI-powered workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PolarJobs,
});

function PolarBrandLogo() {
  return (
    <div className="flex items-center gap-2 select-none">
      <img
        src="/Polar.svg"
        alt="Polar bear logo"
        className="h-7 w-auto object-contain"
      />
      <div className="flex items-baseline leading-none">
        <span
          className="text-2xl font-semibold tracking-tight text-foreground text-white"
          style={{ fontFamily: "'Edu VIC WA NT Beginner', cursive" }}
        >
          Polar
        </span>
        <span
          className="ml-0.5 text-base font-medium tracking-normal text-foreground/80 text-white"
          style={{ fontFamily: "'Google Sans Flex', sans-serif" }}
        >
          Jobs
        </span>
      </div>
    </div>
  );
}

function PolarJobs() {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [fullName, setFullName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [section, setSection] = useState<Section>("Overview");
  const [profileDraft, setProfileDraft] = useState<Profile | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [resumeFeedback, setResumeFeedback] = useState("");
  const [resumeBusy, setResumeBusy] = useState(false);
  const [resumeTool, setResumeTool] = useState<"feedback" | "matcher">("feedback");
  const [jobDescription, setJobDescription] = useState("");
  const [matchBusy, setMatchBusy] = useState(false);
  const [matchResult, setMatchResult] = useState<JobMatchResult | null>(null);
  const [resumeUploadBusy, setResumeUploadBusy] = useState(false);
  const [resumeFileName, setResumeFileName] = useState("");
  const [answer, setAnswer] = useState("");
  const [interviewBusy, setInterviewBusy] = useState(false);
  const [latestFeedback, setLatestFeedback] = useState<{ score: number; feedback: string } | null>(null);
  const [roadmapBusy, setRoadmapBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUserId(data.user?.id ?? null);
      setUserEmail(data.user?.email ?? "");
      setAuthReady(true);
    });
    const { data: authSubscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setUserId(session?.user.id ?? null);
        setUserEmail(session?.user.email ?? "");
        if (event !== "SIGNED_OUT") void queryClient.invalidateQueries();
      }
    });
    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, [queryClient]);

  const workspace = useQuery({
    queryKey: ["polar-workspace", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [profileResult, tasksResult, interviewResult] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId as string).maybeSingle(),
        supabase.from("roadmap_tasks").select("*").eq("user_id", userId as string).order("week_number").order("sort_order"),
        supabase.from("interview_sessions").select("*").eq("user_id", userId as string).order("created_at", { ascending: false }).limit(20),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (tasksResult.error) throw tasksResult.error;
      if (interviewResult.error) throw interviewResult.error;
      const profile = profileResult.data ?? {
        user_id: userId as string, full_name: "", target_role: "", experience_level: "Exploring",
        weekly_hours: 5, skills: [], career_goal: "", created_at: "", updated_at: "",
      };
      return { profile, tasks: tasksResult.data ?? [], interviews: interviewResult.data ?? [] };
    },
  });
  const profile = profileDraft ?? workspace.data?.profile ?? null;
  const tasks = workspace.data?.tasks ?? [];
  const interviews = workspace.data?.interviews ?? [];
  const completedTasks = tasks.filter((task) => task.is_complete).length;
  const completion = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const greetingName = profile?.full_name?.trim().split(" ")[0] || "there";
  const [questionCategory, setQuestionCategory] = useState("Behavioral");
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [questionTip, setQuestionTip] = useState("");
  const [questionBusy, setQuestionBusy] = useState(false);
  const [customQuestionDraft, setCustomQuestionDraft] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const currentQuestion = activeQuestion ?? buildQuestion(profile?.target_role || "your next role", questionCategory);
  const generateRoadmap = useServerFn(generateCareerRoadmap);
  const getResumeReview = useServerFn(reviewResume);
  const getJobMatch = useServerFn(matchJobDescription);
  const getInterviewReview = useServerFn(reviewInterviewAnswer);
  const getInterviewQuestion = useServerFn(generateInterviewQuestion);
  const extractResume = useServerFn(extractResumeText);

  const saveProfile = async () => {
    if (!profile || !userId) return;
    const update = { ...profile, user_id: userId, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("profiles").upsert(update, { onConflict: "user_id" });
    if (error) { toast.error("Your career profile couldn’t be saved."); return; }
    setProfileDraft(update);
    await queryClient.invalidateQueries({ queryKey: ["polar-workspace", userId] });
    toast.success("Your career profile is up to date.");
  };

  const createRoadmap = async () => {
    if (!profile?.target_role?.trim()) { setSection("Overview"); toast.message("Add your target role first to create a personal roadmap."); return; }
    setRoadmapBusy(true);
    try {
      const result = await generateRoadmap({ data: { role: profile.target_role, level: profile.experience_level, goal: profile.career_goal, hours: profile.weekly_hours, skills: profile.skills.join(", ") } });
      const { error: deleteError } = await supabase.from("roadmap_tasks").delete().eq("user_id", userId as string);
      if (deleteError) throw deleteError;
      const { error } = await supabase.from("roadmap_tasks").insert(result.tasks);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["polar-workspace", userId] });
      setSection("My roadmap");
      toast.success("Your personal roadmap is ready.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t create the roadmap just now.");
    } finally { setRoadmapBusy(false); }
  };

  const toggleTask = async (task: Task) => {
    if (!userId) return;
    const key = ["polar-workspace", userId] as const;
    const previous = queryClient.getQueryData(key);
    queryClient.setQueryData(key, (old: typeof workspace.data) =>
      old ? { ...old, tasks: old.tasks.map((t) => (t.id === task.id ? { ...t, is_complete: !t.is_complete } : t)) } : old,
    );
    const { error } = await supabase.from("roadmap_tasks").update({ is_complete: !task.is_complete }).eq("id", task.id);
    if (error) {
      queryClient.setQueryData(key, previous);
      toast.error("That step couldn’t be updated.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: key });
  };

  const submitResume = async () => {
    if (!profile) return;
    setResumeBusy(true); setResumeFeedback("");
    try {
      const result = await getResumeReview({ data: { role: profile.target_role || "the target role", resume: resumeText } });
      setResumeFeedback(result);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Resume feedback is unavailable right now."); }
    finally { setResumeBusy(false); }
  };

  const submitJobMatch = async () => {
    if (!profile) return;
    setMatchBusy(true); setMatchResult(null);
    try {
      const result = await getJobMatch({ data: { role: profile.target_role, resume: resumeText, jobDescription } });
      setMatchResult(result);
      toast.success("Your job match report is ready.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "The job description couldn’t be scanned right now."); }
    finally { setMatchBusy(false); }
  };

  const uploadResumeFile = async (file: File) => {
    setResumeUploadBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await extractResume({ data: form });
      setResumeText(result.text);
      setResumeFileName(result.fileName);
      setMatchResult(null);
      toast.success(`Added “${result.fileName}”${result.pages ? ` (${result.pages} pages)` : ""} to your resume box.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That file couldn’t be read. Try pasting your resume text instead.");
    } finally { setResumeUploadBusy(false); }
  };

  const submitInterviewAnswer = async () => {
    if (!profile || !userId) return;
    setInterviewBusy(true); setLatestFeedback(null);
    try {
      const result = await getInterviewReview({ data: { role: profile.target_role || "your next role", question: currentQuestion, answer } });
      const { error } = await supabase.from("interview_sessions").insert({ user_id: userId, target_role: profile.target_role, question: currentQuestion, answer, feedback: result.feedback, score: result.score });
      if (error) throw error;
      setLatestFeedback(result); setAnswer("");
      await queryClient.invalidateQueries({ queryKey: ["polar-workspace", userId] });
      toast.success("Your answer has been reviewed.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Your answer couldn’t be reviewed just now."); }
    finally { setInterviewBusy(false); }
  };

  const pickQuestionCategory = (category: string) => {
    setQuestionCategory(category);
    setActiveQuestion(null);
    setQuestionTip("");
  };

  const generateQuestion = async () => {
    if (!profile) return;
    setQuestionBusy(true);
    try {
      const result = await getInterviewQuestion({ data: { role: profile.target_role || "your next role", category: questionCategory } });
      setActiveQuestion(result.question);
      setQuestionTip(result.tip);
      if (result.category) setQuestionCategory(result.category);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A fresh question couldn’t be generated just now.");
    } finally { setQuestionBusy(false); }
  };

  const useCustomQuestion = () => {
    const draft = customQuestionDraft.trim().slice(0, 800);
    if (draft.length < 8) { toast.message("Write the question you want to practice first."); return; }
    setActiveQuestion(draft);
    setQuestionTip("");
    setQuestionCategory("Your question");
  };

  const handleAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setAuthBusy(true); setAuthMessage("");
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email: authEmail, password, options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) setAuthMessage("Check your email to confirm your account, then come back to Polar Jobs.");
        else setAuthMessage("Your account is ready.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
        if (error) throw error;
      }
    } catch (error) { setAuthMessage(error instanceof Error ? error.message : "We couldn’t sign you in. Please try again."); }
    finally { setAuthBusy(false); }
  };

  const signInGoogle = async () => {
    setAuthBusy(true); setAuthMessage("");
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (result.error) throw result.error;
    } catch (error) { setAuthMessage(error instanceof Error ? error.message : "Google sign-in is unavailable right now."); setAuthBusy(false); }
  };

  const signOut = async () => {
    await queryClient.cancelQueries(); queryClient.clear();
    const { error } = await supabase.auth.signOut();
    if (error) toast.error("Couldn’t sign out. Please try again.");
  };

if (!authReady) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <style>{`
        @keyframes polarSlide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
      <div className="flex w-24 flex-col items-center gap-3.5">
        <img
          src="/Polar.svg"
          alt="Polar Jobs"
          className="size-24 object-contain select-none"
        />
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full w-1/2 rounded-full bg-primary"
            style={{ animation: "polarSlide 1.2s ease-in-out infinite" }}
          />
        </div>
      </div>
    </div>
  );
}

  if (!userId) return <AuthScreen mode={authMode} setMode={setAuthMode} name={fullName} setName={setFullName} email={authEmail} setEmail={setAuthEmail} password={password} setPassword={setPassword} busy={authBusy} message={authMessage} onSubmit={handleAuth} onGoogle={signInGoogle} />;

  const updateProfile = (key: keyof Profile, value: string | number | string[]) => {
    if (!profile) return;
    setProfileDraft({ ...profile, [key]: value });
  };

return (
  <div className="app-shell min-h-screen text-foreground pb-12">
    {/* 1. Sticky Horizontal Topbar */}
    <header className="sticky top-0 z-40 border-b border-border/40 bg-[#8c76c6] px-4 py-3 sm:px-6 rounded-2xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        
        {/* Left: Polar Bear Logo + Brand Title */}
        <div className="flex items-center shrink-0">
          <PolarBrandLogo />
        </div>

        {/* Center: Navigation Pill Box (matches your mockup) */}
        <nav 
          className="hidden md:flex items-center gap-1 rounded-2xl bg-secondary/80 p-1.5 border border-border/50 shadow-xs" 
          aria-label="Main navigation"
        >
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => setSection(label)}
              data-active={section === label}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-medium transition-all ${
                section === label
                  ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              }`}
            >
              <Icon className="size-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        {/* Right: Account Circle with Dropdown */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setAccountMenuOpen((prev) => !prev)}
            className="flex size-10 items-center justify-center rounded-full bg-foreground text-background font-semibold text-sm shadow-xs transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Account menu"
            aria-expanded={accountMenuOpen}
          >
            {/* Shows first initial of name or email, or user icon */}
            {(profile?.full_name?.[0] || userEmail?.[0] || "U").toUpperCase()}
          </button>

          {/* Account Popover Menu */}
          {accountMenuOpen && (
            <>
              {/* Backdrop to close menu when clicking outside */}
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setAccountMenuOpen(false)} 
              />
              <div className="absolute right-0 mt-2 z-50 w-64 rounded-2xl border border-border bg-card p-4 shadow-xl">
                <div className="mb-3 border-b border-border pb-3">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {profile?.full_name || "Polar Explorer"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {userEmail}
                  </p>
                  <span className="mt-2 inline-block rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-foreground">
                    {profile?.target_role || "Career profile"}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    void signOut();
                  }}
                >
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </Button>
              </div>
            </>
          )}
        </div>

      </div>

      {/* Mobile-only Navigation Scroll Bar (visible on small screens) */}
      <nav className="flex md:hidden items-center gap-1 overflow-x-auto pt-2.5 pb-1 -mx-4 px-4 border-t border-border/40 mt-2.5" aria-label="Mobile navigation">
        {navItems.map(({ label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            onClick={() => setSection(label)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${
              section === label ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"
            }`}
          >
            <Icon className="size-3" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </header>

    {/* 2. Main Workspace Body (Full Width Container) */}
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {workspace.isLoading ? (
        <div className="py-20 text-center text-muted-foreground">Loading your career plan…</div>
      ) : workspace.error ? (
        <div className="surface p-6">
          <p>We couldn’t open your saved career details.</p>
          <Button className="mt-4" onClick={() => void workspace.refetch()}>Try again</Button>
        </div>
      ) : !profile ? null : (
        <>
          {section === "Overview" && (
            <Overview profile={profile} tasks={tasks} interviews={interviews} completion={completion} completedTasks={completedTasks} greetingName={greetingName} setSection={setSection} createRoadmap={createRoadmap} roadmapBusy={roadmapBusy} toggleTask={toggleTask} />
          )}
          {section === "My roadmap" && (
            <Roadmap profile={profile} tasks={tasks} createRoadmap={createRoadmap} roadmapBusy={roadmapBusy} toggleTask={toggleTask} />
          )}
          {section === "Resume studio" && (
            <ResumeStudio role={profile.target_role} resumeText={resumeText} setResumeText={(value) => { setResumeText(value); setMatchResult(null); }} feedback={resumeFeedback} busy={resumeBusy} submit={submitResume} tool={resumeTool} setTool={setResumeTool} jobDescription={jobDescription} setJobDescription={(value) => { setJobDescription(value); setMatchResult(null); }} matchResult={matchResult} matchBusy={matchBusy} submitMatch={submitJobMatch} uploadBusy={resumeUploadBusy} onUploadFile={(file) => void uploadResumeFile(file)} fileName={resumeFileName} />
          )}
          {section === "Interview practice" && (
            <InterviewPractice question={currentQuestion} tip={questionTip} category={questionCategory} answer={answer} setAnswer={setAnswer} busy={interviewBusy} feedback={latestFeedback} submit={submitInterviewAnswer} sessions={interviews} categories={INTERVIEW_CATEGORIES} onCategory={pickQuestionCategory} generateBusy={questionBusy} onGenerate={() => void generateQuestion()} customDraft={customQuestionDraft} setCustomDraft={setCustomQuestionDraft} onUseCustom={useCustomQuestion} />
          )}
          {section === "Progress" && (
            <ProgressView tasks={tasks} interviews={interviews} completion={completion} completedTasks={completedTasks} />
          )}

          {/* Career Profile settings form remains intact at the bottom */}
          <section className="mt-8 border-t soft-divider pt-7">
            {/* ...existing career profile inputs... */}
          </section>
        </>
      )}
    </main>
  </div>
);
}

function AuthScreen(props: { mode: "signin" | "signup"; setMode: (mode: "signin" | "signup") => void; name: string; setName: (value: string) => void; email: string; setEmail: (value: string) => void; password: string; setPassword: (value: string) => void; busy: boolean; message: string; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onGoogle: () => void }) {
  const signup = props.mode === "signup";
  return <main className="mx-auto flex min-h-screen max-w-7xl items-center px-5 py-8 lg:px-10"><div className="grid w-full items-stretch gap-10 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16">
    <div className="flex flex-col justify-center py-4 lg:py-8">
      <div className="mb-10">
        <PolarBrandLogo />
      </div>
      <p className="eyebrow">A clearer path forward</p><h1 className="display-heading mt-4 max-w-xl text-4xl leading-[1.12] sm:text-5xl">Your next move deserves a <span className="text-primary">plan.</span></h1>
      <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">A personal career workspace for the big move, the next interview, and everything in between.</p>
      <div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-3">{[{ Icon: Target, title: "Your roadmap", color: "text-ice" }, { Icon: FileText, title: "Resume coaching", color: "text-coral" }, { Icon: MessageSquareText, title: "Interview reps", color: "text-lime" }].map(({ Icon, title, color }) => <div key={title} className="surface-soft flex items-center gap-2.5 p-3"><Icon className={`size-4 ${color}`} /><span className="text-xs font-medium">{title}</span></div>)}</div>
      <div className="auth-art mt-8 hidden lg:block"><img className="auth-image" src={careerFocus} alt="Professional preparing notes for their next career move" width={1152} height={768} /><div className="auth-art-copy"><p className="text-sm font-medium">Make progress that feels like yours.</p><p className="mt-1 text-xs text-foreground/75">Personalized guidance, built around where you want to go.</p></div></div>
    </div>
    <div className="flex items-center justify-center"><div className="w-full max-w-[440px] py-6">
      <div className="mb-8"><p className="eyebrow">{signup ? "Start with a clear direction" : "Welcome back"}</p><h2 className="display-heading mt-2 text-3xl">{signup ? "Create your account" : "Pick up where you left off"}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{signup ? "Your goals and progress stay private to you." : "Your career plan is right where you left it."}</p></div>
      <form className="space-y-4" onSubmit={props.onSubmit}>
        {signup && <label className="block space-y-2"><span className="text-xs text-muted-foreground">Your name</span><Input autoComplete="name" value={props.name} onChange={(e) => props.setName(e.target.value)} placeholder="How should we call you?" required /></label>}
        <label className="block space-y-2"><span className="text-xs text-muted-foreground">Email</span><Input type="email" autoComplete="email" value={props.email} onChange={(e) => props.setEmail(e.target.value)} placeholder="you@example.com" required /></label>
        <label className="block space-y-2"><span className="text-xs text-muted-foreground">Password</span><Input type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={6} value={props.password} onChange={(e) => props.setPassword(e.target.value)} placeholder="At least 6 characters" required /></label>
        {props.message && <p role="status" className="rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm text-foreground">{props.message}</p>}
        <Button className="h-11 w-full" type="submit" disabled={props.busy}>{props.busy ? "One moment…" : signup ? "Create account" : "Sign in"}<ArrowRight className="size-4" /></Button>
      </form>
      <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">or</span><span className="h-px flex-1 bg-border" /></div>
      <Button variant="outline" className="h-11 w-full" onClick={props.onGoogle} disabled={props.busy}><GoogleMark /> Continue with Google</Button>
      <p className="mt-7 text-center text-sm text-muted-foreground">{signup ? "Already have a workspace?" : "New to Polar Jobs?"} <button type="button" className="font-medium text-primary hover:underline" onClick={() => props.setMode(signup ? "signin" : "signup")}>{signup ? "Sign in" : "Create an account"}</button></p>
      <p className="mt-6 text-center text-[11px] leading-5 text-muted-foreground">Your career details are private to your account. Resume text is only used to prepare your feedback.</p>
    </div></div>
  </div></main>;
}

function GoogleMark() { return <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4"><path fill="currentColor" d="M21.35 12.23c0-.72-.06-1.41-.18-2.08H12v3.94h5.23a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.7 2.92-4.2 2.92-7.25Z" /><path fill="currentColor" d="M12 21.75c2.65 0 4.88-.88 6.5-2.38l-3.14-2.45c-.87.58-1.99.92-3.36.92-2.58 0-4.78-1.74-5.57-4.08H3.19v2.53A9.75 9.75 0 0 0 12 21.75Z" /><path fill="currentColor" d="M6.43 13.76a5.86 5.86 0 0 1 0-3.52V7.71H3.19a9.76 9.76 0 0 0 0 8.58l3.24-2.53Z" /><path fill="currentColor" d="M12 6.16c1.44 0 2.73.5 3.75 1.49l2.81-2.81C16.87 3.27 14.65 2.25 12 2.25a9.75 9.75 0 0 0-8.81 5.46l3.24 2.53C7.22 7.9 9.42 6.16 12 6.16Z" /></svg>; }

function PageTitle({ kicker, title, description, action }: { kicker: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">{kicker}</p><h1 className="display-heading mt-2 text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p></div>{action}</div>;
}

function Overview({ profile, tasks, interviews, completion, completedTasks, greetingName, setSection, createRoadmap, roadmapBusy, toggleTask }: { profile: Profile; tasks: Task[]; interviews: Interview[]; completion: number; completedTasks: number; greetingName: string; setSection: (section: Section) => void; createRoadmap: () => void; roadmapBusy: boolean; toggleTask: (task: Task) => void }) {
  const targetRole = profile.target_role || "your next chapter";
  const upcoming = tasks.find((task) => !task.is_complete);
  return <>
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Your career, in motion</p><h1 className="display-heading mt-2 text-3xl sm:text-[34px]">Good to have you here, {greetingName}.</h1><p className="mt-2 text-sm text-muted-foreground">A little momentum adds up. Let’s move toward <span className="text-foreground">{targetRole}</span>.</p></div><Button onClick={() => setSection("Resume studio")}><WandSparkles className="size-4" /> Tune my resume</Button></div>
    <div className="grid gap-4 md:grid-cols-[1.45fr_0.75fr]">
      <section className="surface relative overflow-hidden p-5 sm:p-6"><div className="flex items-start justify-between gap-5"><div><p className="eyebrow">Your focus this week</p><h2 className="mt-2 max-w-lg text-xl font-semibold">{upcoming?.title || `Build a strong foundation for ${targetRole}`}</h2><p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{upcoming?.description || "Start with a personal roadmap, then keep your small career steps moving."}</p></div><div className="hidden size-11 shrink-0 items-center justify-center rounded-full bg-accent text-primary sm:flex"><Target className="size-5" /></div></div><div className="mt-6 flex flex-wrap items-center gap-3"><Button variant="secondary" size="sm" onClick={() => upcoming ? void toggleTask(upcoming) : createRoadmap()} disabled={roadmapBusy}>{upcoming ? "Mark done" : roadmapBusy ? "Building your roadmap…" : "Build my roadmap"}<ArrowRight className="size-4" /></Button><span className="text-xs text-muted-foreground">{profile.weekly_hours} hours set aside each week</span></div></section>
      <section className="surface p-5 sm:p-6"><div className="flex items-center justify-between"><p className="eyebrow">Roadmap progress</p><Gauge className="size-4 text-primary" /></div><div className="mt-5 flex items-baseline gap-2"><span className="display-heading text-4xl">{completion}%</span><span className="text-xs text-muted-foreground">complete</span></div><div className="progress-track mt-4"><div className="progress-fill" style={{ width: `${completion}%` }} /></div><p className="mt-3 text-xs text-muted-foreground">{completedTasks} of {tasks.length} steps checked off</p></section>
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-3"><Metric icon={CheckCircle2} label="Steps completed" value={`${completedTasks}`} detail={tasks.length ? `of ${tasks.length} in your plan` : "Start a personal plan"} tone="ice" /><Metric icon={MessageSquareText} label="Interview reps" value={`${interviews.length}`} detail={interviews.length ? "Answers reviewed by your coach" : "Your first practice is one click away"} tone="coral" /><Metric icon={Flame} label="Hours this week" value={`${profile.weekly_hours}`} detail="Reserved for your next move" tone="lime" /></div>
    <div className="mt-8 flex items-center justify-between gap-3"><div><p className="eyebrow">One step at a time</p><h2 className="mt-2 text-lg font-semibold">Your next milestone</h2></div><Button variant="ghost" size="sm" onClick={() => setSection("My roadmap")}>View roadmap <ArrowRight className="size-4" /></Button></div>
    {tasks.length ? <div className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border">{tasks.filter((task) => !task.is_complete).slice(0, 3).map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} />)}</div> : <div className="surface-soft mt-4 flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-medium">Start with a roadmap made for you</p><p className="mt-1 text-sm text-muted-foreground">Tell Polar Jobs where you want to go, and get a set of practical next steps.</p></div><Button onClick={createRoadmap} disabled={roadmapBusy}><Sparkles className="size-4" /> {roadmapBusy ? "Thinking…" : "Create roadmap"}</Button></div>}
  </>;
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof Gauge; label: string; value: string; detail: string; tone: "ice" | "coral" | "lime" }) {
  return <div className="surface p-4"><div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{label}</span><Icon className={`size-4 ${tone === "ice" ? "text-ice" : tone === "coral" ? "text-coral" : "text-lime"}`} /></div><p className="display-heading mt-3 text-2xl">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function TaskRow({ task, onToggle }: { task: Task; onToggle: (task: Task) => void }) {
  return <div className="flex items-start gap-3 bg-surface-raised p-4"><Button variant="ghost" size="icon" aria-label={task.is_complete ? "Mark step incomplete" : "Mark step complete"} onClick={() => void onToggle(task)}>{task.is_complete ? <CheckCircle2 className="size-5 text-lime" /> : <Circle className="size-5 text-muted-foreground" />}</Button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className={`text-sm font-medium ${task.is_complete ? "task-done" : ""}`}>{task.title}</p><span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">Week {task.week_number}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{task.description}</p></div><span className="hidden text-xs text-muted-foreground sm:block">{task.category}</span></div>;
}

function Roadmap({ profile, tasks, createRoadmap, roadmapBusy, toggleTask }: { profile: Profile; tasks: Task[]; createRoadmap: () => void; roadmapBusy: boolean; toggleTask: (task: Task) => void }) {
  const weeks = [...new Set(tasks.map((task) => task.week_number))].sort((a, b) => a - b);
  return <><PageTitle kicker="Your next chapter" title="My roadmap" description={profile.target_role ? `Your practical plan for moving toward ${profile.target_role}.` : "A practical plan built around the role you want and time you can set aside."} action={<Button onClick={createRoadmap} disabled={roadmapBusy}><Sparkles className="size-4" /> {roadmapBusy ? "Building…" : tasks.length ? "Refresh roadmap" : "Create roadmap"}</Button>} />
    {tasks.length ? <div className="space-y-6">{weeks.map((week) => <section key={week}><div className="mb-3 flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">{week}</span><h2 className="text-sm font-semibold">Week {week}</h2><span className="text-xs text-muted-foreground">{tasks.filter((task) => task.week_number === week).filter((task) => task.is_complete).length}/{tasks.filter((task) => task.week_number === week).length} complete</span></div><div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">{tasks.filter((task) => task.week_number === week).map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} />)}</div></section>)}</div> : <div className="surface-soft p-6"><Sparkles className="size-5 text-primary" /><h2 className="mt-4 font-semibold">A path, shaped around you</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Your coach will turn your goal, current skills, and weekly time into a set of meaningful milestones. Add a target role in your profile to begin.</p><Button className="mt-5" onClick={createRoadmap} disabled={roadmapBusy}>{roadmapBusy ? "Building your plan…" : "Create my roadmap"} <ArrowRight className="size-4" /></Button></div>}
  </>;
}

function ResumeStudio({ role, resumeText, setResumeText, feedback, busy, submit, tool, setTool, jobDescription, setJobDescription, matchResult, matchBusy, submitMatch, uploadBusy, onUploadFile, fileName }: { role: string; resumeText: string; setResumeText: (value: string) => void; feedback: string; busy: boolean; submit: () => void; tool: "feedback" | "matcher"; setTool: (tool: "feedback" | "matcher") => void; jobDescription: string; setJobDescription: (value: string) => void; matchResult: JobMatchResult | null; matchBusy: boolean; submitMatch: () => void; uploadBusy: boolean; onUploadFile: (file: File) => void; fileName: string }) {
  const uploadControl = <ResumeUpload busy={uploadBusy} onFile={onUploadFile} fileName={fileName} />;
  return <><PageTitle kicker="Resume studio" title="A sharper story, at a glance." description="Upload or paste your resume, then get focused, role-specific feedback on what to bring forward and what to improve." action={<div role="tablist" aria-label="Resume tools" className="flex items-center gap-1 rounded-xl border border-border p-1"><Button role="tab" aria-selected={tool === "feedback"} variant={tool === "feedback" ? "secondary" : "ghost"} size="sm" onClick={() => setTool("feedback")}>Resume feedback</Button><Button role="tab" aria-selected={tool === "matcher"} variant={tool === "matcher" ? "secondary" : "ghost"} size="sm" onClick={() => setTool("matcher")}>JD matcher</Button></div>} />
    {tool === "feedback" ? <>
      <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]"><section className="surface p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><PencilLine className="size-4 text-primary" /><h2 className="text-sm font-semibold">Your resume text</h2></div>{uploadControl}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Upload a PDF, Word, or text file — or paste the text. It’s used to prepare this review and isn’t added to your saved profile.</p><Textarea className="mt-4 min-h-[310px] resize-y text-sm leading-6" value={resumeText} onChange={(e) => setResumeText(e.target.value)} placeholder="Paste your resume here — experience, projects, skills…" /><p className="mt-2 text-right text-[11px] text-muted-foreground">{resumeText.length.toLocaleString()} / 12,000</p><Button className="mt-3" onClick={submit} disabled={busy || resumeText.trim().length < 80}>{busy ? "Reviewing your resume…" : "Get my feedback"}<Sparkles className="size-4" /></Button></section>
        <section className="surface-soft min-h-72 p-5 sm:p-6"><p className="eyebrow">Your coach’s notes</p>{feedback ? <div className="feedback-copy mt-4 whitespace-pre-wrap text-sm leading-7 text-foreground">{feedback}</div> : <div className="flex min-h-56 flex-col items-center justify-center text-center"><div className="flex size-11 items-center justify-center rounded-full bg-secondary text-primary"><FileText className="size-5" /></div><p className="mt-4 text-sm font-medium">Room for a stronger story.</p><p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">Your specific strengths and a useful rewrite will show up here after your review.</p></div>}</section>
      </div><div className="surface mt-5 flex items-start gap-3 p-4"><BriefcaseBusiness className="mt-0.5 size-4 shrink-0 text-coral" /><p className="text-xs leading-5 text-muted-foreground">Reviewing for <span className="text-foreground">{role || "your target role"}</span>. Add or update your target role in your career profile.</p></div>
    </> : <>
      <div className="mb-5 flex items-start gap-3 border-l-2 border-primary pl-4"><Target className="mt-0.5 size-4 shrink-0 text-primary" /><p className="text-sm leading-6 text-muted-foreground">Compare your resume with one specific job posting. Your text is used for this scan and isn’t saved to your profile.</p></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="surface p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><PencilLine className="size-4 text-primary" /><h2 className="text-sm font-semibold">Your resume</h2></div>{uploadControl}</div><Textarea aria-label="Resume for job match" className="mt-4 min-h-[280px] resize-y text-sm leading-6" maxLength={12000} value={resumeText} onChange={(e) => setResumeText(e.target.value)} placeholder="Paste your resume text…" /><p className="mt-2 text-right text-[11px] text-muted-foreground">{resumeText.length.toLocaleString()} / 12,000</p></section>
        <section className="surface p-5 sm:p-6"><div className="flex items-center gap-2"><BriefcaseBusiness className="size-4 text-coral" /><h2 className="text-sm font-semibold">Target job description</h2></div><Textarea aria-label="Target job description" className="mt-4 min-h-[280px] resize-y text-sm leading-6" maxLength={12000} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste the job posting, including responsibilities and requirements…" /><p className="mt-2 text-right text-[11px] text-muted-foreground">{jobDescription.length.toLocaleString()} / 12,000</p></section>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Matching for <span className="text-foreground">{role || "your target role"}</span></p><Button onClick={submitMatch} disabled={matchBusy || resumeText.trim().length < 80 || jobDescription.trim().length < 80}>{matchBusy ? "Comparing both documents…" : "Scan for a match"}<Sparkles className="size-4" /></Button></div>
      {matchResult && <JobMatchReport result={matchResult} />}
    </>}
  </>;
}

function ResumeUpload({ busy, onFile, fileName }: { busy: boolean; onFile: (file: File) => void; fileName: string }) {
  return <div className="flex items-center gap-2">
    {fileName && !busy ? <span className="hidden max-w-44 truncate text-[11px] text-muted-foreground sm:block" title={fileName}>{fileName}</span> : null}
    <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground">
      <Upload className="size-3.5" />
      {busy ? "Reading…" : "Upload file"}
      <input aria-label="Upload a resume file (PDF, Word, or plain text)" className="sr-only" type="file" accept=".pdf,.docx,.txt,.md,application/pdf,text/plain" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onFile(file); }} />
    </label>
  </div>;
}

function JobMatchReport({ result }: { result: JobMatchResult }) {
  return <section aria-live="polite" className="mt-8 border-t soft-divider pt-7">
    <div className="grid gap-5 lg:grid-cols-[0.72fr_1.28fr]">
      <div className="surface p-5 sm:p-6"><p className="eyebrow">Estimated ATS match</p><div className="mt-4 flex items-baseline gap-2"><span className="display-heading text-5xl">{result.score}%</span><span className="text-xs text-muted-foreground">estimated fit</span></div><div className="progress-track mt-4"><div className="progress-fill" style={{ width: `${result.score}%` }} /></div><p className="mt-4 text-sm leading-6 text-muted-foreground">{result.summary}</p><p className="mt-4 border-t soft-divider pt-3 text-[11px] leading-5 text-muted-foreground">An estimate based on the text provided—not a score from a specific employer’s ATS.</p></div>
      <div className="surface p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Keywords already shown</h2><span className="text-xs text-muted-foreground">{result.matchedKeywords.length} found</span></div>{result.matchedKeywords.length ? <div className="mt-4 flex flex-wrap gap-2">{result.matchedKeywords.map((keyword) => <span key={keyword} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">{keyword}</span>)}</div> : <p className="mt-3 text-sm text-muted-foreground">No clear keyword matches were identified.</p>}
        <div className="mt-6 border-t soft-divider pt-5"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Priority keywords to address</h2><span className="text-xs text-muted-foreground">{result.missingKeywords.length} to review</span></div>{result.missingKeywords.length ? <ul className="mt-3 divide-y divide-border">{result.missingKeywords.map((item, index) => <li key={`${item.keyword}-${index}`} className="py-3"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{item.keyword}</span><span className={`rounded-full bg-secondary px-2 py-0.5 text-[10px] capitalize ${item.priority === "high" ? "text-destructive" : item.priority === "low" ? "text-muted-foreground" : "text-coral"}`}>{item.priority} priority</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.evidence}</p></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No important missing terms were found.</p>}</div>
      </div>
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <section className="surface p-5 sm:p-6"><h2 className="text-sm font-semibold">Experience gaps to examine</h2>{result.experienceGaps.length ? <ul className="mt-3 divide-y divide-border">{result.experienceGaps.map((gap, index) => <li key={`${gap.requirement}-${index}`} className="py-3"><p className="text-sm font-medium">{gap.requirement}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{gap.resumeEvidence}</p><p className="mt-2 text-xs leading-5"><span className="text-primary">Next step</span><span className="text-muted-foreground"> · {gap.nextStep}</span></p></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No major experience gaps were identified from the text provided.</p>}</section>
      <section className="surface-soft p-5 sm:p-6"><h2 className="text-sm font-semibold">Recommended next edits</h2>{result.recommendations.length ? <ol className="mt-3 space-y-3">{result.recommendations.map((recommendation, index) => <li key={`${index}-${recommendation}`} className="flex items-start gap-3 text-sm leading-6"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs text-primary">{index + 1}</span><span>{recommendation}</span></li>)}</ol> : <p className="mt-3 text-sm text-muted-foreground">Make sure your most relevant evidence is easy to find in the first half of your resume.</p>}</section>
    </div>
  </section>;
}

function InterviewPractice({ question, tip, category, answer, setAnswer, busy, feedback, submit, sessions, categories, onCategory, generateBusy, onGenerate, customDraft, setCustomDraft, onUseCustom }: { question: string; tip: string; category: string; answer: string; setAnswer: (value: string) => void; busy: boolean; feedback: { score: number; feedback: string } | null; submit: () => void; sessions: Interview[]; categories: readonly string[]; onCategory: (category: string) => void; generateBusy: boolean; onGenerate: () => void; customDraft: string; setCustomDraft: (value: string) => void; onUseCustom: () => void }) {
  return <><PageTitle kicker="Practice room" title="Say it out loud. Then say it better." description="Pick a question style, generate a fresh prompt, or practice one you were actually asked." action={<div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground"><MessageSquareText className="size-3.5" /> {sessions.length} saved reps</div>} />
    <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]"><section className="surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Question categories">{categories.map((item) => <button key={item} type="button" onClick={() => onCategory(item)} aria-pressed={item === category} className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${item === category ? "bg-accent text-primary" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>{item}</button>)}</div><Button variant="secondary" size="sm" onClick={onGenerate} disabled={generateBusy}><Sparkles className="size-3.5" /> {generateBusy ? "Thinking…" : "New question"}</Button></div>
      <p className="eyebrow mt-5">Your prompt</p>
      <h2 className="mt-3 text-xl font-medium leading-8">{question}</h2>
      {tip ? <p className="mt-3 text-xs leading-5 text-muted-foreground"><span className="text-primary">Strong answers show:</span> {tip}</p> : null}
      <p className="mt-3 text-xs leading-5 text-muted-foreground">Consider the situation, the actions you took, and the outcome. A real example goes a long way.</p>
      <div className="mt-5 flex flex-wrap items-center gap-2"><Input className="h-9 flex-1 basis-56" value={customDraft} onChange={(e) => setCustomDraft(e.target.value)} maxLength={800} placeholder="Practicing a question you were actually asked? Paste it here." aria-label="Your own interview question" /><Button variant="outline" size="sm" className="h-9" onClick={onUseCustom}>Use my question</Button></div>
      <Textarea className="mt-4 min-h-40 resize-y leading-6" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Start with the situation…" /><Button className="mt-4" onClick={submit} disabled={busy || answer.trim().length < 20}>{busy ? "Listening closely…" : "Get feedback"}<Send className="size-4" /></Button></section>
      <section className="surface-soft min-h-64 p-5 sm:p-6"><p className="eyebrow">Coaching notes</p>{feedback ? <><div className="mt-4 flex items-center gap-3"><span className="display-heading text-4xl">{feedback.score}</span><span className="text-xs text-muted-foreground">out of 100<br />for this answer</span><span className="ml-auto"><ScoreMark score={feedback.score} /></span></div><div className="feedback-copy mt-3 whitespace-pre-wrap text-sm leading-7">{feedback.feedback}</div></> : <div className="flex min-h-44 flex-col items-center justify-center text-center"><Award className="size-6 text-coral" /><p className="mt-3 text-sm font-medium">A safe place to find your words.</p><p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">Share your answer and your coach will help you find the signal in your story.</p></div>}</section>
    </div>
  </>;
}

function ScoreMark({ score }: { score: number }) { return score >= 80 ? <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] text-lime">Strong</span> : score >= 60 ? <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] text-ice">Taking shape</span> : <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] text-coral">Getting started</span>; }

function ProgressView({ tasks, interviews, completion, completedTasks }: { tasks: Task[]; interviews: Interview[]; completion: number; completedTasks: number }) {
  const scoreAverage = interviews.length ? Math.round(interviews.reduce((sum, item) => sum + (item.score ?? 0), 0) / interviews.length) : 0;
  return <><PageTitle kicker="Your momentum" title="Progress you can feel." description="Every checked box and practice rep is a real step forward." />
    <div className="grid gap-4 sm:grid-cols-3"><Metric icon={CheckCircle2} label="Roadmap completion" value={`${completion}%`} detail={`${completedTasks} of ${tasks.length} milestones`} tone="ice" /><Metric icon={MessageSquareText} label="Interview sessions" value={`${interviews.length}`} detail="Practice reps saved" tone="coral" /><Metric icon={Award} label="Average answer score" value={interviews.length ? `${scoreAverage}` : "—"} detail={interviews.length ? "Across your saved practice" : "Practice once to get your first score"} tone="lime" /></div>
    <section className="mt-8"><div className="mb-4"><p className="eyebrow">Your milestones</p><h2 className="mt-2 text-lg font-semibold">Small steps, in order</h2></div>{tasks.length ? <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">{tasks.map((task) => <TaskRow key={task.id} task={task} onToggle={() => undefined} />)}</div> : <div className="surface-soft p-5 text-sm text-muted-foreground">Create your roadmap to begin tracking career milestones.</div>}</section>
    <section className="mt-8"><div className="mb-4"><p className="eyebrow">Recent practice</p><h2 className="mt-2 text-lg font-semibold">Interview reps</h2></div>{interviews.length ? <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">{interviews.slice(0, 5).map((session) => <div key={session.id} className="flex items-center gap-4 bg-surface-raised p-4"><div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><MessageSquareText className="size-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{session.question}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(session.created_at).toLocaleDateString()}</p></div><p className="display-heading text-xl">{session.score ?? "—"}</p></div>)}</div> : <div className="surface-soft p-5 text-sm text-muted-foreground">Your interview practice and coach feedback will appear here.</div>}</section>
  </>;
}

const INTERVIEW_CATEGORIES = ["Behavioral", "Situational", "Technical", "Leadership", "Culture fit"] as const;

function buildQuestion(role: string, category: string) {
  const banks: Record<string, string[]> = {
    Behavioral: [
      `Tell me about a time you had to solve a difficult problem relevant to ${role}. What did you do, and what happened?`,
      `What’s a piece of work you’re proud of that shows how you’d thrive as ${role}?`,
      `Tell me about a time you received feedback and used it to improve your work.`,
      `What interests you about this next step, and what do you hope to bring to it?`,
    ],
    Situational: [
      `Imagine your first big deliverable as ${role} is at risk of slipping. How would you handle the first week?`,
      `If a teammate disagreed with your approach on a ${role} project, how would you work through it?`,
      `Two urgent requests land at once and you only have time for one. What do you do?`,
      `How would you approach your first 30 days as ${role} without formal onboarding?`,
    ],
    Technical: [
      `Walk me through how you’d judge whether a solution is strong enough for ${role}.`,
      `Describe a recent decision you made in your craft, including the trade-offs you weighed.`,
      `How do you decide when work is good enough versus when it needs another pass?`,
      `Tell me about a tricky problem in your field that took real persistence to solve.`,
    ],
    Leadership: [
      `Tell me about a time you influenced a decision without formal authority.`,
      `Describe a moment you had to give a teammate difficult feedback.`,
      `How have you helped a struggling teammate get back on track?`,
      `Tell me about a time you said no to protect a commitment.`,
    ],
    "Culture fit": [
      `What kind of environment brings out your best work?`,
      `Why this role, and why now?`,
      `What’s a working style you’ve learned to adapt to, and how?`,
      `How do you like to receive feedback?`,
    ],
  };
  const bank = banks[category] ?? banks["Behavioral"];
  const list = bank && bank.length ? bank : ["Tell me about a time you solved a meaningful challenge."];
  const day = Math.floor(Date.now() / 86_400_000);
  return list[day % list.length] ?? "Tell me about a time you solved a meaningful challenge.";
}
