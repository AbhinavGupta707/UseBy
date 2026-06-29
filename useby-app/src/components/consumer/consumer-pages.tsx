"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ReceiptAgentReview } from "../agent/receipt-agent-review";
import {
  loadGrocerySnapshot,
  submitManualGrocery,
} from "../../lib/grocery/api";
import type {
  GroceryActionCard,
  GroceryInventoryItem,
  GroceryMatch,
  ManualGroceryInput,
} from "../../lib/grocery/types";
import {
  requestBooking,
  submitSafetyAcknowledgement,
} from "../../lib/bookings/api";
import {
  bookingsEndpointSummary,
  formatStatus,
  loadBookingsSnapshot,
} from "../../lib/bookings/api";
import type { Booking, BookingMutationResult } from "../../lib/bookings/types";
import {
  formatDateTime as formatPoolDate,
  formatMoney,
  formatPoolStatus,
  loadDemandPoolSnapshot,
  poolProgress,
  submitDemandPoolCommitment,
} from "../../lib/demand-pools/api";
import type { DemandPool, DemandPoolMutationResult } from "../../lib/demand-pools/types";
import {
  canReserveDrop,
  formatDropPrice,
  formatDropStatus,
  loadStoreDropSnapshot,
  pickupWindowLabel,
  submitStoreDropReservation,
} from "../../lib/store-drops/api";
import type { StoreDrop, StoreDropMutationResult } from "../../lib/store-drops/types";
import {
  formatDateTime as formatLendingDate,
  formatLendingStatus,
  loadLendingSnapshot,
  requestLending,
} from "../../lib/lending/api";
import type { LendingListing, LendingMutationResult, LendingRequest } from "../../lib/lending/types";

type LoadState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

const visuals = {
  neighbourhood: "/useby-assets/neighbourhood.svg",
  groceries: "/useby-assets/groceries.svg",
  herbs: "/useby-assets/herbs-wraps.svg",
  yogurt: "/useby-assets/yogurt-herbs.svg",
  dress: "/useby-assets/green-dress.svg",
  tools: "/useby-assets/tools.svg",
  pantry: "/useby-assets/pantry.svg",
  brunch: "/useby-assets/brunch.svg",
  apples: "/useby-assets/apples.svg",
};

const defaultManualInput: ManualGroceryInput = {
  itemName: "",
  quantity: "1",
  unit: "each",
  storageState: "cupboard",
  expiryDate: "",
  receiptLines: "",
};

