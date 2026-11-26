CREATE TABLE public.ai_usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature text NOT NULL CHECK (feature IN ('roadmap', 'resume_review', 'job_match', 'interview_review', 'interview_question')),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_usage_records TO authenticated;
GRANT ALL ON public.ai_usage_records TO service_role;
ALTER TABLE public.ai_usage_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own AI usage" ON public.ai_usage_records FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX ai_usage_records_user_created_idx ON public.ai_usage_records (user_id, created_at DESC);