"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  endpointSummary,
  loadGrocerySnapshot,
  submitExpiryEdit,
  submitManualGrocery,
} from "../../lib/grocery/api";
import type {
  ExpiryEditInput,
  GroceryActionCard,
  GroceryEndpointState,
  GroceryInventoryItem,
  GroceryMatch,
  GroceryMutationResult,
  GrocerySnapshot,
  ManualGroceryInput,
  SafetyStatus,
  StorageState,
} from "../../lib/grocery/types";

type WorkspaceMode = "home" | "page";

const storageOptions: StorageState[] = ["sealed", "opened", "fridge", "freezer", "cupboard", "cooked"];
const safetyOptions: SafetyStatus[] = ["eligible", "restricted", "blocked", "unknown"];

const statusClasses = {
  available: "border-emerald-200 bg-emerald-50 text-emerald-800",
  partial: "border-amber-200 bg-amber-50 text-amber-800",
  unavailable: "border-stone-200 bg-stone-100 text-stone-700",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  unknown: "border-slate-200 bg-slate-50 text-slate-700",
};

const expiryBandLabels: Record<GroceryInventoryItem["expiryBand"], string> = {
  expired: "Expired",
  today: "Use today",
  use_soon: "Use soon",
  watch: "Watch",
  fresh: "Fresh",
  unknown: "Unknown",
};

const expiryBandClasses: Record<GroceryInventoryItem["expiryBand"], string> = {
  expired: "border-rose-200 bg-rose-50 text-rose-800",
  today: "border-orange-200 bg-orange-50 text-orange-800",
  use_soon: "border-amber-200 bg-amber-50 text-amber-800",
  watch: "border-sky-200 bg-sky-50 text-sky-800",
  fresh: "border-emerald-200 bg-emerald-50 text-emerald-800",
  unknown: "border-stone-200 bg-stone-100 text-stone-700",
};

const safetyCopy: Record<string, string> = {
  eligible: "Eligible for neighbour matching only when package state allows it.",
  restricted: "Keep private; the backend should not produce share matches.",
  blocked: "Blocked from sharing and matching.",
  unknown: "Needs a label or safety review before sharing.",
};

const defaultManualInput: ManualGroceryInput = {
  itemName: "",
  quantity: "1",
  unit: "each",
  storageState: "cupboard",
  expiryDate: "",
  receiptLines: "",
};

