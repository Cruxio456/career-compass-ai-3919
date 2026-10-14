# Polar Jobs career preparation platform

Build a polished, responsive career-prep workspace called Polar Jobs as the first screen at `/`.

## Product experience
- Create a dashboard with a focused welcome, job target, weekly momentum, and navigation between Overview, Roadmap, Resume, Interview practice, and Progress.
- Provide working career goal/profile inputs; AI-generated personalized roadmap; resume feedback from pasted resume text and target role; interview practice prompts with answer feedback; and progress actions/check-ins.
- Persist each signed-in user's career profile and progress in Lovable Cloud; add the account flow required for private user data.
- Keep useful empty, loading, success, and error states. Use Lovable AI server-side for real generation and feedback.

## Design
- Use a distinctive editorial career-coach aesthetic with clean typography, clear data hierarchy, restrained blue accent, and responsive layouts.
- Define visual tokens centrally in `src/styles.css` and use the existing UI primitives.

## Technical approach
- Build the app at `src/routes/index.tsx`; add public auth route(s) and required content-route metadata if more pages are introduced.
- Use Cloud Auth and user-scoped database access with RLS for profile and progress records; create schema and grants through a migration.
- Use TanStack Start server functions for AI and protected reads/writes. Call Lovable AI Gateway from server-only code with the Responses SDK, streaming and consuming final output server-side.
- Verify the main workflows, page rendering, tests/build logs, and check the task roadmap before completion.
