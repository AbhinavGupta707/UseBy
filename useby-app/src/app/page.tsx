import Link from "next/link";

const actionCards = [
  {
    title: "Share sealed wraps before Friday",
    detail: "Neighbour need and item safety status will be computed from Aurora rows.",
    state: "Waiting for matching job",
  },
  {
    title: "Join the Sunday roast DemandPool",
    detail: "Pool thresholds, commitments, and merchant bids resolve from live database state.",
    state: "Input world seeded",
  },
  {
    title: "Green dress rental window",
    detail: "Fit confidence and booking locks land after Checkpoint 1 data foundation.",
    state: "Product lane queued",
  },
];

const proofLinks = [
  ["Live system state", "Counts, endpoint health, audit feed, and latest jobs"],
  ["Database proof", "Aurora metadata, extension status, and integration signals"],
  ["Demo controls", "Reset, seed, job, pool, and booking endpoints when installed"],
];

const neighbourhoodSignals = [
  ["8", "Demo households"],
  ["2-3", "Local merchants"],
  ["20+", "Grocery inputs"],
  ["3", "Demand pools"],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f4f6f1] text-[#17231c]">
      <header className="border-b border-[#d2dbc9] bg-[#fbfcf8]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-[#315b44] text-sm font-semibold text-white">
              UB
            </span>
            <span>
              <span className="block text-lg font-semibold">UseBy</span>
              <span className="block text-sm text-[#65715f]">Riverside Quarter</span>
            </span>
          </Link>

          <nav className="flex flex-wrap gap-2 text-sm font-semibold">
            <a className="rounded-md px-3 py-2 text-[#566250] hover:bg-[#edf1e8]" href="#shelf">
              Shelf
            </a>
            <a className="rounded-md px-3 py-2 text-[#566250] hover:bg-[#edf1e8]" href="#pools">
              Pools
            </a>
            <Link
              className="rounded-md bg-[#315b44] px-3 py-2 text-white transition hover:bg-[#254635]"
              href="/proof"
            >
              Proof
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <section id="shelf" className="rounded-lg border border-[#d2dbc9] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-[#65715f]">Home Shelf</p>
              <h1 className="mt-2 max-w-2xl text-4xl font-semibold leading-tight">
                Turn household inventory into local actions.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#566250]">
                Checkpoint 1 is the live data foundation: seeded input world, Aurora table counts,
                audit events, job runs, and proof controls.
              </p>
            </div>
            <Link
              className="rounded-md border border-[#315b44] px-4 py-2 text-sm font-semibold text-[#315b44] transition hover:bg-[#315b44] hover:text-white"
              href="/proof"
            >
              Open live proof
            </Link>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {actionCards.map((card) => (
              <article key={card.title} className="rounded-md border border-[#e0e6d9] bg-[#fbfcf8] p-4">
                <p className="text-sm font-semibold text-[#17231c]">{card.title}</p>
                <p className="mt-3 text-sm leading-6 text-[#566250]">{card.detail}</p>
                <p className="mt-4 rounded-md border border-[#d2dbc9] px-2 py-1 text-xs font-semibold text-[#315b44]">
                  {card.state}
                </p>
              </article>
            ))}
          </div>
        </section>

        <aside className="grid gap-5">
          <section className="rounded-lg border border-[#d2dbc9] bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-[#65715f]">Proof Entry</p>
            <h2 className="mt-2 text-2xl font-semibold">Judge-facing live evidence</h2>
            <div className="mt-4 divide-y divide-[#edf1e8]">
              {proofLinks.map(([label, detail]) => (
                <Link
                  key={label}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 py-3"
                  href="/proof"
                >
                  <span>
                    <span className="block font-semibold text-[#17231c]">{label}</span>
                    <span className="mt-1 block text-sm leading-6 text-[#65715f]">{detail}</span>
                  </span>
                  <span className="text-[#315b44]">Open</span>
                </Link>
              ))}
            </div>
          </section>

          <section id="pools" className="rounded-lg border border-[#d2dbc9] bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase text-[#65715f]">Demo World Inputs</p>
            <h2 className="mt-2 text-2xl font-semibold">Riverside Quarter seed scope</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {neighbourhoodSignals.map(([value, label]) => (
                <div key={label} className="rounded-md border border-[#e0e6d9] bg-[#fbfcf8] p-4">
                  <p className="font-mono text-3xl font-semibold text-[#315b44]">{value}</p>
                  <p className="mt-2 text-sm text-[#65715f]">{label}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