export function GroceryWorkspace({ mode = "page" }: { mode?: WorkspaceMode }) {
  const [snapshot, setSnapshot] = useState<GrocerySnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationResult, setMutationResult] = useState<GroceryMutationResult | null>(null);
  const [manualInput, setManualInput] = useState<ManualGroceryInput>(defaultManualInput);
  const [expiryEdit, setExpiryEdit] = useState<ExpiryEditInput>({
    itemId: "",
    storageState: "cupboard",
    expiryDate: "",
    safetyStatus: "unknown",
  });
  const [isSubmittingImport, setIsSubmittingImport] = useState(false);
  const [isSubmittingExpiry, setIsSubmittingExpiry] = useState(false);

  async function refresh() {
    if (typeof window.fetch !== "function") {
      setSnapshot(unavailableSnapshot("Browser fetch is unavailable in this environment."));
      setIsLoading(false);
      return;
    }

    setIsRefreshing(true);
    setLoadError(null);

    try {
      const nextSnapshot = await loadGrocerySnapshot(window.fetch.bind(window));
      setSnapshot(nextSnapshot);
      setExpiryEdit((current) => hydrateExpiryEdit(current, nextSnapshot.inventory));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Grocery state refresh failed.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      if (typeof window.fetch !== "function") {
        if (!cancelled) {
          setSnapshot(unavailableSnapshot("Browser fetch is unavailable in this environment."));
          setIsLoading(false);
        }
        return;
      }

      try {
        const nextSnapshot = await loadGrocerySnapshot(window.fetch.bind(window));
        if (!cancelled) {
          setSnapshot(nextSnapshot);
          setExpiryEdit((current) => hydrateExpiryEdit(current, nextSnapshot.inventory));
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Grocery state refresh failed.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadInitial();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleImportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmittingImport(true);
    setMutationResult(null);

    const result = await submitManualGrocery(window.fetch.bind(window), manualInput);
    setMutationResult(result);
    if (result.status === "ok") {
      setManualInput(defaultManualInput);
      await refresh();
    }

    setIsSubmittingImport(false);
  }

  async function handleExpirySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expiryEdit.itemId) {
      setMutationResult({
        status: "error",
        endpoint: "/api/grocery/expiry",
        httpStatus: null,
        message: "Choose an inventory item before saving a label edit.",
      });
      return;
    }

    setIsSubmittingExpiry(true);
    setMutationResult(null);

    const result = await submitExpiryEdit(window.fetch.bind(window), expiryEdit);
    setMutationResult(result);
    if (result.status === "ok") {
      await refresh();
    }

    setIsSubmittingExpiry(false);
  }

  const counts = useMemo(
    () => ({
      inventory: snapshot?.inventory.length ?? 0,
      actions: snapshot?.actionCards.length ?? 0,
      matches: snapshot?.matches.length ?? 0,
    }),
    [snapshot],
  );

  return (
    <div className="useby-grocery-root space-y-5">
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .useby-grocery-root *,
          .useby-grocery-root *::before,
          .useby-grocery-root *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
      <section className="rounded-lg border border-[#d2dbc9] bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e2e8dc] px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-[#65715f]">Home Shelf</p>
            <h1 className="mt-1 text-2xl font-semibold leading-tight text-[#17231c] sm:text-3xl">
              Grocery inventory and neighbour actions
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#566250]">
              Live rows appear here when Checkpoint 2 grocery routes are installed. Missing routes stay marked unavailable.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={snapshot?.status ?? (isLoading ? "partial" : "error")} />
            <button
              className="min-h-11 rounded-md border border-[#b7c2af] px-3 py-2 text-sm font-semibold text-[#315b44] transition hover:border-[#315b44] hover:bg-[#f6f8f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b44] disabled:cursor-wait disabled:opacity-60"
              disabled={isRefreshing}
              onClick={() => void refresh()}
              type="button"
            >
              {isRefreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="grid gap-0 divide-y divide-[#edf1e8] md:grid-cols-4 md:divide-x md:divide-y-0">
          <Metric label="Route state" value={endpointSummary(snapshot)} />
          <Metric label="Inventory" value={String(counts.inventory)} />
          <Metric label="Action cards" value={String(counts.actions)} />
          <Metric label="Matches" value={String(counts.matches)} />
        </div>
      </section>

      {loadError ? <Notice status="error" title="Grocery refresh failed" detail={loadError} /> : null}
      {mutationResult ? (
        <Notice
          status={mutationResult.status}
          title={mutationResult.status === "ok" ? "Saved through live route" : "Live route did not complete"}
          detail={`${mutationResult.endpoint}${mutationResult.httpStatus ? ` returned HTTP ${mutationResult.httpStatus}` : ""}. ${mutationResult.message}`}
        />
      ) : null}

      {isLoading && !snapshot ? <LoadingGrid /> : null}

      {!isLoading && snapshot ? (
        <>
          <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
            <InventoryPanel inventory={snapshot.inventory} />
            <div className="grid gap-5">
              <ImportPanel
                input={manualInput}
                isSubmitting={isSubmittingImport}
                onChange={setManualInput}
                onSubmit={handleImportSubmit}
              />
              <ExpiryEditPanel
                edit={expiryEdit}
                inventory={snapshot.inventory}
                isSubmitting={isSubmittingExpiry}
                onChange={setExpiryEdit}
                onSubmit={handleExpirySubmit}
              />
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
            <ActionCardsPanel cards={snapshot.actionCards} />
            <MatchesPanel matches={snapshot.matches} />
          </section>

          <EndpointPanel endpoints={snapshot.endpoints} mode={mode} />
        </>
      ) : null}
    </div>
  );
}

function unavailableSnapshot(message: string): GrocerySnapshot {
  return {
    status: "unavailable",
    checkedAt: new Date().toISOString(),
    inventory: [],
    actionCards: [],
    matches: [],
    endpoints: [
      {
        endpoint: "/api/grocery/shelf",
        status: "unavailable",
        httpStatus: null,
        message,
      },
    ],
    message,
  };
}

function hydrateExpiryEdit(current: ExpiryEditInput, inventory: GroceryInventoryItem[]): ExpiryEditInput {
  if (current.itemId && inventory.some((item) => item.id === current.itemId)) {
    return current;
  }

  const firstItem = inventory[0];
  if (!firstItem) {
    return current;
  }

  return {
    itemId: firstItem.id,
    storageState: isStorageState(firstItem.storageState) ? firstItem.storageState : "cupboard",
    expiryDate: firstItem.expiryDate ?? "",
    safetyStatus: isSafetyStatus(firstItem.safetyStatus) ? firstItem.safetyStatus : "unknown",
  };
}

function isStorageState(value: string): value is StorageState {
  return storageOptions.includes(value as StorageState);
}

function isSafetyStatus(value: string): value is SafetyStatus {
  return safetyOptions.includes(value as SafetyStatus);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-4 sm:px-5">
      <p className="text-xs font-semibold uppercase text-[#65715f]">{label}</p>
      <p className="mt-2 break-words font-mono text-xl font-semibold text-[#17231c]">{value}</p>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {[0, 1, 2, 3].map((index) => (
        <Panel key={index}>
          <div className="h-4 w-36 animate-pulse rounded bg-[#e4e9de]" />
          <div className="mt-5 space-y-3">
            <div className="h-12 animate-pulse rounded bg-[#eef2e8]" />
            <div className="h-12 animate-pulse rounded bg-[#eef2e8]" />
            <div className="h-12 animate-pulse rounded bg-[#eef2e8]" />
          </div>
        </Panel>
      ))}
    </div>
  );
}

