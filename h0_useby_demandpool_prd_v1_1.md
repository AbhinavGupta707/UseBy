# H0 Hackathon PRD — UseBy + DemandPool

**Track:** Track 1 — Monetizable B2C app, with possible Open Innovation angle  
**Working title:** UseBy  
**One-line pitch:** A neighbourhood household-liquidity app that turns private groceries, wardrobes, household items, and local demand into concrete actions: cook, share, borrow, rent, swap, group-buy, or buy from nearby merchants.  
**Demand module:** DemandPool — neighbourhood group-buying and merchant bidding for local shops  
**Primary AWS database:** Amazon Aurora PostgreSQL  
**Frontend/runtime:** Next.js PWA on Vercel, scaffolded/refined with v0  
**Document version:** 1.1  
**Prepared for:** H0: Hack the Zero Stack with Vercel v0 and AWS Databases  
**Geography posture:** Neutral seeded neighbourhood with fictional, substitutable local merchants  
**DemandPool posture:** Secondary module; the core thesis is household-resource optimisation and local economic action  

---

## 1. Hackathon-fit thesis

UseBy is designed to avoid the common B2C hackathon trap: a passive app that gives advice but takes no action. The product should behave like a local action engine.

The central product object is not a recipe, listing, outfit, or grocery deal. It is a **household inventory + intent graph**:

```text
what I have -> what expires / what is idle -> what I need -> who nearby can use it -> what local merchants can fulfil -> action / booking / handoff / purchase -> trust + learning
```

The H0 rules require a full-stack project using one of Aurora PostgreSQL, Aurora DSQL, or DynamoDB as the primary backend and a frontend deployed on Vercel or v0.app. The judging criteria reward database-aware architecture, full-stack UX, real-world impact, and originality. UseBy maps well because the database powers geospatial matching, expiry confidence, fit profiles, neighbourhood supply/demand, booking state, merchant bids, trust events, and recurring local liquidity.

### 1.1 Latest decisions and product thesis refinement

The current recommendation is to keep UseBy **geography-neutral** for the H0 demo. Use fictional neighbourhood and store names so the product can be understood in the UK, US, Europe, or elsewhere without being anchored to Tesco, Walmart, Target, or any single retail market.

The refined thesis is broader than food waste:

> UseBy optimises the resources already around you — groceries, clothes, tools, household goods, local merchant stock, and neighbour demand — so consumers get better value and small businesses get new demand opportunities.

That means the app should not feel like a charity food-sharing app or a secondhand marketplace clone. It should feel like a **local resource operating system** for improving quality of life: save money, access things nearby, waste less, earn from idle assets, and help local merchants compete with large retailers.

DemandPool should be a **secondary but important module**, not the main wow moment. The main demo should be the household inventory/intent graph creating immediate personal actions. DemandPool then expands the same graph into merchant opportunity: aggregated neighbourhood demand that local stores can bid to fulfil.

For H0 scoring, the key is to show that the back end is not a generic marketplace table. Aurora PostgreSQL/PostGIS should power inventory state, expiry confidence, intent matching, bookings, trust events, merchant bids, and pool fulfilment.

---

## 2. Product concept

UseBy is a neighbourhood economy for underused everyday assets.

It begins privately:

- What groceries do I have?
- What expires soon?
- What clothes could I rent out?
- What household items could I lend?
- What do I need this week?
- What would I buy if nearby stores offered a better bundle?

Then it turns that private context into safe, local actions:

- cook this tonight
- freeze this
- share sealed food with a neighbour
- rent your dress for Friday
- borrow a drill instead of buying one
- join a demand pool for groceries
- accept a local merchant bundle
- claim a store surplus drop

The key wedge is that UseBy is not “Olio + Vinted + Too Good To Go pasted together.” Existing apps generally start with explicit public listings or merchant surplus. UseBy starts with private household inventory and intent, then creates local liquidity when there is a match.

---

## 3. Market and pain context

UseBy sits at the intersection of four validated behaviours:

### 3.1 Food waste reduction

The UNEP Food Waste Index Report 2024 estimates 1.05B tonnes of food waste across retail, food service, and households in 2022, with households responsible for 631M tonnes. That is a massive consumer and sustainability problem.

Existing signal:

- Olio says it has over 8.5M users globally and has saved around 120M meals.
- Too Good To Go reported nearly 157M meals saved in 2025 according to coverage of its 2025 impact report.

### 3.2 Secondhand and rental fashion

Secondhand and rental behaviours are increasingly mainstream.

Existing signal:

- Vinted reported €10.8B GMV and €1.1B annual revenue in 2025.
- By Rotation presents itself as a large shared wardrobe, with over 1.5M rotators globally on its homepage and earlier materials showing strong peer-to-peer listings.

### 3.3 Local-business pressure

Large retailers capture a major share of grocery demand in most markets. Small local retailers often cannot compete on search, advertising, delivery logistics, app distribution, and bulk pricing. They need visible local demand rather than just footfall. UseBy gives them an actionable demand layer without requiring the demo to be country-specific.

### 3.4 Consumer cost pressure

Consumers want cheaper ways to access everyday goods and occasional-use items. UseBy does not ask them to become sustainability activists. The main value proposition is practical: save money, waste less, get things nearby, and earn from idle items.

---

## 4. Product positioning

### 4.1 Category

**Neighbourhood inventory-to-action marketplace.**

A consumer-facing product with marketplace mechanics, but not a generic feed.

### 4.2 Beachhead

Do not demo this as “the whole world’s circular economy.” That will feel too broad.

Best MVP beachheads:

1. university halls
2. dense London apartment blocks
3. parent communities
4. student neighbourhoods
5. coworking/residential communities
6. local high street pilot

For H0, simulate one dense neighbourhood with seeded users and local merchants.

### 4.3 Personas

| Persona | Pain | UseBy value |
|---|---|---|
| Student/shared-house resident | Food waste, outfit costs, lacks tools/household items | Share food, borrow items, rent outfits, save money |
| Young professional | Buys occasional-use fashion/items, limited storage | Rent locally, lend wardrobe, join grocery pools |
| Parent | Kids outgrow items, recurring household purchases | Swap/rent/lend items, group-buy staples |
| Local grocer/bakery | Competes with large retailers, surplus stock, uncertain demand | Demand visibility, bundle bids, local surplus drops |
| Charity/community organiser | Wants safe redistribution and community resilience | Trusted handoffs and local supply map |

---

## 5. Incumbents and wedge

### 5.1 Incumbents