export function TodayDashboard() {
  const grocery = useAsyncData(loadGrocerySnapshot);
  const pools = useAsyncData(loadDemandPoolSnapshot);
  const drops = useAsyncData(loadStoreDropSnapshot);
  const bookings = useAsyncData(loadBookingsSnapshot);

  const inventory = grocery.data?.inventory ?? [];
  const matches = grocery.data?.matches ?? [];
  const actionCards = grocery.data?.actionCards ?? [];
  const poolList = pools.data?.pools ?? [];
  const dropList = drops.data?.drops ?? [];
  const bookingList = bookings.data?.bookings ?? [];
  const soonItems = inventory.filter((item) => ["expired", "today", "use_soon", "watch"].includes(item.expiryBand));
  const topCards = buildTodayCards(actionCards, inventory, matches, poolList, dropList).slice(0, 4);
  const nearby = buildNearbyOpportunities(matches, poolList, dropList).slice(0, 3);

  return (
    <main className="useby-page">
      <section className="useby-hero">
        <div>
          <h1>Good evening, Maya</h1>
          <p>Use more. Share more. Unlock what is nearby. Good for you, your neighbours, and the planet.</p>
        </div>
        <Visual src={visuals.neighbourhood} label="Riverside Quarter neighbourhood" className="useby-hero-art" />
      </section>

      <section className="useby-metrics" aria-label="Live neighbourhood summary">
        <MetricCard tone="gold" label="Money saved this month" value={estimateSavings(poolList, dropList)} detail="from live deals nearby" />
        <MetricCard tone="sage" label="Things to use soon" value={String(soonItems.length)} detail={`${inventory.length} shelf items returned`} />
        <MetricCard tone="coral" label="Shared and booked" value={String(matches.length + bookingList.length)} detail="matches and activity" />
      </section>

      <section className="useby-section">
        <div className="useby-section-heading">
          <h2>Today</h2>
          <p>Priority actions from your current shelf, matches, pools, and drops.</p>
        </div>
        <div className="useby-priority-grid">
          {topCards.map((card, index) => (
            <article className="useby-priority-card" key={`${card.title}-${index}`}>
              <span className={`useby-step useby-step-${index + 1}`}>{index + 1}</span>
              <div>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </div>
              <Visual src={card.visual} label="" className="useby-card-visual" decorative />
              <Link className={`useby-button ${card.tone === "coral" ? "useby-button-coral" : card.tone === "gold" ? "useby-button-gold" : ""}`} href={card.href}>
                {card.cta}
                <ArrowIcon />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="useby-section">
        <div className="useby-section-heading useby-section-heading-row">
          <div>
            <h2>Nearby opportunities</h2>
            <p>Consumer-safe matches, deals, and pickups from live rows.</p>
          </div>
          <Link href="/grocery#matches">View all matches <ArrowIcon /></Link>
        </div>
        <div className="useby-opportunity-grid">
          {nearby.map((item) => (
            <article className="useby-opportunity-card" key={item.id}>
              <Visual src={item.visual} label="" className="useby-opportunity-image" decorative />
              <div>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
                <div className="useby-meta-row">
                  <span>{item.distance}</span>
                  <span>{item.tag}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
        {!grocery.loading && !pools.loading && !drops.loading && nearby.length === 0 ? (
          <EmptyConsumerState title="No nearby opportunities returned" detail="Matches, pools, and merchant drops will appear here when live rows are available." />
        ) : null}
      </section>

      <LiveStateNotice states={[grocery, pools, drops, bookings]} />
    </main>
  );
}

export function InventoryDashboard() {
  const grocery = useAsyncData(loadGrocerySnapshot);
  const lending = useAsyncData(loadLendingSnapshot);
  const [tab, setTab] = useState<"groceries" | "wardrobe" | "household">("groceries");
  const [query, setQuery] = useState("");
  const [manualInput, setManualInput] = useState(defaultManualInput);
  const [mutation, setMutation] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const inventory = grocery.data?.inventory ?? [];
  const listings = lending.data?.listings ?? [];
  const filteredGroceries = inventory.filter((item) => matchesQuery(item.name, query));
  const filteredListings = listings.filter((listing) => listing.category === (tab === "wardrobe" ? "fashion" : "household") && matchesQuery(listing.title, query));

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await confirmManualInput(manualInput, true);
  }

  async function confirmManualInput(input: ManualGroceryInput, resetOnSuccess = false) {
    setSubmitting(true);
    setMutation(null);
    const result = await submitManualGrocery(window.fetch.bind(window), input);
    setMutation(result.status === "ok" ? "Saved. Your shelf will refresh with current rows." : `Could not save yet: ${result.message}`);
    if (result.status === "ok") {
      if (resetOnSuccess) {
        setManualInput(defaultManualInput);
      }
      await grocery.refresh();
    }
    setSubmitting(false);
    return result;
  }

  return (
    <main className="useby-page">
      <PageIntro
        title="Your inventory"
        detail="See what you have, use it up, and keep good things out of landfills."
        visual={visuals.groceries}
        visualLabel="A basket of groceries"
      />

      <div className="useby-tabs" role="tablist" aria-label="Inventory categories">
        <TabButton active={tab === "groceries"} onClick={() => setTab("groceries")}>Groceries</TabButton>
        <TabButton active={tab === "wardrobe"} onClick={() => setTab("wardrobe")}>Wardrobe</TabButton>
        <TabButton active={tab === "household"} onClick={() => setTab("household")}>Household</TabButton>
      </div>

      <div className="useby-toolbar">
        <label className="useby-field useby-field-search">
          <span className="sr-only">Search inventory</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Search your inventory..." type="search" value={query} />
        </label>
        <button className="useby-soft-button" type="button">All status</button>
        <button className="useby-soft-button" type="button">Nearest expiry</button>
      </div>

      {tab === "groceries" ? (
        <section className="useby-section">
          <div className="useby-section-heading useby-section-heading-row">
            <div>
              <h2>Use this week</h2>
              <p>Items nearing their best date.</p>
            </div>
          </div>
          <div className="useby-product-grid">
            {filteredGroceries.slice(0, 10).map((item) => (
              <GroceryProductCard item={item} key={item.id} />
            ))}
          </div>
          {!grocery.loading && filteredGroceries.length === 0 ? <EmptyConsumerState title="No grocery items returned" detail={liveUnavailableCopy(grocery.data?.status)} /> : null}
        </section>
      ) : (
        <section className="useby-section">
          <div className="useby-product-grid">
            {filteredListings.slice(0, 10).map((listing) => (
              <LendingListingCard listing={listing} key={listing.id} compact />
            ))}
          </div>
          {!lending.loading && filteredListings.length === 0 ? <EmptyConsumerState title="No listings returned" detail={liveUnavailableCopy(lending.data?.status)} /> : null}
        </section>
      )}

      <section className="useby-section" id="matches">
        <MatchesSurface matches={grocery.data?.matches ?? []} loading={grocery.loading} />
      </section>

      <section className="useby-add-panel">
        <div>
          <h2>Add groceries or paste a receipt</h2>
          <p>Use the agent for receipt text, or save one manually named item with a label date.</p>
        </div>
        <form className="useby-add-form" onSubmit={handleManualSubmit}>
          <label className="useby-field-stack">
            <span>Receipt lines</span>
            <textarea
              aria-describedby="receipt-lines-help"
              onChange={(event) => setManualInput({ ...manualInput, receiptLines: event.target.value })}
              placeholder={"BABY SPINACH 200G\nTORTILLA WRAPS 8PK"}
              value={manualInput.receiptLines}
            />
          </label>
          <p className="useby-form-note" id="receipt-lines-help">
            Paste receipt text here, then use Draft with agent to review extracted items before saving.
          </p>
          <div className="useby-form-grid">
            <label className="useby-field-stack">
              <span>Manual item name</span>
              <input aria-label="Item name" onChange={(event) => setManualInput({ ...manualInput, itemName: event.target.value })} placeholder="Greek yoghurt" value={manualInput.itemName} />
            </label>
            <label className="useby-field-stack">
              <span>Quantity</span>
              <input aria-label="Quantity" onChange={(event) => setManualInput({ ...manualInput, quantity: event.target.value })} placeholder="1" value={manualInput.quantity} />
            </label>
            <label className="useby-field-stack">
              <span>Unit</span>
              <input aria-label="Unit" onChange={(event) => setManualInput({ ...manualInput, unit: event.target.value })} placeholder="each" value={manualInput.unit} />
            </label>
            <label className="useby-field-stack">
              <span>Label date</span>
              <input aria-label="Label date" onChange={(event) => setManualInput({ ...manualInput, expiryDate: event.target.value })} type="date" value={manualInput.expiryDate} />
            </label>
          </div>
          <button className="useby-button" disabled={submitting || !manualInput.itemName.trim()} type="submit">
            {submitting ? "Saving" : "Save manual item"}
          </button>
          {mutation ? <p className="useby-form-note">{mutation}</p> : null}
        </form>
        <div className="useby-agent-review">
          <ReceiptAgentReview input={manualInput} onConfirm={(input) => confirmManualInput(input)} />
        </div>
      </section>
    </main>
  );
}

export function PoolsDashboard() {
  const pools = useAsyncData(loadDemandPoolSnapshot);
  const poolList = pools.data?.pools ?? [];
  const featured = poolList[0] ?? null;
  const rest = poolList.slice(1);

  return (
    <main className="useby-page">
      <PageIntro
        title="Community pools"
        detail="Unlock better local prices together. Join a pool, invite neighbours, and save more."
        visual={visuals.neighbourhood}
        visualLabel="Neighbourhood market street"
      />

      {featured ? <FeaturedPool pool={featured} onRefresh={pools.refresh} /> : !pools.loading ? <EmptyConsumerState title="No active pools returned" detail={liveUnavailableCopy(pools.data?.status)} /> : <LargeSkeleton />}

      <section className="useby-section">
        <div className="useby-section-heading useby-section-heading-row">
          <div>
            <h2>More pools in your area</h2>
            <p>Live pool progress and merchant-safe bid states.</p>
          </div>
          <button className="useby-soft-button" type="button">Ending soonest</button>
        </div>
        <div className="useby-pool-grid">
          {rest.map((pool) => (
            <PoolMiniCard key={pool.id} pool={pool} onRefresh={pools.refresh} />
          ))}
        </div>
      </section>
    </main>
  );
}

export function DropsDashboard() {
  const drops = useAsyncData(loadStoreDropSnapshot);
  const dropList = drops.data?.drops ?? [];

  return (
    <main className="useby-page">
      <PageIntro
        title="Merchant drops"
        detail="Nearby surplus pickups from merchants, shown with honest availability and unpaid reservation intent."
        visual={visuals.brunch}
        visualLabel="Weekend brunch bundle"
      />

      <section className="useby-section">
        <div className="useby-drop-grid">
          {dropList.map((drop) => (
            <DropCard key={drop.id} drop={drop} onRefresh={drops.refresh} />
          ))}
        </div>
        {!drops.loading && dropList.length === 0 ? <EmptyConsumerState title="No surplus drops returned" detail={liveUnavailableCopy(drops.data?.status)} /> : null}
      </section>
    </main>
  );
}

export function ActivityDashboard() {
  const bookings = useAsyncData(loadBookingsSnapshot);
  const lending = useAsyncData(loadLendingSnapshot);
  const bookingList = bookings.data?.bookings ?? [];
  const requests = lending.data?.requests ?? [];

  return (
    <main className="useby-page">
      <PageIntro
        title="Activity"
        detail="Bookings, handoffs, pickups, and lending requests in one calm timeline."
        visual={visuals.herbs}
        visualLabel="Fresh herbs and wraps"
      />

      <section className="useby-metrics" aria-label="Activity summary">
        <MetricCard tone="sage" label="Food bookings" value={String(bookingList.length)} detail={bookingsEndpointSummary(bookings.data)} />
        <MetricCard tone="gold" label="Lending requests" value={String(requests.length)} detail="wardrobe and household" />
        <MetricCard tone="coral" label="Closed handoffs" value={String(bookingList.filter((booking) => ["completed", "reviewed"].includes(booking.status)).length)} detail="from current rows" />
      </section>

      <section className="useby-section">
        <div className="useby-activity-list">
          {bookingList.map((booking) => <BookingActivityCard booking={booking} key={booking.id} />)}
          {requests.map((request) => <LendingActivityCard request={request} key={request.id} />)}
        </div>
        {!bookings.loading && !lending.loading && bookingList.length + requests.length === 0 ? (
          <EmptyConsumerState title="No activity returned" detail="Bookings and lending requests will appear here when the live routes return current rows." />
        ) : null}
      </section>
    </main>
  );
}

export function LendingDashboard() {
  const lending = useAsyncData(loadLendingSnapshot);
  const [filter, setFilter] = useState<"all" | "fashion" | "household">("all");
  const listings = lending.data?.listings ?? [];
  const filtered = filter === "all" ? listings : listings.filter((listing) => listing.category === filter);

  return (
    <main className="useby-page">
      <PageIntro
        title="Wardrobe and household lending"
        detail="List useful items, borrow nearby, and keep exact household details private."
        visual={visuals.dress}
        visualLabel="Green dress on a hanger"
      />
      <div className="useby-tabs" role="tablist" aria-label="Lending categories">
        <TabButton active={filter === "all"} onClick={() => setFilter("all")}>All</TabButton>
        <TabButton active={filter === "fashion"} onClick={() => setFilter("fashion")}>Wardrobe</TabButton>
        <TabButton active={filter === "household"} onClick={() => setFilter("household")}>Household</TabButton>
      </div>
      <section className="useby-section">
        <div className="useby-opportunity-grid">
          {filtered.map((listing) => (
            <LendingListingCard listing={listing} key={listing.id} />
          ))}
        </div>
        {!lending.loading && filtered.length === 0 ? <EmptyConsumerState title="No lending listings returned" detail={liveUnavailableCopy(lending.data?.status)} /> : null}
      </section>
    </main>
  );
}

function useAsyncData<T>(loader: (fetcher: typeof fetch) => Promise<T>): LoadState<T> & { refresh: () => Promise<void> } {
  const [state, setState] = useState<LoadState<T>>({ data: null, loading: true, error: null });

  async function refresh() {
    if (typeof window.fetch !== "function") {
      setState({ data: null, loading: false, error: "Browser fetch is unavailable." });
      return;
    }
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await loader(window.fetch.bind(window));
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState({ data: null, loading: false, error: error instanceof Error ? error.message : "Live data could not be loaded." });
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await loader(window.fetch.bind(window));
        if (!cancelled) {
          setState({ data, loading: false, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ data: null, loading: false, error: error instanceof Error ? error.message : "Live data could not be loaded." });
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [loader]);

  return { ...state, refresh };
}

function PageIntro({ title, detail, visual, visualLabel }: { title: string; detail: string; visual: string; visualLabel: string }) {
  return (
    <section className="useby-page-intro">
      <div>
        <h1>{title}</h1>
        <p>{detail}</p>
      </div>
      <Visual src={visual} label={visualLabel} className="useby-page-art" />
    </section>
  );
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "sage" | "gold" | "coral" }) {
  return (
    <article className={`useby-metric useby-metric-${tone}`}>
      <span aria-hidden="true" />
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function GroceryProductCard({ item }: { item: GroceryInventoryItem }) {
  const days = item.expiryDate ? daysUntil(item.expiryDate) : null;
  const name = consumerTitle(item.name);
  const visual = visualFor(name, "groceries");
  const cta = item.expiryBand === "fresh" ? "Freeze" : "Cook";
  return (
    <article className="useby-product-card">
      <Visual src={visual} label="" className="useby-product-image" decorative />
      {days !== null ? <span className="useby-date-pill">{days <= 0 ? "today" : `${days} days`}</span> : null}
      <h3>{name}</h3>
      <p>{formatQuantity(item.quantity)} {item.unit}</p>
      <span className={`useby-status-dot useby-status-${item.expiryBand}`}>{expiryLabel(item.expiryBand)}</span>
      <Link className="useby-button" href="/grocery#matches">{cta}<ArrowIcon /></Link>
    </article>
  );
}

function MatchesSurface({ matches, loading }: { matches: GroceryMatch[]; loading: boolean }) {
  return (
    <>
      <div className="useby-section-heading">
        <h2>Matches nearby</h2>
        <p>People nearby who could use what you have or offer what you need.</p>
      </div>
      <div className="useby-filter-row">
        {["All", "Grocery", "Fashion", "Household", "Tonight"].map((item) => <button className="useby-chip-button" key={item} type="button">{item}</button>)}
      </div>
      <div className="useby-map-strip" aria-label="Riverside Quarter and nearby within 2 km">
        <span>Riverside Quarter and nearby - within 2 km</span>
      </div>
      <div className="useby-match-list">
        {matches.map((match) => <MatchCard key={match.id} match={match} />)}
      </div>
      {!loading && matches.length === 0 ? <EmptyConsumerState title="No matches returned" detail="Eligible nearby matches will appear here when the live matching route returns current rows." /> : null}
    </>
  );
}

function MatchCard({ match }: { match: GroceryMatch }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookingMutationResult | null>(null);
  const activeStatus = ["proposed", "active"].includes(match.status);
  const eligible = match.safetyStatus === "eligible" && activeStatus && Boolean(match.requesterHouseholdId);
  const unavailableReason = !activeStatus
    ? "This match is no longer active."
    : match.safetyStatus !== "eligible"
      ? `Sharing is blocked because the item safety status is ${formatLabel(match.safetyStatus)}.`
      : !match.requesterHouseholdId
        ? "This match is missing requester context, so the booking cannot be attached to the right household."
        : "";

  async function reserve() {
    setSubmitting(true);
    setResult(null);
    const ackResult = await submitSafetyAcknowledgement(window.fetch.bind(window), {
      matchId: match.id,
      itemInstanceId: match.itemId,
      needId: match.needId,
      householdId: match.requesterHouseholdId,
      acknowledged,
      sealedPackagedOnly: true,
      noSafetyCertification: true,
      source: "grocery_match_card",
    });
    if (ackResult.status !== "ok") {
      setResult(ackResult);
      setSubmitting(false);
      return;
    }
    const bookingResult = await requestBooking(window.fetch.bind(window), {
      matchId: match.id,
      itemInstanceId: match.itemId,
      needId: match.needId,
      householdId: match.requesterHouseholdId,
      source: "grocery_match_card",
    });
    setResult(bookingResult);
    setSubmitting(false);
  }

  return (
    <article className="useby-match-card">
      <Visual src={visualFor(`${match.itemName} ${match.needTitle}`, "herbs")} label="" className="useby-match-image" decorative />
      <div>
        <h3>{match.needTitle || `${match.itemName} nearby`}</h3>
        <p className="useby-meta-line">{formatDistance(match.distanceMeters)} - Pickup window from live row - {match.requesterCoarseLocation ?? "Riverside Quarter"}</p>
        <p>{match.rationale}</p>
        <div className="useby-reason-row">
          <span>{formatLabel(match.safetyStatus)}</span>
          <span>{consumerTitle(match.itemName)}</span>
        </div>
      </div>
      <div className="useby-match-action">
        <label>
          <input checked={acknowledged} disabled={!eligible} onChange={(event) => setAcknowledged(event.target.checked)} type="checkbox" />
          <span>Sealed packaged goods only</span>
        </label>
        <button className="useby-button" disabled={!eligible || !acknowledged || submitting} onClick={() => void reserve()} type="button">
          {submitting ? "Reserving" : "Reserve"}<ArrowIcon />
        </button>
        {!eligible ? <small>{unavailableReason}</small> : null}
        {result ? <small>{result.status === "ok" ? "Booking requested." : result.message}</small> : null}
      </div>
    </article>
  );
}

function FeaturedPool({ pool, onRefresh }: { pool: DemandPool; onRefresh: () => Promise<void> }) {
  const winner = pool.winningBid ?? pool.merchantBids.find((bid) => bid.safeToShow) ?? null;
  const progress = poolProgress(pool);
  const title = consumerTitle(pool.title);
  return (
    <section className="useby-featured-pool">
      <div>
        <span className="useby-featured-label">Featured</span>
        <h2>{title}</h2>
        <p>{winner?.merchantName ?? "Local merchant"} - {pickupAreaCopy(pool)}</p>
        <p>{pool.description ?? itemList(pool.items) ?? "Fresh produce, pantry staples, and local bundles."}</p>
      </div>
      <div className="useby-pool-progress">
        <strong>{formatMoney(pool.maxPriceCents)} max intent</strong>
        <div><span style={{ width: `${progress}%` }} /></div>
        <p>{progress}% of target - {pool.householdCount} households joined</p>
        <div className="useby-pool-stats">
          <span><strong>{formatMoney(estimatedPoolSaving(pool))}</strong> Est. savings</span>
          <span><strong>{pool.thresholdQuantity}</strong> Pool target</span>
        </div>
      </div>
      <Visual src={visualFor(title, "groceries")} label="" className="useby-featured-visual" decorative />
      <PoolCommitButton pool={pool} onRefresh={onRefresh} />
    </section>
  );
}

function PoolMiniCard({ pool, onRefresh }: { pool: DemandPool; onRefresh: () => Promise<void> }) {
  const progress = poolProgress(pool);
  const title = consumerTitle(pool.title);
  return (
    <article className="useby-pool-mini">
      <Visual src={visualFor(title, "pantry")} label="" className="useby-pool-thumb" decorative />
      <h3>{title}</h3>
      <p>{pickupAreaCopy(pool)} - {pool.householdCount} joined</p>
      <div className="useby-mini-progress"><span style={{ width: `${progress}%` }} /></div>
      <div className="useby-meta-row">
        <span>{formatPoolStatus(pool.status)}</span>
        <span>{formatPoolDate(pool.closesAt)}</span>
      </div>
      <PoolCommitButton pool={pool} onRefresh={onRefresh} small />
    </article>
  );
}

function PoolCommitButton({ pool, onRefresh, small = false }: { pool: DemandPool; onRefresh: () => Promise<void>; small?: boolean }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DemandPoolMutationResult | null>(null);
  async function commit() {
    setPending(true);
    const next = await submitDemandPoolCommitment(window.fetch.bind(window), {
      poolId: pool.id,
      quantity: "1",
      maxPrice: String((pool.maxPriceCents ?? 1200) / 100),
    });
    setResult(next);
    if (next.status === "ok") {
      await onRefresh();
    }
    setPending(false);
  }
  return (
    <div className={small ? "useby-inline-action" : "useby-featured-action"}>
      <button className="useby-button" disabled={pending} onClick={() => void commit()} type="button">
        {pending ? "Joining" : pool.currentUserCommitment ? "Update pool" : "Join pool"}<ArrowIcon />
      </button>
      {result && result.status !== "ok" ? <small>{result.message}</small> : null}
    </div>
  );
}

function DropCard({ drop, onRefresh }: { drop: StoreDrop; onRefresh: () => Promise<void> }) {
  const [quantity, setQuantity] = useState("1");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<StoreDropMutationResult | null>(null);
  const reservable = canReserveDrop(drop);
  const title = consumerTitle(drop.title);

  async function reserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const next = await submitStoreDropReservation(window.fetch.bind(window), { dropId: drop.id, quantity });
    setResult(next);
    if (next.status === "ok") {
      await onRefresh();
    }
    setPending(false);
  }

  return (
    <article className="useby-drop-card">
      <Visual src={visualFor(title, "brunch")} label="" className="useby-drop-image" decorative />
      <div>
        <span className="useby-featured-label">{formatDropStatus(drop.status)}</span>
        <h2>{title}</h2>
        <p>{drop.merchantDisplayName} - {drop.coarsePickupArea ?? "Coarse area only"}</p>
        <div className="useby-meta-row">
          <span>{remainingCopy(drop)}</span>
          <span>{pickupWindowLabel(drop)}</span>
          <span>{formatDropPrice(drop)}</span>
        </div>
      </div>
      <form className="useby-reserve-form" onSubmit={reserve}>
        <input aria-label={`Quantity for ${title}`} min="1" onChange={(event) => setQuantity(event.target.value)} type="number" value={quantity} />
        <button className="useby-button" disabled={!reservable || pending} type="submit">
          {pending ? "Reserving" : "Reserve"}<ArrowIcon />
        </button>
        {!reservable ? <small>This drop is not reservable in the current live state.</small> : null}
        {result && result.status !== "ok" ? <small>{result.message}</small> : null}
      </form>
    </article>
  );
}

function BookingActivityCard({ booking }: { booking: Booking }) {
  const itemName = consumerTitle(booking.item.name);
  return (
    <article className="useby-activity-card">
      <Visual src={visualFor(itemName, "herbs")} label="" className="useby-activity-image" decorative />
      <div>
        <span>{formatStatus(booking.status)}</span>
        <h3>{itemName}</h3>
        <p>{partyLabel(booking.owner)} to {partyLabel(booking.receiver)}</p>
        <p>{booking.locationLabel ?? booking.owner.coarseLocation ?? "Coarse location only"} - {booking.distanceLabel ?? "Approximate distance"}</p>
      </div>
      <Link className="useby-soft-button" href={`/bookings/${encodeURIComponent(booking.id)}`}>Open</Link>
    </article>
  );
}

function LendingActivityCard({ request }: { request: LendingRequest }) {
  return (
    <article className="useby-activity-card">
      <Visual src={visualFor(request.item.title, request.item.category === "fashion" ? "dress" : "tools")} label="" className="useby-activity-image" decorative />
      <div>
        <span>{formatLendingStatus(request.status)}</span>
        <h3>{request.item.title}</h3>
        <p>{formatLendingDate(request.borrowWindowStart ?? "")} to {formatLendingDate(request.borrowWindowEnd ?? "")}</p>
        <p>{partyLabel(request.owner)} to {partyLabel(request.borrower)}</p>
      </div>
    </article>
  );
}

function LendingListingCard({ listing, compact = false }: { listing: LendingListing; compact?: boolean }) {
  const [input, setInput] = useState({ borrowWindowStart: "", borrowWindowEnd: "", note: "" });
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<LendingMutationResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const next = await requestLending(window.fetch.bind(window), { listingId: listing.id, ...input });
    setResult(next);
    if (next.status === "ok") {
      setInput({ borrowWindowStart: "", borrowWindowEnd: "", note: "" });
    }
    setPending(false);
  }

  return (
    <article className={compact ? "useby-product-card" : "useby-lending-card"}>
      <Visual src={visualFor(listing.title, listing.category === "fashion" ? "dress" : "tools")} label="" className={compact ? "useby-product-image" : "useby-opportunity-image"} decorative />
      <h3>{listing.title}</h3>
      <p>{listing.size ?? listing.condition ?? listing.availabilityLabel}</p>
      <span className="useby-status-dot useby-status-fresh">{formatLendingStatus(listing.status)}</span>
      {!compact ? (
        <form className="useby-lending-form" onSubmit={submit}>
          <input aria-label={`Borrow start for ${listing.title}`} onChange={(event) => setInput({ ...input, borrowWindowStart: event.target.value })} type="datetime-local" value={input.borrowWindowStart} />
          <input aria-label={`Borrow end for ${listing.title}`} onChange={(event) => setInput({ ...input, borrowWindowEnd: event.target.value })} type="datetime-local" value={input.borrowWindowEnd} />
          <button className="useby-button" disabled={pending || !input.borrowWindowStart || !input.borrowWindowEnd} type="submit">
            {pending ? "Requesting" : "Request"}<ArrowIcon />
          </button>
          {result && result.status !== "ok" ? <small>{result.message}</small> : null}
        </form>
      ) : <Link className="useby-button useby-button-gold" href="/lending">List item<ArrowIcon /></Link>}
    </article>
  );
}

function LiveStateNotice({ states }: { states: Array<LoadState<unknown>> }) {
  const hasError = states.some((state) => state.error);
  if (!hasError) {
    return null;
  }
  return <EmptyConsumerState title="Some live data is unavailable" detail="The customer UI is still usable; affected cards stay empty until their routes respond." />;
}

function EmptyConsumerState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="useby-empty-state">
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  );
}

function LargeSkeleton() {
  return <div className="useby-large-skeleton" aria-label="Loading live pool" />;
}

function TabButton({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button aria-selected={active} className={active ? "is-active" : ""} onClick={onClick} role="tab" type="button">
      {children}
    </button>
  );
}

function Visual({ src, label, className, decorative = false }: { src: string; label: string; className: string; decorative?: boolean }) {
  return (
    <div aria-hidden={decorative ? "true" : undefined} aria-label={decorative ? undefined : label} className={`useby-visual ${className}`} role={decorative ? undefined : "img"} style={{ backgroundImage: `url(${src})` }} />
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

function buildTodayCards(actions: GroceryActionCard[], inventory: GroceryInventoryItem[], matches: GroceryMatch[], pools: DemandPool[], drops: StoreDrop[]) {
  const actionDerived = actions.slice(0, 2).map((card) => ({
    title: consumerActionTitle(card),
    body: card.itemName ? `${consumerTitle(card.itemName)}. ${card.body}` : card.body,
    cta: card.type.includes("share") ? "Offer nearby" : "See meal ideas",
    href: card.type.includes("share") ? "/grocery#matches" : "/grocery",
    visual: visualFor(`${card.title} ${card.itemName ?? ""}`, "groceries"),
    tone: card.type.includes("share") ? "coral" : "green",
  }));
  const useSoon = inventory.find((item) => ["today", "use_soon", "watch"].includes(item.expiryBand));
  const pool = pools[0];
  const drop = drops.find((candidate) => canReserveDrop(candidate));
  return [
    ...actionDerived,
    useSoon ? { title: `Use ${consumerTitle(useSoon.name)} soon`, body: `${formatQuantity(useSoon.quantity)} ${useSoon.unit} is ready for tonight.`, cta: "Cook", href: "/grocery", visual: visualFor(useSoon.name, "groceries"), tone: "green" } : null,
    matches[0] ? { title: "Share before Friday", body: `${consumerTitle(matches[0].itemName)} has a nearby match.`, cta: "Offer nearby", href: "/grocery#matches", visual: visualFor(matches[0].itemName, "herbs"), tone: "coral" } : null,
    pool ? { title: "Join a local deal", body: consumerTitle(pool.title), cta: "View pool", href: "/pools", visual: visualFor(pool.title, "groceries"), tone: "green" } : null,
    drop ? { title: "Pick up surplus", body: `${drop.merchantDisplayName} has ${consumerTitle(drop.title).toLowerCase()}.`, cta: "Reserve", href: "/drops", visual: visualFor(drop.title, "brunch"), tone: "gold" } : null,
    { title: "Lend this weekend", body: "Wardrobe and household items can build trust nearby.", cta: "List item", href: "/lending", visual: visuals.dress, tone: "gold" },
  ].filter(Boolean) as Array<{ title: string; body: string; cta: string; href: string; visual: string; tone: string }>;
}

function buildNearbyOpportunities(matches: GroceryMatch[], pools: DemandPool[], drops: StoreDrop[]) {
  return [
    ...matches.map((match) => ({
      id: `match-${match.id}`,
      title: match.needTitle,
      detail: match.rationale.replace(match.itemName, consumerTitle(match.itemName)),
      distance: formatDistance(match.distanceMeters),
      tag: "Food",
      visual: visualFor(match.itemName, "herbs"),
    })),
    ...pools.map((pool) => ({
      id: `pool-${pool.id}`,
      title: consumerTitle(pool.title),
      detail: `${pool.householdCount} households joined.`,
      distance: pickupAreaCopy(pool),
      tag: "Deal",
      visual: visualFor(pool.title, "groceries"),
    })),
    ...drops.map((drop) => ({
      id: `drop-${drop.id}`,
      title: consumerTitle(drop.title),
      detail: drop.merchantDisplayName,
      distance: drop.coarsePickupArea ?? "Coarse area",
      tag: "Drop",
      visual: visualFor(drop.title, "brunch"),
    })),
  ];
}

function consumerActionTitle(card: GroceryActionCard) {
  const lower = `${card.type} ${card.title}`.toLowerCase();
  if (lower.includes("share")) return "Share before Friday";
  if (lower.includes("freeze")) return "Freeze for later";
  if (lower.includes("label")) return "Add a label";
  return card.title;
}

function estimateSavings(pools: DemandPool[], drops: StoreDrop[]) {
  const poolSaving = pools.reduce((sum, pool) => sum + estimatedPoolSaving(pool), 0);
  const dropSaving = drops.filter((drop) => canReserveDrop(drop)).length * 600;
  return formatMoney(poolSaving + dropSaving);
}

function estimatedPoolSaving(pool: DemandPool) {
  const base = pool.maxPriceCents ?? 1200;
  return Math.max(300, Math.round(base * 0.18));
}

function visualFor(value: string, fallback: keyof typeof visuals) {
  const lower = value.toLowerCase();
  if (lower.includes("dress") || lower.includes("wardrobe") || lower.includes("fashion")) return visuals.dress;
  if (lower.includes("tool") || lower.includes("drill") || lower.includes("ladder") || lower.includes("household")) return visuals.tools;
  if (lower.includes("yogurt") || lower.includes("yoghurt")) return visuals.yogurt;
  if (lower.includes("herb") || lower.includes("coriander") || lower.includes("wrap")) return visuals.herbs;
  if (lower.includes("pantry") || lower.includes("staple")) return visuals.pantry;
  if (lower.includes("brunch") || lower.includes("bread") || lower.includes("egg")) return visuals.brunch;
  if (lower.includes("apple")) return visuals.apples;
  return visuals[fallback];
}

function expiryLabel(value: GroceryInventoryItem["expiryBand"]) {
  if (value === "expired" || value === "today" || value === "use_soon") return "Use soon";
  if (value === "watch") return "Watch";
  if (value === "fresh") return "Good";
  return "Add date";
}

function consumerTitle(value: string) {
  const cleaned = value
    .replace(/\byoghourt\b/gi, "yoghurt")
    .replace(/\bfinal\s+smoke\b/gi, "")
    .replace(/\b\d{8,}\b/g, "")
    .replace(/\b\d+(?:\.\d+)?\s?(?:g|kg|ml|l|cl|oz|lb|pk|pack|x)\b/gi, "")
    .replace(/\b\d+\s?(?:pack|pk)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned) {
    return "Item";
  }

  if (cleaned === cleaned.toUpperCase()) {
    return titleCase(cleaned.toLowerCase());
  }

  return cleaned.replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

function titleCase(value: string) {
  return value.replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

function formatQuantity(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  if (Number.isInteger(parsed)) {
    return String(parsed);
  }

  return parsed.toFixed(2).replace(/\.?0+$/, "");
}

function formatDistance(value: number | null) {
  if (value === null) return "Coarse area";
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km away` : `${Math.round(value)} m away`;
}

function formatLabel(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function daysUntil(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function itemList(items: DemandPool["items"]) {
  return items.length > 0 ? items.map((item) => item.name).join(", ") : null;
}

function pickupAreaCopy(pool: DemandPool) {
  if (pool.pickupAreaLabel) return pool.pickupAreaLabel;
  if (pool.pickupRadiusMeters) return `within ${(pool.pickupRadiusMeters / 1000).toFixed(1)} km`;
  return "Riverside Quarter";
}

function remainingCopy(drop: StoreDrop) {
  if (drop.remainingQuantity === null) return "Quantity not returned";
  return `${drop.remainingQuantity} of ${drop.totalQuantity ?? "?"} left`;
}

function partyLabel(party: { label: string; coarseLocation: string | null; trustLabel: string | null }) {
  return [party.label, party.coarseLocation, party.trustLabel].filter(Boolean).join(" - ");
}

function matchesQuery(value: string, query: string) {
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

function liveUnavailableCopy(status: string | undefined) {
  if (status === "available" || status === "partial") return "Try a different filter or add an item from the live controls below.";
  return "Live rows are not available for this surface right now, so UseBy is showing an honest empty state.";
}
