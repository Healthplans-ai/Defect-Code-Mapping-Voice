import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

export type SitePage = "map" | "analysis" | "import";

const navClass = (active: boolean) =>
  cn("transition-colors", active ? "text-primary" : "hover:text-primary");

export function SiteHeader({ active }: { active: SitePage }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <Link to="/" className="font-display text-lg font-bold tracking-tight">
          healthplans<span className="text-accent">.ai</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium text-muted-foreground">
          {active === "map" ? (
            <>
              <a href="#pipeline" className="transition-colors hover:text-primary">
                Pipeline
              </a>
              <a href="#defects" className="transition-colors hover:text-primary">
                Defects
              </a>
            </>
          ) : (
            <Link to="/" className={navClass(false)}>
              Defect map
            </Link>
          )}
          <Link to="/analysis" className={navClass(active === "analysis")}>
            Analysis
          </Link>
          <Link
            to="/import"
            className={
              active === "import"
                ? "rounded-full bg-primary px-4 py-2 text-primary-foreground"
                : "rounded-full border border-border px-4 py-2 transition-colors hover:border-primary hover:text-primary"
            }
          >
            Upload tracker
          </Link>
        </nav>
      </div>
    </header>
  );
}