| Category | Examples | What they do |
|---|---|---|
| Food sharing | Olio | People/businesses share surplus food and household items |
| Food surplus discount | Too Good To Go | Merchants sell surplus meals/bags |
| Secondhand resale | Vinted, Depop | People sell used goods/clothes |
| Fashion rental | By Rotation, HURR, Hirestreet | Users rent fashion items |
| Grocery delivery | Tesco, Walmart, Instacart, Getir-like models | Retailer/aggregator-led grocery fulfilment |
| Group buying | Groupon, Costco-like economics, community buying clubs | Discounts through aggregated demand or membership |

### 5.2 UseBy wedge

UseBy's distinctive product logic:

1. **Private inventory first** — users do not have to manually create listings from scratch.
2. **Intent graph** — the app knows what people need before listings exist.
3. **Action cards** — UI says what to do now, not “browse a marketplace.”
4. **Cross-category household liquidity** — groceries, wardrobe, household items, and merchant demand in one neighbourhood graph.
5. **Local business demand pool** — consumers aggregate demand, merchants bid to fulfil, shifting some buying power away from large retailers.
6. **Expiry/fit/trust-aware matching** — not just distance and price.

---

## 6. Product principles

1. **Do not create admin work.** The app should not feel like inventory bookkeeping.
2. **Never pretend precision.** Food expiry is uncertain unless scanned from a label or encoded data; show confidence bands.
3. **Act locally.** Neighbourhood density matters more than global reach in MVP.
4. **Safety first for food.** Restrict MVP sharing to sealed packaged goods or merchant surplus. Avoid cooked/opened perishables.
5. **Network effects through intent, not listings.** The product should improve even when users do not publicly list everything.
6. **Visible state.** Matching, booking, handoff, demand pool, and trust states should be visible in the UI.
7. **Help local merchants compete.** DemandPool should show aggregated neighbourhood demand that small stores can fulfil.

---

## 7. Food-expiry strategy

The receipt alone cannot know exact expiry. UseBy should be honest about this.

### 7.1 Data signals

Use a multi-signal expiry confidence model:

| Signal | What it gives | Confidence |
|---|---|---|
| Receipt item + purchase date | Baseline shelf-life estimate by category | Medium-low |
| Package expiry OCR | Actual best-before/use-by date if visible | High |
| Barcode / GTIN | Product identity | Medium |
| GS1 Digital Link / Application Identifiers | Can encode batch/lot, best-before, expiration date, etc. where available | High when present |
| Storage state | Fridge/freezer/cupboard/opened/cooked | Medium |
| User feedback | “used,” “spoiled,” “still fine,” “shared” | Improves over time |
| Merchant/store drop metadata | Known pickup/use window | High |

GS1 Application Identifiers support best-before and expiration-date fields, which gives a credible future-facing architecture story: as richer 2D codes and Digital Link adoption expands, UseBy's expiry precision can improve.

### 7.2 UI language

Do not show fake exact dates unless the user scanned the label.

Use bands:

- **Use first**
- **Probably this week**
- **Freeze/share soon**
- **Uncertain — scan label**
- **Label says use by: [date]**

### 7.3 Safety posture

- MVP supports sealed packaged food sharing only.
- The app can support “best-before planning” but should not certify food safety.
- Add clear warnings for use-by items and allergens.
- Require item photo for shared food.
- Require pickup confirmation.
- Allow report/block.

---

## 8. Product surfaces

### 8.1 Home Shelf

The user’s private inventory and action board.

Not a spreadsheet. The default screen is action cards:

- “Use spinach and mushrooms tonight.”
- “Scan yoghurt label to confirm expiry.”
- “Share sealed wraps before Friday.”
- “Your green dress could earn £18 this weekend.”
- “Three neighbours want coriander tonight.”
- “Join a local grocer bundle: £12 veg box if 15 households commit.”

### 8.2 Neighbourhood Graph

A map/list hybrid showing:

- nearby needs
- available sealed food items
- fashion rentals
- household lends
- store drops
- demand pools
- trust and handoff states

### 8.3 Fit Passport

A lightweight personal fit model:

- body measurements or common size
- brand-size notes
- fit feedback after rental
- occasion preferences
- deposit comfort
- pickup radius
- cleaning preference

Use this to match outfits by fit confidence, not just listing metadata.

### 8.4 DemandPool

A reverse marketplace for neighbourhood purchases.

Consumer side:

- create/join a pool: “Sunday roast bundle,” “student pantry staples,” “baby nappies,” “vegetarian BBQ pack”
- set max price and pickup radius
- commit deposit or intent
- choose winning merchant bid

Merchant side:

- see anonymised aggregated demand
- submit bundle bid
- specify price, pickup window, quantity, substitutions
- accept order batch
- mark ready for pickup

### 8.5 Merchant portal

Local stores can:

- create surplus drops
- respond to demand pools
- view neighbourhood demand heatmap
- build bundles
- manage pickup windows
- see fulfilled/rejected bids

---

## 9. MVP scope

### 9.1 P0 — Must ship for H0

#### User onboarding

- Create account / demo login.
- Choose neighbourhood radius.
- Add household profile.
- Optional address/postcode geocoding.

#### Inventory input

- Quick add grocery item.
- Receipt upload or seeded receipt parse.
- Expiry label scan/manual expiry input.
- Wardrobe item quick add with size, photos, availability, price.
- Household item quick add for lending.

#### Action cards

Generate action cards from inventory and local demand:

- cook/use
- freeze
- share
- rent out
- borrow instead of buy
- join demand pool
- merchant drop available

#### Matching engine

- Match expiring sealed grocery items to nearby needs.
- Match outfit needs to nearby wardrobe items using size/fit and date availability.
- Match household item needs to nearby lendable items.
- Score by distance, urgency, trust, fit, availability, and confidence.

#### Booking/handoff state

- Request item.
- Accept/reserve.
- Confirm pickup.
- Complete handoff.
- Review/trust event.

#### DemandPool MVP

- Consumer creates or joins a demand pool.
- Merchant submits a bid.
- Pool reaches threshold.
- Winning bid selected.
- Pickup window generated.
- Orders marked ready/collected.

#### Demo mode

- Seed one neighbourhood with:
  - 8 households
  - 2 local merchants
  - 20 grocery items
  - 10 wardrobe items
  - 6 household items
  - 3 active demand pools
  - 5 local needs

### 9.2 P1 — Strong stretch

