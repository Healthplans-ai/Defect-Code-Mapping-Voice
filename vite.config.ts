// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/**
 * Which Nitro preset to build for.
 *
 * Vercel sets `VERCEL=1` in its build container, so a deploy there emits the
 * Build Output API layout in `.vercel/output` and Vercel picks it up with no
 * further configuration. `NITRO_PRESET` overrides that if you need to target
 * something else from your own CI. Left unset locally, the wrapper's own
 * Cloudflare default applies — and inside a Lovable build the preset is pinned
 * by the wrapper regardless of what we ask for here.
 */
const preset = process.env["NITRO_PRESET"] ?? (process.env["VERCEL"] ? "vercel" : undefined);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: preset === undefined ? true : { preset },
});
