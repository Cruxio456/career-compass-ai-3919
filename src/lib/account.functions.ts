import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteOwnAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const deletions = await Promise.all([
      supabaseAdmin.from("interview_sessions").delete().eq("user_id", userId),
      supabaseAdmin.from("roadmap_tasks").delete().eq("user_id", userId),
      supabaseAdmin.from("ai_usage_records").delete().eq("user_id", userId),
      supabaseAdmin.from("profiles").delete().eq("user_id", userId),
    ]);

    if (deletions.some(({ error }) => error)) {
      throw new Error("Your account data could not be fully removed. Please try again.");
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      throw new Error("Your career data was removed, but your sign-in account could not be deleted. Please try again.");
    }

    return { success: true };
  });