- OCR receipt parsing via Amazon Textract AnalyzeExpense.
- Barcode scanning and shelf-life lookup.
- GS1 Digital Link parsing demo for one item.
- Stripe test-mode deposits/payments.
- Real geocoding with Mapbox/Google/OSM.
- Push/email notifications.
- Trust and report moderation.
- Store demand heatmap.
- Fit confidence model and post-rental feedback.

### 9.3 P2 — Post-hackathon

- Open-banking/retailer receipt integrations.
- Supermarket loyalty receipt import.
- Real merchant onboarding.
- Delivery/pickup routing.
- Insurance/deposit handling for rentals.
- Digital Product Passport support for clothing.
- Community moderators.
- Local authority/charity partnerships.

---

## 10. Core user journeys

### Journey A — Receipt to action board

1. User uploads a grocery receipt or chooses demo receipt.
2. App parses items and purchase date.
3. App creates item instances with estimated expiry bands.
4. User scans one label to confirm expiry.
5. App creates action cards:
   - cook tonight
   - scan label
   - share sealed item
   - join merchant bundle

Acceptance criteria:

- Receipt-derived expiry is shown as estimate, not fact.
- Label-scanned expiry overrides estimated shelf life.
- Each action card links to item and rationale.

### Journey B — Expiring sealed item to neighbour handoff

1. User has sealed wraps marked “share soon.”
2. Neighbour posts intent: “need wraps/tortillas tonight.”
3. Matching engine creates match.
4. Owner accepts request.
5. Item state changes to reserved.
6. Pickup confirmed.
7. Trust event recorded.

Acceptance criteria:

- Item cannot be reserved by two people simultaneously.
- State transition is persisted.
- User sees distance, pickup window, and trust context.

### Journey C — Fit Passport rental

1. User needs wedding guest outfit Friday-Sunday.
2. User enters size/occasion/budget/radius.
3. App returns local capsule: dress, coat, bag, backup option.
4. User reserves dress.
5. Deposit/payment is mocked or handled in Stripe test mode.
6. Rental window blocks item availability.
7. Return and review update trust/fit profile.

Acceptance criteria:

- Booking prevents double-rental.
- Fit confidence is visible and explainable.
- Return state is tracked.

### Journey D — DemandPool group buy

1. Ten households join “Sunday roast bundle” with max £12 each.
2. Two merchants bid.
3. App scores bids by price, pickup distance, fulfilment quality, substitution policy, and merchant trust.
4. Pool selects winning bid.
5. Households receive pickup slot.
6. Merchant marks batch ready.

Acceptance criteria:

- Pool has threshold and closing time.
- Merchant bids are persisted and scored.
- Winning bid creates individual orders.
- Pool state changes are visible.

### Journey E — Merchant surplus drop

1. Local bakery lists 12 surplus boxes for pickup 5-6pm.
2. App notifies nearby users with matching preferences.
3. Users reserve boxes.
4. Store sees pickup list.
5. Completed pickups update merchant trust and user savings.

Acceptance criteria:

- Drop quantity decreases safely.
- No overbooking.
- Pickup window and status are visible.

---

## 11. Functional requirements

### 11.1 Inventory and item capture

| ID | Requirement | Priority |
|---|---|---|
| UB-001 | Quick-add grocery item | P0 |
| UB-002 | Receipt upload and seeded parse | P0 |
| UB-003 | Label expiry manual input | P0 |
| UB-004 | Label OCR via camera/upload | P1 |
| UB-005 | Barcode / GS1 Digital Link parser demo | P1 |
| UB-006 | Wardrobe item listing | P0 |
| UB-007 | Household lendable item listing | P0 |
| UB-008 | Item photo upload | P1 |

### 11.2 Action cards

| ID | Requirement | Priority |
|---|---|---|
| UB-010 | Generate item action cards | P0 |
| UB-011 | Show action rationale and confidence | P0 |
| UB-012 | Allow dismiss/snooze/complete | P0 |
| UB-013 | Learn from action outcome | P1 |

### 11.3 Matching

| ID | Requirement | Priority |
|---|---|---|
| UB-020 | Create local needs/intents | P0 |
| UB-021 | Match sealed food supply to needs | P0 |
| UB-022 | Match wardrobe item to fit/occasion/date | P0 |
| UB-023 | Match household item lend/borrow | P0 |
| UB-024 | Score matches by distance, urgency, trust, fit, availability | P0 |
| UB-025 | Explain match score | P0 |

### 11.4 Booking and handoff

| ID | Requirement | Priority |
|---|---|---|
| UB-030 | Request item | P0 |
| UB-031 | Owner accepts/rejects | P0 |
| UB-032 | Reserve item and block availability | P0 |
| UB-033 | Confirm pickup/return | P0 |
| UB-034 | Trust/review event | P0 |
| UB-035 | Stripe test-mode deposit/payment | P1 |

### 11.5 DemandPool

| ID | Requirement | Priority |
|---|---|---|
| UB-040 | Create demand pool | P0 |
| UB-041 | Join/commit to pool | P0 |
| UB-042 | Merchant submits bid | P0 |
| UB-043 | Bid scoring and winner selection | P0 |
| UB-044 | Create pickup orders | P0 |
| UB-045 | Merchant marks ready/collected | P0 |
| UB-046 | Store demand heatmap | P1 |

### 11.6 Merchant portal

| ID | Requirement | Priority |
|---|---|---|
| UB-050 | Merchant profile/location | P0 |
| UB-051 | Create surplus drop | P0 |
| UB-052 | View active pools | P0 |
| UB-053 | Submit bid | P0 |
| UB-054 | View pickup list | P0 |

### 11.7 Demo/submission

| ID | Requirement | Priority |
|---|---|---|
| UB-060 | Seeded neighbourhood demo | P0 |
| UB-061 | Architecture diagram | P0 |
| UB-062 | Aurora database screenshot | P0 |
| UB-063 | Published Vercel URL | P0 |
| UB-064 | Vercel Team ID | P0 |
| UB-065 | Bonus build article/video | P1 |

---

## 12. Matching logic

### 12.1 Food match score

```text
food_match_score =
  0.25 * distance_score +
  0.25 * expiry_urgency_score +
  0.20 * need_relevance_score +
  0.15 * trust_score +
  0.10 * pickup_window_score +
  0.05 * safety_confidence_score
```

Rules:

- If item is opened/cooked/perishable without confirmed safety metadata, do not list in MVP.
- If allergen data is unknown, display warning.
- If expiry is user-estimated only, lower confidence.
- If label OCR or GS1 date exists, raise confidence.

### 12.2 Fashion rental match score