function InventoryPanel({ inventory }: { inventory: GroceryInventoryItem[] }) {
  return (
    <Panel className="p-0">
      <PanelHeader
        label="Inventory"
        title="Current grocery shelf"
        detail="Expiry bands combine backend output with visible date fields when present."
      />
      {inventory.length === 0 ? (
        <EmptyState
          title="No grocery inventory returned"
          detail="The shelf will populate from live item rows after the inventory route and demo household context are installed."
        />
      ) : (
        <div className="divide-y divide-[#edf1e8]">
          {inventory.map((item) => (
            <article key={item.id} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-words text-base font-semibold text-[#17231c]">{item.name}</h2>
                  <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${expiryBandClasses[item.expiryBand]}`}>
                    {expiryBandLabels[item.expiryBand]}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#566250]">
                  {item.quantity} {item.unit} · {formatLabel(item.storageState)} · {formatLabel(item.itemState)}
                </p>
                {item.detail ? <p className="mt-2 text-sm leading-6 text-[#65715f]">{item.detail}</p> : null}
              </div>
              <div className="grid gap-2 text-sm">
                <Fact label="Expiry" value={item.expiryDate ? `${item.expiryDate} (${item.expirySource})` : "No label date"} />
                <Fact label="Confidence" value={formatConfidence(item.expiryConfidence)} />
                <Fact label="Safety" value={formatLabel(item.safetyStatus)} />
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ImportPanel({
  input,
  isSubmitting,
  onChange,
  onSubmit,
}: {
  input: ManualGroceryInput;
  isSubmitting: boolean;
  onChange: (input: ManualGroceryInput) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Panel>
      <FormHeader label="Import" title="Receipt or manual grocery input" />
      <form className="mt-4 grid gap-4" onSubmit={onSubmit}>
        <label className="grid gap-2 text-sm font-semibold text-[#17231c]">
          Receipt lines
          <textarea
            className="min-h-24 rounded-md border border-[#cbd5c2] bg-white px-3 py-2 text-sm font-normal leading-6 text-[#17231c] outline-none transition placeholder:text-[#8a9584] focus:border-[#315b44] focus:ring-2 focus:ring-[#315b44]/15"
            onChange={(event) => onChange({ ...input, receiptLines: event.target.value })}
            placeholder="BABY SPINACH 200G&#10;TORTILLA WRAPS 8PK"
            value={input.receiptLines}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_100px_100px]">
          <TextInput
            label="Item"
            onChange={(value) => onChange({ ...input, itemName: value })}
            placeholder="Greek yoghurt"
            value={input.itemName}
          />
          <TextInput
            label="Qty"
            onChange={(value) => onChange({ ...input, quantity: value })}
            value={input.quantity}
          />
          <TextInput
            label="Unit"
            onChange={(value) => onChange({ ...input, unit: value })}
            value={input.unit}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SelectInput
            label="Storage"
            onChange={(value) => onChange({ ...input, storageState: value as StorageState })}
            options={storageOptions}
            value={input.storageState}
          />
          <TextInput
            label="Label date"
            onChange={(value) => onChange({ ...input, expiryDate: value })}
            type="date"
            value={input.expiryDate}
          />
        </div>

        <button
          className="min-h-11 rounded-md bg-[#315b44] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#254635] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b44] disabled:cursor-wait disabled:opacity-60"
          disabled={isSubmitting || (!input.itemName.trim() && !input.receiptLines.trim())}
          type="submit"
        >
          {isSubmitting ? "Importing" : "Import groceries"}
        </button>
      </form>
    </Panel>
  );
}

function ExpiryEditPanel({
  edit,
  inventory,
  isSubmitting,
  onChange,
  onSubmit,
}: {
  edit: ExpiryEditInput;
  inventory: GroceryInventoryItem[];
  isSubmitting: boolean;
  onChange: (input: ExpiryEditInput) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Panel>
      <FormHeader label="Label edit" title="Expiry and storage update" />
      <form className="mt-4 grid gap-4" onSubmit={onSubmit}>
        <label className="grid gap-2 text-sm font-semibold text-[#17231c]">
          Item
          <select
            className="min-h-11 rounded-md border border-[#cbd5c2] bg-white px-3 py-2 text-sm font-normal text-[#17231c] outline-none transition focus:border-[#315b44] focus:ring-2 focus:ring-[#315b44]/15"
            disabled={inventory.length === 0}
            onChange={(event) => {
              const item = inventory.find((candidate) => candidate.id === event.target.value);
              onChange({
                ...edit,
                itemId: event.target.value,
                storageState: item && isStorageState(item.storageState) ? item.storageState : edit.storageState,
                safetyStatus: item && isSafetyStatus(item.safetyStatus) ? item.safetyStatus : edit.safetyStatus,
                expiryDate: item?.expiryDate ?? edit.expiryDate,
              });
            }}
            value={edit.itemId}
          >
            {inventory.length === 0 ? <option value="">No items available</option> : null}
            {inventory.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput
            label="Label date"
            onChange={(value) => onChange({ ...edit, expiryDate: value })}
            type="date"
            value={edit.expiryDate}
          />
          <SelectInput
            label="Storage"
            onChange={(value) => onChange({ ...edit, storageState: value as StorageState })}
            options={storageOptions}
            value={edit.storageState}
          />
        </div>

        <SelectInput
          label="Safety status"
          onChange={(value) => onChange({ ...edit, safetyStatus: value as SafetyStatus })}
          options={safetyOptions}
          value={edit.safetyStatus}
        />
        <p className="text-sm leading-6 text-[#65715f]">{safetyCopy[edit.safetyStatus]}</p>

        <button
          className="min-h-11 rounded-md border border-[#315b44] px-4 py-2 text-sm font-semibold text-[#315b44] transition hover:bg-[#315b44] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#315b44] disabled:cursor-wait disabled:opacity-60"
          disabled={isSubmitting || inventory.length === 0}
          type="submit"
        >
          {isSubmitting ? "Saving" : "Save label edit"}
        </button>
      </form>
    </Panel>
  );
}

function ActionCardsPanel({ cards }: { cards: GroceryActionCard[] }) {
  return (
    <Panel className="p-0">
      <PanelHeader
        label="Actions"
        title="Computed action cards"
        detail="Cards must come from the action engine, not seeded final output."
      />
      {cards.length === 0 ? (
        <EmptyState
          title="No action cards returned"
          detail="Use-first, scan-label, and share-sealed cards will appear after the action-card route computes them from live rows."
        />
      ) : (
        <div className="divide-y divide-[#edf1e8]">
          {cards.map((card) => (
            <article key={card.id} className="px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-[#65715f]">{formatLabel(card.type)}</p>
                  <h2 className="mt-1 break-words text-lg font-semibold leading-snug text-[#17231c]">{card.title}</h2>
                </div>
                <span className="rounded-md border border-[#dbe4d2] bg-[#fbfcf7] px-2 py-1 text-xs font-semibold text-[#315b44]">
                  {formatLabel(card.priority)}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#566250]">{card.body}</p>
              <p className="mt-3 rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-3 py-2 text-sm leading-6 text-[#566250]">
                {card.rationale}
              </p>
              <p className="mt-3 text-xs font-semibold uppercase text-[#65715f]">
                Safety: {formatLabel(card.safetyStatus)}
                {card.itemName ? ` · ${card.itemName}` : ""}
              </p>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function MatchesPanel({ matches }: { matches: GroceryMatch[] }) {
  return (
    <Panel className="p-0">
      <PanelHeader
        label="Matches"
        title="Neighbour food matches"
        detail="Public UI should show coarse distance and rationale, never exact household coordinates."
      />
      {matches.length === 0 ? (
        <EmptyState
          title="No matches returned"
          detail="Eligible sealed items and open nearby needs will show here after the matching route writes current match rows."
        />
      ) : (
        <div className="divide-y divide-[#edf1e8]">
          {matches.map((match) => (
            <article key={match.id} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_180px]">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-[#65715f]">{formatLabel(match.status)}</p>
                <h2 className="mt-1 break-words text-lg font-semibold leading-snug text-[#17231c]">
                  {match.itemName} for {match.needTitle}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#566250]">{match.rationale}</p>
                <p className="mt-3 text-sm leading-6 text-[#65715f]">
                  Safety status: {formatLabel(match.safetyStatus)}. Food sharing remains blocked unless backend eligibility allows it.
                </p>
              </div>
              <div className="grid content-start gap-2">
                <Fact label="Distance" value={formatDistance(match.distanceMeters)} />
                <Fact label="Score" value={formatScore(match.score)} />
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

function EndpointPanel({ endpoints, mode }: { endpoints: GroceryEndpointState[]; mode: WorkspaceMode }) {
  return (
    <Panel className={mode === "home" ? "p-0" : "p-0"}>
      <PanelHeader
        label="API readiness"
        title="Grocery route checks"
        detail="UI diagnosis starts with route registration and discovery before runtime details."
      />
      <div className="divide-y divide-[#edf1e8]">
        {endpoints.map((endpoint) => (
          <div key={endpoint.endpoint} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center sm:px-5">
            <div className="min-w-0">
              <p className="break-words font-mono text-sm font-semibold text-[#17231c]">{endpoint.endpoint}</p>
              <p className="mt-1 text-sm leading-6 text-[#65715f]">
                {endpoint.httpStatus ? `HTTP ${endpoint.httpStatus}` : "No HTTP response"} · {endpoint.message}
              </p>
            </div>
            <StatusPill status={endpoint.status} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-[#d2dbc9] bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {children}
    </section>
  );
}

function PanelHeader({
  label,
  title,
  detail,
}: {
  label: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="border-b border-[#edf1e8] px-4 py-4 sm:px-5">
      <p className="text-xs font-semibold uppercase text-[#65715f]">{label}</p>
      <h2 className="mt-1 text-xl font-semibold leading-tight text-[#17231c]">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#65715f]">{detail}</p>
    </div>
  );
}

function FormHeader({ label, title }: { label: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-[#65715f]">{label}</p>
      <h2 className="mt-1 text-xl font-semibold leading-tight text-[#17231c]">{title}</h2>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const label = status === "available" || status === "ok"
    ? "Live"
    : status === "partial"
      ? "Partial"
      : status === "unavailable"
        ? "Unavailable"
        : status === "error"
          ? "Error"
          : "Checking";
  const statusClass = statusClasses[status as keyof typeof statusClasses] ?? statusClasses.unknown;

  return (
    <span className={`inline-flex min-h-8 items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
      {label}
    </span>
  );
}

function Notice({
  status,
  title,
  detail,
}: {
  status: "ok" | "unavailable" | "error" | string;
  title: string;
  detail: string;
}) {
  const statusClass = statusClasses[status as keyof typeof statusClasses] ?? statusClasses.unknown;

  return (
    <div className={`rounded-lg border px-4 py-3 ${statusClass}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6">{detail}</p>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-4 py-8 sm:px-5">
      <p className="font-semibold text-[#17231c]">{title}</p>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#65715f]">{detail}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#e3e8dc] bg-[#fbfcf7] px-3 py-2">
      <p className="text-xs font-semibold uppercase text-[#65715f]">{label}</p>
      <p className="mt-1 break-words font-mono text-sm font-semibold text-[#17231c]">{value}</p>
    </div>
  );
}

function TextInput({
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#17231c]">
      {label}
      <input
        className="min-h-11 min-w-0 rounded-md border border-[#cbd5c2] bg-white px-3 py-2 text-sm font-normal text-[#17231c] outline-none transition placeholder:text-[#8a9584] focus:border-[#315b44] focus:ring-2 focus:ring-[#315b44]/15"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

function SelectInput({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#17231c]">
      {label}
      <select
        className="min-h-11 rounded-md border border-[#cbd5c2] bg-white px-3 py-2 text-sm font-normal text-[#17231c] outline-none transition focus:border-[#315b44] focus:ring-2 focus:ring-[#315b44]/15"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {formatLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatConfidence(value: number | null): string {
  if (value === null) {
    return "Not returned";
  }

  const normalized = value > 1 ? value / 100 : value;
  return `${Math.round(normalized * 100)}%`;
}

function formatDistance(value: number | null): string {
  if (value === null) {
    return "Coarse only";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} km`;
  }

  return `${Math.round(value)} m`;
}

function formatScore(value: number | null): string {
  if (value === null) {
    return "Not returned";
  }

  const normalized = value > 1 ? value / 100 : value;
  return `${Math.round(normalized * 100)}%`;
}
