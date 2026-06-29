"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode, SVGProps } from "react";

type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactNode;

const primaryNav: Array<{ label: string; href: string; path: string; Icon: IconComponent }> = [
  { label: "Today", href: "/", path: "/", Icon: HomeIcon },
  { label: "Inventory", href: "/grocery", path: "/grocery", Icon: BagIcon },
  { label: "Matches", href: "/grocery#matches", path: "/matches", Icon: HeartIcon },
  { label: "Pools", href: "/pools", path: "/pools", Icon: PeopleIcon },
  { label: "Drops", href: "/drops", path: "/drops", Icon: StoreIcon },
  { label: "Activity", href: "/bookings", path: "/bookings", Icon: ClockIcon },
];

const secondaryNav = [
  { label: "Merchant", href: "/merchant" },
  { label: "Proof", href: "/proof" },
  { label: "Agent runs", href: "/agent-runs" },
];

export function ConsumerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [demoGuideEnabled, setDemoGuideEnabled] = useState(false);
  const demoCue = cueForPath(pathname);

  useEffect(() => {
    const syncDemoGuide = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const enabledByUrl = params.get("demo") === "1";
      if (enabledByUrl) {
        window.localStorage.setItem("useby-demo-guide", "on");
      }
      const enabledByStorage = window.localStorage.getItem("useby-demo-guide") === "on";
      setDemoGuideEnabled(enabledByUrl || enabledByStorage);
    }, 0);

    return () => window.clearTimeout(syncDemoGuide);
  }, [pathname]);

  function toggleDemoGuide() {
    setDemoGuideEnabled((current) => {
      const next = !current;
      window.localStorage.setItem("useby-demo-guide", next ? "on" : "off");
      return next;
    });
  }

  return (
    <div className="useby-shell">
      <aside className="useby-rail" aria-label="Primary">
        <Link href="/" className="useby-brand" aria-label="UseBy Today">
          <LeafMark />
          <span>UseBy</span>
        </Link>

        <nav className="useby-nav" aria-label="Customer">
          {primaryNav.map(({ label, href, path, Icon }) => {
            const active = pathname === path || (path !== "/" && pathname.startsWith(`${path}/`));
            return (
              <Link className={active ? "is-active" : ""} href={href} key={label}>
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <nav className="useby-secondary-nav" aria-label="Admin and proof">
          {secondaryNav.map((item) => (
            <Link href={item.href} key={item.label}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="useby-impact-card">
          <PlantIcon aria-hidden="true" />
          <p>Small choices, big neighbourhood impact.</p>
          <Link href="/proof">Learn more</Link>
        </div>
      </aside>

      <div className="useby-main-shell">
        <header className="useby-topbar">
          <button className="useby-location" type="button">
            <PinIcon aria-hidden="true" />
            <span>Riverside Quarter</span>
            <ChevronIcon aria-hidden="true" />
          </button>

          <label className="useby-search">
            <SearchIcon aria-hidden="true" />
            <span className="sr-only">Search UseBy</span>
            <input placeholder="Search for items, people, or merchants..." type="search" />
            <kbd>Cmd K</kbd>
          </label>

          <div className="useby-userbar">
            <button
              aria-pressed={demoGuideEnabled}
              className={`useby-demo-toggle ${demoGuideEnabled ? "is-active" : ""}`}
              onClick={toggleDemoGuide}
              type="button"
            >
              Demo guide
            </button>
            <button className="useby-icon-button" aria-label="Notifications" type="button">
              <BellIcon aria-hidden="true" />
              <span>3</span>
            </button>
            <button className="useby-profile-button" type="button">
              <span className="useby-avatar" aria-hidden="true">M</span>
              <span>Maya</span>
              <ChevronIcon aria-hidden="true" />
            </button>
          </div>
        </header>

        {demoGuideEnabled ? <DemoPresenterCue cue={demoCue} onClose={toggleDemoGuide} /> : null}

        {children}
      </div>

      <nav className="useby-mobile-nav" aria-label="Mobile customer">
        {primaryNav.map(({ label, href, path, Icon }) => {
          const active = pathname === path || (path !== "/" && pathname.startsWith(`${path}/`));
          return (
            <Link className={active ? "is-active" : ""} href={href} key={label}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

type DemoCue = {
  eyebrow: string;
  title: string;
  body: string;
  chips: string[];
  action: string;
};

function DemoPresenterCue({ cue, onClose }: { cue: DemoCue; onClose: () => void }) {
  return (
    <section className="useby-demo-cue" aria-label="Demo presenter cue">
      <div>
        <p>{cue.eyebrow}</p>
        <h2>{cue.title}</h2>
        <span>{cue.body}</span>
      </div>
      <div className="useby-demo-cue-side">
        <div className="useby-demo-chip-row" aria-label="Demo proof points">
          {cue.chips.map((chip) => (
            <span key={chip}>{chip}</span>
          ))}
        </div>
        <div className="useby-demo-cue-actions">
          <strong>{cue.action}</strong>
          <button aria-label="Hide demo guide" onClick={onClose} type="button">
            Hide
          </button>
        </div>
      </div>
    </section>
  );
}

function cueForPath(pathname: string): DemoCue {
  if (pathname.startsWith("/grocery")) {
    return {
      eyebrow: "0:45-2:10 | Inventory to exchange",
      title: "AI drafts, Aurora decides, PostGIS matches nearby.",
      body: "Paste receipt text, review the extracted row, save a selected item, then show sealed eligible matches nearby.",
      chips: ["AI draft only", "Aurora mutation", "Expiry rules", "PostGIS distance", "Safety gate"],
      action: "Show receipt review, then matches.",
    };
  }

  if (pathname.startsWith("/bookings")) {
    return {
      eyebrow: "1:45-2:10 | Handoff state machine",
      title: "A match becomes a transaction-safe local handoff.",
      body: "Aurora owns requested, reserved, pickup, completion, and review states so an item cannot be double-booked.",
      chips: ["Requested", "Reserved", "Pickup", "Completed", "Audit trail"],
      action: "Open a booking and show state controls.",
    };
  }

  if (pathname.startsWith("/pools")) {
    return {
      eyebrow: "2:10-2:35 | DemandPool",
      title: "Household intent becomes merchant demand.",
      body: "Neighbours join unpaid demo intent pools; merchants can bid against real local demand instead of guessing.",
      chips: ["Unpaid intent", "Merchant bids", "Price scoring", "Pickup window", "Reliability"],
      action: "Show the pool target and join flow.",
    };
  }

  if (pathname.startsWith("/drops")) {
    return {
      eyebrow: "2:10-2:35 | Merchant surplus",
      title: "Nearby surplus becomes a reservable pickup.",
      body: "Store drops reuse the same availability, capacity, privacy, and audit patterns as the rest of UseBy.",
      chips: ["Live capacity", "Merchant route", "Pickup window", "Demo display only"],
      action: "Show reservable merchant drop cards.",
    };
  }

  if (pathname.startsWith("/merchant")) {
    return {
      eyebrow: "2:10-2:35 | Merchant view",
      title: "Small shops see demand signals and operational state.",
      body: "The backend complexity stays behind the scenes while merchants get bids, pickups, and demand context.",
      chips: ["Heatmap", "Bids", "Pickup ops", "No payment capture"],
      action: "Show merchant demand and pickup surfaces.",
    };
  }

  if (pathname.startsWith("/proof")) {
    return {
      eyebrow: "2:35-2:55 | Proof and deployment",
      title: "Judge proof: AWS database state and Vercel runtime.",
      body: "Use this screen to show Aurora PostgreSQL, PostGIS, pgvector readiness, row counts, audit events, jobs, and redacted agent metadata.",
      chips: ["Aurora", "PostGIS", "pgvector", "S3/Textract", "Vercel routes"],
      action: "Show proof, then return to Today.",
    };
  }

  if (pathname.startsWith("/agent-runs")) {
    return {
      eyebrow: "Agentic proof",
      title: "Agent runs are review-only and redacted.",
      body: "Fireworks can draft and explain; LangSmith traces can prove runs. Deterministic routes still decide safety, trust, payment, capacity, and visibility.",
      chips: ["Fireworks", "LangSmith", "Redaction", "Guardrails"],
      action: "Use only if judges ask about AI.",
    };
  }

  return {
    eyebrow: "0:00-0:45 | Problem and promise",
    title: "A calm daily action layer over a live neighbourhood exchange graph.",
    body: "Start here: UseBy turns expiring groceries, idle assets, local needs, pools, and drops into concrete actions.",
    chips: ["Use more", "Share nearby", "Borrow instead", "Join pools", "Claim drops"],
    action: "Open with Today, then move to Inventory.",
  };
}

function LeafMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48">
      <path d="M8 28C8 15 18 7 36 6c-2 17-10 27-23 29 7-7 14-14 21-23C22 18 15 24 8 28Z" fill="#255c45" />
      <path d="M10 30c10 0 19 4 28 12-14 2-24-1-30-10l2-2Z" fill="#9caf9c" />
    </svg>
  );
}

function iconProps(props: SVGProps<SVGSVGElement>) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><path d="m4 11 8-7 8 7" /><path d="M6.5 10.5V20h11v-9.5" /><path d="M10 20v-5h4v5" /></svg>;
}

function BagIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><path d="M7 8h10l1 12H6L7 8Z" /><path d="M9 8a3 3 0 0 1 6 0" /></svg>;
}

function HeartIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><path d="M20.4 5.8c-2-2-5.2-1.8-7.1.3L12 7.5l-1.3-1.4C8.8 4 5.6 3.8 3.6 5.8 1.5 8 1.8 11.5 4.2 13.8L12 21l7.8-7.2c2.4-2.3 2.7-5.8.6-8Z" /></svg>;
}

function PeopleIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M17 12a2.5 2.5 0 1 0 0-5" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M14.5 15.5A4.8 4.8 0 0 1 20.5 20" /></svg>;
}

function StoreIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><path d="M4 10h16l-1.4-5H5.4L4 10Z" /><path d="M6 10v10h12V10" /><path d="M9 20v-6h6v6" /><path d="M4 10c.5 2 3.5 2 4 0 .5 2 3.5 2 4 0 .5 2 3.5 2 4 0 .5 2 3.5 2 4 0" /></svg>;
}

function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>;
}

function PinIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><path d="M12 21s6-5.3 6-11a6 6 0 0 0-12 0c0 5.7 6 11 6 11Z" /><circle cx="12" cy="10" r="2" /></svg>;
}

function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><path d="m7 10 5 5 5-5" /></svg>;
}

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>;
}

function BellIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><path d="M18 9a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9Z" /><path d="M10 21h4" /></svg>;
}

function PlantIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...iconProps(props)}><path d="M12 21V10" /><path d="M12 13C8 13 5 10 5 6c4 0 7 3 7 7Z" /><path d="M12 16c4 0 7-3 7-7-4 0-7 3-7 7Z" /></svg>;
}