```text
fashion_match_score =
  0.25 * fit_confidence +
  0.20 * date_availability +
  0.20 * distance_score +
  0.15 * price_fit +
  0.10 * lender_trust +
  0.10 * occasion_match
```

### 12.3 DemandPool bid score

```text
merchant_bid_score =
  0.30 * price_savings_score +
  0.20 * fulfilment_rate_score +
  0.15 * pickup_distance_score +
  0.15 * merchant_trust_score +
  0.10 * substitution_quality +
  0.10 * freshness_or_sustainability_score
```

### 12.4 Action-card generation

Action cards should be deterministic first and AI-polished second. The system should use rules/matching to decide which cards exist. AI can help phrase them.

Examples:

```json
{
  "type": "share_food",
  "priority": "high",
  "item_id": "item_123",
  "reason_codes": ["expires_soon", "nearby_need", "sealed_packaged"],
  "estimated_savings_cents": 250,
  "confidence": 0.78
}
```

---

## 13. AWS database choice

### 13.1 Use Aurora PostgreSQL as primary backend

UseBy needs relational and geospatial integrity:

- users/households/neighbourhoods
- private inventory
- item catalog
- needs/intents
- matches
- bookings
- merchant bids
- demand pools
- payments/deposits
- trust/reviews
- item availability windows

The app requires transactional consistency for reservations and bookings. A dress, grocery item, or merchant bundle should not be double-reserved. Aurora PostgreSQL is a good fit because it supports SQL transactions, relational joins, constraints, and extensions.

### 13.2 Use PostGIS

UseBy is location-native. PostGIS can store and query spatial data inside PostgreSQL. That supports:

- nearest-neighbour supply/demand matching
- merchant service areas
- pickup-radius filtering
- demand heatmaps
- local pool membership

Recommended extension:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 13.3 Use pgvector optionally

pgvector can support:

- item similarity
- need/listing semantic matching
- merchant bundle similarity
- recipe/ingredient substitutions
- wardrobe style matching

Recommended extension:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 13.4 Why not DynamoDB as primary?

DynamoDB is excellent for high-scale activity feeds and event streams, but UseBy's MVP needs relational transactions and geospatial joins. The core challenge is not only “millions of feed writes.” It is correct marketplace state: item availability, booking windows, pool thresholds, merchant bids, deposits, and trust. Aurora PostgreSQL is the cleaner primary backend.

### 13.5 Optional stretch: DynamoDB event stream

If time permits, add DynamoDB as a secondary event-log table for local activity and notification fanout:

- `PK = NEIGHBOURHOOD#shoreditch`
- `SK = EVENT#timestamp#eventId`
- events: item shared, pool joined, merchant bid submitted, booking completed

This would strengthen the architecture story, but it is not necessary for MVP. Avoid adding it unless the Aurora/PostGIS MVP is solid.

### 13.6 Why not Aurora DSQL?

Aurora DSQL is compelling for globally distributed active-active relational workloads. UseBy’s first real-world problem is local density, not cross-region consistency. Aurora PostgreSQL with PostGIS is more directly useful for the geospatial marketplace mechanics.

---

## 14. Data model

### 14.1 Conceptual model

```text
User -> Household -> Location
Household -> ItemInstances -> InventoryEvents -> ActionCards
Household -> Needs -> Matches -> Bookings -> Handoffs -> TrustEvents
Household -> FitProfile -> WardrobeItems -> RentalWindows -> RentalBookings
Merchant -> MerchantLocations -> StoreDrops
DemandPool -> PoolCommitments -> MerchantBids -> PoolOrders -> Pickups
```

### 14.2 Core tables

#### `users`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| name | text |  |
| email | text unique |  |
| role | text | consumer/merchant/admin |
| created_at | timestamptz |  |

#### `households`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| name | text |  |
| location | geography(Point, 4326) | PostGIS |
| postcode_area | text | coarse display |
| radius_meters | int | matching radius |
| trust_score | numeric | 0-1 |
| created_at | timestamptz |  |

#### `household_members`

| Column | Type | Notes |
|---|---|---|
| household_id | uuid fk |  |
| user_id | uuid fk |  |
| role | text | owner/member |

#### `item_catalog`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| name | text | normalized item |
| category | text | grocery/fashion/household |
| subcategory | text |  |
| brand | text | nullable |
| gtin | text | nullable |
| default_shelf_life_days | int | nullable |
| storage_default | text | fridge/cupboard/freezer |
| allergens | text[] | nullable |

#### `item_instances`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| owner_household_id | uuid fk |  |
| catalog_id | uuid fk | nullable for custom items |
| title | text | user display |
| category | text | grocery/fashion/household |
| state | text | private/use_soon/offered/reserved/handed_off/consumed/expired/returned |
| quantity | numeric |  |
| unit | text |  |
| acquired_at | timestamptz | purchase/import date |
| estimated_expiry_date | date | nullable |
| confirmed_expiry_date | date | nullable |
| expiry_confidence | numeric | 0-1 |
| storage_state | text | fridge/freezer/cupboard/opened/sealed |
| is_shareable | boolean | MVP false if risky |
| location | geography(Point, 4326) | default household location |
| image_url | text |  |
| created_at | timestamptz |  |

#### `expiry_observations`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| item_instance_id | uuid fk |  |
| observation_type | text | receipt_estimate/manual_label/ocr_label/gs1/user_feedback |
| observed_date | date |  |
| confidence | numeric |  |
| raw_payload | jsonb | OCR/receipt/barcode details |
| created_at | timestamptz |  |

#### `inventory_events`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| item_instance_id | uuid fk |  |
| household_id | uuid fk |  |
| event_type | text | acquired/opened/shared/reserved/used/spoiled/returned |
| payload | jsonb |  |
| created_at | timestamptz |  |

#### `needs`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| household_id | uuid fk |  |
| need_type | text | grocery/fashion/household/service |
| title | text | e.g. coriander tonight |
| description | text |  |
| needed_from | timestamptz |  |
| needed_until | timestamptz |  |
| max_price_cents | bigint | nullable |
| location | geography(Point, 4326) |  |
| radius_meters | int |  |
| status | text | open/matched/fulfilled/expired/cancelled |
| embedding | vector(1536) | optional |
| created_at | timestamptz |  |

#### `matches`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| need_id | uuid fk |  |
| item_instance_id | uuid fk | nullable if merchant bid |
| merchant_bid_id | uuid fk | nullable |
| score | numeric | 0-1 |
| reason_codes | text[] |  |
| explanation | text | user-visible |
| status | text | proposed/accepted/rejected/expired |
| created_at | timestamptz |  |

