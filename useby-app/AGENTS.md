<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## UseBy Local Rules

- Follow the repo-level `../AGENTS.md` first.
- Keep this app live-data oriented. Avoid hard-coded final outcomes; UI may show scaffold readiness, but production surfaces must consume Aurora-backed routes as soon as Checkpoint 1 lands them.
- Use App Router server components by default. Add client components only for local interactivity.
- Use RDS Data API retries for Aurora auto-pause wake-up behavior.
