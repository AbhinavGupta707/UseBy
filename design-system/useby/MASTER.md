# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** UseBy
**Generated:** 2026-06-29 12:54:52
**Category:** Consumer neighbourhood marketplace

---

## Global Rules

### Color Palette

UseBy overrides the generated red palette below. The product must follow the local `UI References/*.png` direction: warm cream surfaces, deep evergreen, sage panels, soft gold/coral accents, editorial black-green text, and image-led cards. Do not use the generated red palette as the dominant theme.

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#255C45` | `--color-primary` |
| Primary Dark | `#173D2F` | `--color-primary-dark` |
| Sage | `#9CAF9C` | `--color-sage` |
| Sage Light | `#DDE7D8` | `--color-sage-light` |
| Gold | `#D8A84E` | `--color-gold` |
| Coral | `#E98570` | `--color-coral` |
| Background | `#F7F3EA` | `--color-background` |
| Surface | `#FFFDF7` | `--color-surface` |
| Border | `#E2D9C8` | `--color-border` |
| Text | `#1F2E26` | `--color-text` |
| Muted Text | `#69786D` | `--color-muted` |

**Color Notes:** Premium consumer warmth from the references. Cream is a background foundation only; keep the interface from becoming one-note beige by using deep green navigation, photography, coral/gold CTAs, and sage status blocks.

### Generated Palette Reference Only

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#DC2626` | `--color-primary` |
| Secondary | `#F87171` | `--color-secondary` |
| CTA/Accent | `#CA8A04` | `--color-cta` |
| Background | `#FEF2F2` | `--color-background` |
| Text | `#450A0A` | `--color-text` |

**Color Notes:** Generated food-app palette; do not use as the dominant UseBy product palette.

### Typography

- **Heading Font:** Playfair Display
- **Body Font:** Inter
- **Mood:** elegant, luxury, sophisticated, timeless, premium, editorial
- **Google Fonts:** [Playfair Display + Inter](https://fonts.google.com/share?selection.family=Inter:wght@300;400;500;600;700|Playfair+Display:wght@400;500;600;700)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap');
```

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #255C45;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: transform 200ms ease, opacity 200ms ease, box-shadow 200ms ease, background-color 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #255C45;
  border: 2px solid #255C45;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: transform 200ms ease, color 200ms ease, background-color 200ms ease, border-color 200ms ease, box-shadow 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #FFFDF7;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: transform 200ms ease, box-shadow 200ms ease, background-color 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #255C45;
  box-shadow: 0 0 0 3px #255C4520;
}

.input:focus-visible {
  outline: 2px solid #255C45;
  outline-offset: 2px;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Vibrant & Block-based

**Keywords:** Bold, energetic, playful, block layout, geometric shapes, high color contrast, duotone, modern, energetic

**Best For:** Startups, creative agencies, gaming, social media, youth-focused, entertainment, consumer

**Key Effects:** Large sections (48px+ gaps), animated patterns, bold hover (color shift), scroll-snap, large type (32px+), 200-300ms

### Creative Divergence

- **Mode:** `bold`
- **Concept:** Editorial luxury with dramatic whitespace and oversized typography
- **Layout Strategy:** Split hero with staggered editorial cards and deliberate negative space
- **Signature Motion:** Slow parallax and fade-up cadence with restrained easing. Blend with style effects: Large sections (48px+ gaps), animated patterns, bold hover (color shift), scroll-snap, large type (32px+), 200-300ms
- **Visual Signature:** High-contrast serif/sans pairing and textured paper-like backdrop
- **Intensity / Layout Variation:** 35-50% non-standard composition
- **Intensity / Motion Budget:** 3-5 signature animations per page
- **Intensity / QA Risk:** Medium-high
- **Guardrails:**
  - Animate explicit properties only (transform/opacity/colors), never `transition: all`.
  - Keep visible `:focus-visible` states for all interactive controls.
  - Respect `prefers-reduced-motion` for non-essential animation.
  - Prioritize semantic structure and mobile readability before decorative effects.

### Page Pattern

**Pattern Name:** Marketplace / Directory

- **Conversion Strategy:**  map hover pins,  card carousel, Search bar is the CTA. Reduce friction to search. Popular searches suggestions.
- **CTA Placement:** Hero Search Bar + Navbar 'List your item'
- **Section Order:** 1. Hero (Search focused), 2. Categories, 3. Featured Listings, 4. Trust/Safety, 5. CTA (Become a host/seller)

---

## Anti-Patterns (Do NOT Use)

- ❌ Heavy skeuomorphism
- ❌ Accessibility ignored

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