#### `bookings`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| item_instance_id | uuid fk |  |
| requester_household_id | uuid fk |  |
| owner_household_id | uuid fk |  |
| booking_type | text | share/rent/lend/swap |
| start_at | timestamptz |  |
| end_at | timestamptz | nullable for food |
| price_cents | bigint |  |
| deposit_cents | bigint |  |
| status | text | requested/accepted/reserved/picked_up/returned/completed/cancelled/disputed |
| created_at | timestamptz |  |

#### `handoffs`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| booking_id | uuid fk |  |
| pickup_window_start | timestamptz |  |
| pickup_window_end | timestamptz |  |
| pickup_location_hint | text | coarse |
| status | text | scheduled/confirmed/no_show/completed |
| created_at | timestamptz |  |

#### `fit_profiles`

| Column | Type | Notes |
|---|---|---|
| household_id | uuid pk/fk | or user_id |
| sizes | jsonb | UK/US/EU sizes by category |
| brand_notes | jsonb | brand-specific fit feedback |
| measurements | jsonb | optional |
| style_preferences | text[] |  |
| updated_at | timestamptz |  |

#### `rental_windows`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| item_instance_id | uuid fk | fashion/household items |
| available_from | timestamptz |  |
| available_until | timestamptz |  |
| price_per_day_cents | bigint |  |
| status | text | open/reserved/blocked |

#### `merchants`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| name | text |  |
| merchant_type | text | grocer/bakery/butcher/charity/tailor |
| trust_score | numeric | 0-1 |
| created_at | timestamptz |  |

#### `merchant_locations`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| merchant_id | uuid fk |  |
| name | text |  |
| location | geography(Point, 4326) | PostGIS |
| service_radius_meters | int |  |

#### `store_drops`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| merchant_location_id | uuid fk |  |
| title | text | surplus box / bakery bag |
| quantity_total | int |  |
| quantity_reserved | int |  |
| price_cents | bigint |  |
| pickup_start | timestamptz |  |
| pickup_end | timestamptz |  |
| status | text | draft/live/sold_out/closed |

#### `demand_pools`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| creator_household_id | uuid fk |  |
| title | text | e.g. Sunday roast bundle |
| category | text | grocery/household/fashion/service |
| location | geography(Point, 4326) | centre |
| radius_meters | int |  |
| min_commitments | int | threshold |
| max_price_per_household_cents | bigint |  |
| closes_at | timestamptz |  |
| status | text | gathering/bidding/awarded/fulfilled/cancelled/expired |
| created_at | timestamptz |  |

#### `demand_pool_commitments`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| demand_pool_id | uuid fk |  |
| household_id | uuid fk |  |
| quantity | int |  |
| max_price_cents | bigint |  |
| status | text | committed/withdrawn/charged/fulfilled |
| created_at | timestamptz |  |

#### `merchant_bids`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| demand_pool_id | uuid fk |  |
| merchant_location_id | uuid fk |  |
| price_per_household_cents | bigint |  |
| fulfilment_quantity | int |  |
| pickup_start | timestamptz |  |
| pickup_end | timestamptz |  |
| substitutions | jsonb |  |
| score | numeric | computed |
| status | text | submitted/winning/rejected/withdrawn |
| created_at | timestamptz |  |

#### `trust_events`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| actor_household_id | uuid fk |  |
| target_household_id | uuid fk | nullable for merchant |
| target_merchant_id | uuid fk | nullable |
| booking_id | uuid fk | nullable |
| event_type | text | completed/no_show/report/positive_review/late_return |
| rating | int | nullable |
| note | text |  |
| created_at | timestamptz |  |

#### `action_cards`

| Column | Type | Notes |
|---|---|---|
| id | uuid pk |  |
| household_id | uuid fk |  |
| card_type | text | cook/share/rent/borrow/join_pool/store_drop |
| priority | text | high/medium/low |
| entity_type | text | item/need/pool/drop |
| entity_id | uuid |  |
| reason_codes | text[] |  |
| confidence | numeric | 0-1 |
| status | text | active/dismissed/completed/snoozed |
| created_at | timestamptz |  |

### 14.3 Useful indexes

```sql
-- Location indexes
CREATE INDEX households_location_gix ON households USING GIST (location);
CREATE INDEX item_instances_location_gix ON item_instances USING GIST (location);
CREATE INDEX needs_location_gix ON needs USING GIST (location);
CREATE INDEX merchant_locations_location_gix ON merchant_locations USING GIST (location);
CREATE INDEX demand_pools_location_gix ON demand_pools USING GIST (location);

-- State and expiry indexes
CREATE INDEX item_instances_state_expiry_idx
  ON item_instances (owner_household_id, state, COALESCE(confirmed_expiry_date, estimated_expiry_date));

CREATE INDEX needs_status_until_idx
  ON needs (status, needed_until);

CREATE INDEX bookings_item_window_idx
  ON bookings (item_instance_id, start_at, end_at, status);

CREATE INDEX demand_pool_status_closes_idx
  ON demand_pools (status, closes_at);

-- Optional vector indexes
CREATE INDEX needs_embedding_idx
  ON needs USING hnsw (embedding vector_cosine_ops);
```

### 14.4 State machines

#### Grocery item state

```text
private -> use_soon -> offered -> reserved -> handed_off -> consumed/completed
private -> consumed
private -> expired
```

#### Fashion/household rental state

```text
private -> listed -> requested -> reserved -> picked_up -> returned -> completed
listed -> blocked/cancelled
```

#### DemandPool state

```text
gathering -> bidding -> awarded -> ready_for_pickup -> fulfilled
          -> expired/cancelled
```

#### Merchant bid state

```text
submitted -> winning/rejected -> fulfilled/cancelled
```

---

## 15. Technical architecture

### 15.1 Recommended stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js PWA on Vercel | Web-accessible, mobile-feeling app; meets H0 requirement |
| UI scaffolding | v0 | Generate polished consumer/mobile and merchant dashboard screens quickly |
| Primary database | Aurora PostgreSQL | Relational marketplace state + PostGIS + pgvector |
| ORM/query | Drizzle/Kysely/Prisma | Typed migrations and safe queries |
| Geospatial | PostGIS | Neighbourhood matching, merchant radius, heatmaps |
| AI/action-card wording | Vercel AI SDK or lightweight LLM API | Use for copy and semantic parsing, not as source of truth |
| Scheduled jobs | Vercel Cron Jobs | Expiry decay, match recomputation, pool closure, merchant-bid deadlines |
| OCR | Amazon Textract AnalyzeExpense or custom OCR fallback | Receipt and label extraction; P1 if time allows |
| File storage | S3 presigned URLs or Vercel Blob | Item photos/receipts/labels |
| Payments/deposits | Stripe test mode | DemandPool commits and rentals |
| Notifications | Email/push simulation, SES/Resend | Pickup and match alerts |
| Maps | Mapbox/Google/OSM | UI only; PostGIS handles backend distance queries |

### 15.2 Architecture diagram

```mermaid
flowchart TB
  C[Consumer PWA] --> V[Vercel Next.js App]
  M[Merchant Portal] --> V
  V --> MW[Edge Middleware / Auth]
  V --> SA[Server Actions]
  V --> API[Route Handlers / API Functions]

  SA --> DB[(Amazon Aurora PostgreSQL + PostGIS + pgvector)]
  API --> DB

  API --> OCR[Amazon Textract AnalyzeExpense / OCR]
  API --> FILES[S3 or Vercel Blob: receipts, labels, item photos]
  API --> STRIPE[Stripe test-mode deposits/payments]
  API --> EMAIL[SES/Resend notifications]
  API --> MAPS[Mapbox/Google/OSM geocoding]

  CRON[Vercel Cron Jobs] --> MATCH[/api/jobs/recompute-matches]
  CRON --> EXPIRY[/api/jobs/expiry-decay]
  CRON --> POOLS[/api/jobs/close-demand-pools]

  MATCH --> DB
  EXPIRY --> DB
  POOLS --> DB

  AI[Vercel AI SDK: action-card wording / parsing] --> API
  API --> AI
```

---

## 16. Vercel and v0 implementation plan

### 16.1 What “beyond basic deployment” means here

A basic Vercel deployment would be a static marketplace UI. UseBy should go beyond that by making Vercel the full-stack runtime:

1. **v0-generated consumer PWA and merchant portal** with action cards, map/list views, and demand-pool bidding.
2. **Next.js App Router** for server-rendered stateful pages.
3. **Server Actions** for reserving items, joining pools, accepting bookings, and merchant bids.
4. **Route Handlers** for uploads, match APIs, merchant bid APIs, Stripe webhooks, and OCR callbacks.
5. **Vercel Cron Jobs** for expiry decay, match recomputation, pool closing, and pickup reminders.
6. **Vercel Marketplace AWS DB integration** for Aurora PostgreSQL provisioning/credentials.
7. **Edge Middleware** for auth, household/merchant role gating, and tenant context.
8. **Streaming/generative UI** for action-card explanations and onboarding help, without making the app a chatbot.
9. **Responsive PWA behaviour** so it feels mobile-native while remaining web-accessible.
10. **Submission evidence**: published Vercel URL, Team ID, architecture diagram, and Storage/AWS DB screenshot.

### 16.2 Suggested v0 prompts

Prompt 1 — consumer PWA:

```text
Build a polished mobile-first Next.js PWA called UseBy. It is a neighbourhood action app for groceries, wardrobes, household items, and local demand pools. The home screen should not look like a marketplace feed; it should show action cards: use, share, rent out, borrow, join pool, merchant drop. Include bottom navigation, map/list toggle, item cards, booking state, and trust indicators.
```

Prompt 2 — merchant portal:

```text
Add a merchant dashboard for local grocers and bakeries. Include active demand pools, bid submission cards, surplus drops, pickup lists, demand heatmap, and fulfilment status. The UI should clearly show pool state: gathering, bidding, awarded, ready for pickup, fulfilled.
```

Prompt 3 — backend-state UX:

```text
Refine the UI so it reflects backend state machines. Item cards should show private, use soon, offered, reserved, handed off, completed. Demand pools should show threshold progress, bid count, closing time, winning bid, and pickup status. Bookings should show request, accepted, reserved, picked up, returned/completed.
```

Prompt 4 — judge demo mode:

```text
Create a guided demo mode for a dense neighbourhood with 8 households and 2 merchants. Show a receipt becoming action cards, an expiring sealed item matched to a neighbour, a dress rental booking, and a local grocer winning a Sunday roast demand pool.
```

### 16.3 Route structure

```text
/app
  /(marketing)/page.tsx
  /(consumer)/home/page.tsx
  /(consumer)/inventory/page.tsx
  /(consumer)/needs/page.tsx
  /(consumer)/matches/page.tsx
  /(consumer)/bookings/[id]/page.tsx
  /(consumer)/pools/page.tsx
  /(merchant)/dashboard/page.tsx
  /(merchant)/pools/[id]/page.tsx
  /(merchant)/drops/page.tsx
  /api/inventory/add/route.ts
  /api/inventory/upload-receipt/route.ts
  /api/inventory/scan-expiry/route.ts
  /api/needs/create/route.ts
  /api/matches/recompute/route.ts
  /api/bookings/request/route.ts
  /api/bookings/[id]/accept/route.ts
  /api/bookings/[id]/complete/route.ts
  /api/pools/create/route.ts
  /api/pools/[id]/join/route.ts
  /api/pools/[id]/bid/route.ts
  /api/drops/create/route.ts
  /api/jobs/expiry-decay/route.ts
  /api/jobs/recompute-matches/route.ts
  /api/jobs/close-demand-pools/route.ts
  /api/webhooks/stripe/route.ts
```

### 16.4 Vercel Cron config

```json
{
  "crons": [
    { "path": "/api/jobs/expiry-decay", "schedule": "0 7 * * *" },
    { "path": "/api/jobs/recompute-matches", "schedule": "*/30 * * * *" },
    { "path": "/api/jobs/close-demand-pools", "schedule": "*/15 * * * *" }
  ]
}
```

---

## 17. Integrations

### 17.1 Required

| Integration | Purpose | Hackathon status |
|---|---|---|
| Aurora PostgreSQL via Vercel/v0 or Vercel Marketplace | Primary backend | Required |
| Vercel/v0.app deployment | Web frontend | Required |

### 17.2 Recommended MVP integrations

| Integration | Purpose | MVP approach |
|---|---|---|
| Amazon Textract AnalyzeExpense | Receipt parsing | P1; can seed parsed receipt in P0 |
| S3 presigned URLs or Vercel Blob | Store receipts/photos/labels | Store metadata in Aurora |
| Stripe test mode | Deposits/payments for rentals and demand pools | P1; mock if setup time is tight |
| SES/Resend | Booking, pickup, and pool notifications | Email-only enough for MVP |
| Mapbox/Google/OSM | Map UI and geocoding | Use coarse seeded locations if API setup is tight |
| GS1 Digital Link parser | Demonstrate expiry/date future-readiness | Use one sample QR/barcode string in demo |

---

## 18. UX specification

### 18.1 Home screen

Top section:

- neighbourhood name
- savings/waste avoided/local spend counters
- trust status

Primary cards:

- high-priority action cards
- expiring soon
- needs nearby
- pools near closing
- store drops

Design principle: The user should see “what should I do now?” within 5 seconds.

### 18.2 Inventory screen

Tabs:

- groceries
- wardrobe
- household
- shared/reserved

Each item card shows:

- state
- expiry/availability
- action suggestions
- confidence
- share/rent/keep controls

### 18.3 Neighbourhood screen

Map/list toggle:

- nearby needs
- available items
- active pools
- merchant drops

Use privacy-preserving location display: coarse location until booking accepted.

### 18.4 DemandPool screen

Consumer view:

- title
- target threshold
- current commitments
- max price
- closing time
- merchant bids
- selected winner

Merchant view:

- demand summary
- anonymised location heatmap
- bid form
- fulfilment capacity
- pickup window

### 18.5 Booking screen

State timeline:

```text
requested -> accepted -> reserved -> pickup scheduled -> picked up -> completed/reviewed
```

Show:

- item details
- pickup window
- coarse location
- trust info
- deposit/payment status
- report/cancel controls

---

## 19. Security, privacy, and safety

### 19.1 Location privacy

- Store exact location for matching, but show coarse location until booking accepted.
- Allow pickup at public location.
- Do not expose precise household coordinates in public APIs.
- Use tenant/user authorisation checks on all booking and item routes.

### 19.2 Food safety

- MVP only supports sealed packaged foods for neighbour sharing.
- Show allergen and uncertainty warnings.
- Label estimated dates clearly.
- Do not certify food safety.
- Allow report/block.
- Store safety disclaimers and acceptance event.

### 19.3 Payments and trust

- Use Stripe test mode for demo.
- Escrow/deposits can be simulated for MVP.
- Ratings/trust events should be weighted by completed bookings, not vanity likes.

### 19.4 Abuse prevention

- Rate-limit item listings and requests.
- Allow users to block/report.
- Merchant bids require merchant role.
- High-risk categories can be disallowed.

---

## 20. Technical impressiveness checklist

To score highly, the demo should show:

1. **PostGIS geospatial matching**: not just frontend maps.
2. **Expiry confidence model**: honest multi-signal estimates, not fake receipt magic.
3. **Stateful booking lifecycle**: item states and availability windows prevent double booking.
4. **DemandPool reverse marketplace**: consumers aggregate demand; merchants bid.
5. **Merchant portal**: demonstrates two-sided local-commerce value.
6. **Action cards**: front end reflects backend state and reasoning.
7. **Cron jobs**: expiry decay, match recomputation, pool closure.
8. **Database schema shown**: item_instances, needs, matches, bookings, demand_pools, merchant_bids.
9. **Seeded neighbourhood demo**: reliable and visually compelling.
10. **Vercel full-stack runtime**: server actions, API routes, cron, PWA, AWS env integration.

---

## 21. Judging-rubric strategy

| Criterion | How UseBy scores |
|---|---|
| Technical Implementation | Aurora PostgreSQL + PostGIS powers geospatial matching, booking consistency, demand-pool bidding, expiry observations, trust events, and state machines. Cron jobs and route handlers make it operational. |
| Design | The front end is designed around backend states: action cards, item lifecycle, pool threshold, booking timeline, bid status, trust state. It should feel simple despite complex backend logic. |
| Impact & Real-World Applicability | Consumers save money, reduce waste, monetise idle items, and shift some spend to local businesses. Local merchants gain demand visibility and batch economics. |
| Originality | Adjacent apps exist, but UseBy combines private inventory, intent graph, cross-category local liquidity, fit-aware rentals, and reverse merchant bidding. The implementation pushes beyond a category marketplace. |

---

## 22. Demo plan: less than 3 minutes

### 0:00-0:20 — Problem

Show the everyday mess:

- food expiring in a household
- expensive one-off outfit need
- local grocer competing with big retailers
- neighbours buying/owning overlapping things without coordination

### 0:20-0:50 — Receipt and inventory to action cards

Upload/seed a grocery receipt.

App creates:

- spinach: use tonight
- wraps: share soon
- yoghurt: scan label
- local grocer bundle: join pool

Show honest expiry confidence.

### 0:50-1:20 — Neighbour match

A nearby neighbour needs wraps for dinner.

UseBy proposes match:

- distance
- sealed item
- expiry urgency
- pickup window
- trust

Owner accepts. Item moves to reserved. Pickup created.

### 1:20-1:50 — Fashion rental

User needs wedding outfit Friday.

UseBy returns local capsule:

- green dress, size fit confidence 84%
- bag
- backup dress

User reserves dress. Rental window blocks double booking.

### 1:50-2:25 — DemandPool merchant bid

Ten households join “Sunday roast bundle.”

Two merchants bid.

Local grocer wins because price and pickup are good. Pool moves from gathering -> bidding -> awarded -> ready for pickup.

### 2:25-3:00 — Stack and database proof

Show architecture diagram and Aurora tables:

- item_instances
- expiry_observations
- needs
- matches
- bookings
- demand_pools
- merchant_bids
- trust_events

End line:

> “UseBy turns private household inventory into local economic action. Vercel/v0 gives the action cockpit; Aurora PostgreSQL gives the neighbourhood state engine.”

---


## 22A. Neutral demo-world configuration

To avoid the product feeling UK-only or US-only, the H0 demo should use a fictional seeded neighbourhood. Example:

- neighbourhood: **Riverside Quarter**
- local grocer: **Corner Basket Market**
- bakery: **Morning Loaf**
- tailor/dry cleaner: **Stitch & Steam**
- community pickup point: **Riverside Hub**
- large-retailer contrast: “big-box supermarket” or “large grocery chain,” not a named real brand

### 22A.1 Core consumer promise

The consumer promise should be:

```text
Use what you already have. Borrow what you only need once. Rent what you rarely wear. Pool demand when local shops can beat big-retail convenience.
```

### 22A.2 DemandPool role in the demo

DemandPool should appear after the user has already seen the private inventory and matching engine. It should be framed as the merchant extension of the same graph:

```text
many households need similar staples -> demand pool forms -> local merchants bid -> consumers get a better bundle -> small business gets demand it would never see
```

Do not make the recorded demo depend on complex real merchant onboarding. Seed two fictional merchant bids and show how Aurora/PostGIS chooses an eligible fulfilment option based on price, pickup window, distance, fulfilment reliability, and substitutions.

### 22A.3 Demo priority order

1. Household action board: cook/share/rent/borrow.
2. Local matching: neighbour need matched to sealed food or wardrobe item.
3. Booking/handoff state machine.
4. DemandPool as secondary merchant opportunity.
5. Architecture/database proof.


## 23. Suggested build plan

### Phase 1 — Data model and seed demo

- Provision Aurora PostgreSQL via Vercel Marketplace/v0.
- Enable PostGIS.
- Create core migrations.
- Seed neighbourhood, households, merchants, items, needs, and pools.

### Phase 2 — Consumer PWA

- Generate v0 UI.
- Build home/action-card screen.
- Add inventory and need creation.
- Add map/list view.

### Phase 3 — Matching and booking

- Implement PostGIS radius queries.
- Implement match scoring.
- Implement booking state machine.
- Prevent double reservation with transactions.

### Phase 4 — DemandPool and merchant portal

- Add pool creation/joining.
- Add merchant bid submission.
- Add bid scoring.
- Add pool award/pickup state.

### Phase 5 — Expiry and OCR polish

- Add expiry observations.
- Add manual label entry.
- Add seeded OCR or Textract integration.
- Add cron jobs for expiry decay and pool closing.

### Phase 6 — Submission polish

- Guided demo mode.
- Architecture diagram.
- Database screenshot.
- Vercel deployment and Team ID.
- Build post/video for bonus points.

---

## 24. Key risks and mitigations

| Risk | Mitigation |
|---|---|
| Sounds like Olio/Vinted clone | Lead with private inventory + intent graph + DemandPool merchant bidding. |
| Too broad | Demo one dense neighbourhood and four flows only. |
| Receipt expiry false precision | Use confidence bands and label/GS1 override. |
| Food safety concern | MVP sealed packaged goods only; warnings and reporting. |
| Two-sided marketplace cold start | Seed dense communities and merchants; DemandPool creates merchant-side value even with small user base. |
| Payment/deposit complexity | Use Stripe test mode or mocked payments in MVP. |
| Location privacy | Coarse location until accepted booking; public pickup options. |
| Technical complexity | Focus on Aurora/PostGIS schema, state machines, and one high-quality demo path. |

---

## 25. Monetization

### 25.1 Consumer

- Free core app.
- Transaction fee on rentals and merchant pool orders.
- Premium household plan for shared-house coordination and advanced inventory.
- Optional deposit/insurance fee on higher-value rentals.

### 25.2 Merchant

- Bid/fulfilment fee per DemandPool order.
- Subscription for local demand insights and recurring pools.
- Promotion fee for featured surplus drops.

### 25.3 Community/institutional

- University halls and residential buildings pay for waste/cost/community features.
- Local councils or BIDs sponsor merchant/community deployments.

---

## 26. Resolved decisions and remaining questions

### 26.1 Resolved decisions

1. **Geography:** Neutral seeded neighbourhood, not UK-first or US-first.
2. **Store names:** Use fictional, substitutable merchants; avoid anchoring the demo to Tesco/Walmart/Target or any country-specific retailer.
3. **DemandPool role:** Secondary module, not the main wow moment. It should reinforce the thesis that aggregated local demand helps small businesses compete.
4. **Core thesis:** Optimise household resources and local demand to improve quality of life for consumers and unlock demand for small businesses.
5. **Food safety:** MVP should prioritise sealed packaged goods, store surplus drops, and clear confidence bands rather than risky claims about fresh/opened food.
6. **Track:** Submit under Track 1 — Monetizable B2C app if chosen; the Open Innovation angle is secondary.

### 26.2 Remaining questions

1. **Payments:** Should Stripe test mode be wired for deposits/pool commitments, or should the MVP mock payments and focus on matching/state machines?
2. **Receipt/OCR:** Do we implement real Textract for one receipt/label, or use seeded parsed data and spend time on backend matching quality?
3. **Map provider:** Real map API versus stylised local map. A stylised map is more reliable; real map is more impressive if setup is quick.
4. **Fashion depth:** Lightweight fit/occasion matching is probably enough for H0; detailed garment measurement can be a future extension.
5. **Name:** “UseBy” is strong for food expiry but narrower than the full thesis. Alternatives if needed: LocalLoop, ResourceLoop, HomeGrid, LoopLocal, NeighbourStock.

---

## 27. Source notes

- H0 official rules and judging criteria: https://h01.devpost.com/rules
- H0 resources and FAQs: https://h01.devpost.com/resources
- AWS/Vercel H0 integration blog: https://aws.amazon.com/blogs/database/ai-native-full-stack-web-apps-with-vercel-and-aws-databases/
- Vercel AWS Databases Marketplace/v0 integration: https://vercel.com/blog/aws-databases-are-now-live-on-the-vercel-marketplace-and-v0
- AWS announcement: AWS Databases on v0 by Vercel: https://aws.amazon.com/about-aws/whats-new/2026/01/aws-databases-available-vercel-v0/
- UNEP Food Waste Index Report 2024: https://www.unep.org/resources/publication/food-waste-index-report-2024
- UNEP press release on food waste: https://www.unep.org/news-and-stories/press-release/world-squanders-over-1-billion-meals-day-un-report
- Olio 10-year impact/update: https://olioapp.com/business/2025/07/16/looking-back-at-10-years-of-olio-and-120-million-meals-rescued/
- Too Good To Go impact report page: https://www.toogoodtogo.com/en-gb/impact-report
- Vinted 2025 results: https://company.vinted.com/newsroom/financial-results-2025
- By Rotation homepage: https://byrotation.com/
- Aurora PostgreSQL PostGIS docs: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Appendix.PostgreSQL.CommonDBATasks.PostGIS.html
- Aurora PostgreSQL pgvector support: https://aws.amazon.com/about-aws/whats-new/2023/07/amazon-aurora-postgresql-pgvector-vector-storage-similarity-search/
- GS1 Application Identifiers: https://ref.gs1.org/ai/
- Amazon Textract AnalyzeExpense docs: https://docs.aws.amazon.com/textract/latest/dg/analyzing-document-expense.html
- Vercel Cron Jobs docs: https://vercel.com/docs/cron-jobs
- Vercel AI SDK docs: https://vercel.com/docs/ai-sdk
