# Design System Reference
**Question Generation System — UI Redesign**

> This is the authoritative reference for all redesign prompts (2-8).
> All tokens are defined in `frontend/src/index.css` as Tailwind v4 `@theme` variables.
> Never scatter raw hex values through components - always use the named token classes.

---

## Design Tokens

### Color Palette

| Token Name | Class | Hex | Usage |
|---|---|---|---|
| `--color-bg` | `bg-bg` | `#F7F5F1` | Page background - warm off-white |
| `--color-ink` | `text-ink` | `#111111` | Body text - near-black |
| `--color-forest` | `bg-forest` / `text-forest` | `#1F4D3A` | Primary accent - deep forest green |
| `--color-ember` | `bg-ember` / `text-ember` | `#E8632C` | Secondary accent - burnt orange |
| `--color-lime` | `bg-lime` / `text-lime` | `#D4F547` | Tertiary accent - electric lime (SPARINGLY) |
| `--color-grape` | `bg-grape` / `text-grape` | `#8B7BC7` | Muted accent - dusty purple (tags/pills ONLY) |
| `--color-surface` | `bg-surface` | `#FFFFFF` | Card surfaces |
| `--color-border` | `border-border` | `#E2DDD7` | Subtle warm borders |

### Typography

| Token | Value | Used for |
|---|---|---|
| `--font-heading` | `"Space Grotesk", system-ui, sans-serif` | h1-h6, hero text, card titles |
| `--font-body` | `"Inter", system-ui, sans-serif` | Body copy, labels, inputs |
| `--font-mono` | `"JetBrains Mono", monospace` | Code blocks, IDs |

### Border Radius Scale

NOT every element gets the same radius (explicitly banned).

| Token | Value | Use on |
|---|---|---|
| `--radius-sm` | `6px` | Small badges, tooltips |
| `--radius-card` | `12px` | All card components |
| `--radius-lg` | `16px` | Large panels, modals |
| `--radius-pill` | `9999px` | Buttons, filter pills, tags |

---

## Reference Image Mapping

Each reference image applies to ONLY its designated area. Do not blend styles.

| Image | File | Apply to |
|---|---|---|
| 01 | 01_truus_category_cards.jpg | Dashboard summary cards |
| 02 | 02_englishconnect_pills.jpg | Filter/config pill buttons |
| 03 | 03_tennis_program_cards.jpg | Book/Chapter browse cards |
| 04 | 04_givingli_bento_grid.jpg | Dashboard bento-grid layout |
| 05 | 05_brandbook_skip.jpg | NOT APPLICABLE - ignore |
| 06 | 06_digital_library_hero.jpg | Print View hero + empty states |
| 07 | 07_tbh_app_skip.jpg | NOT APPLICABLE - ignore |
| 08 | 08_portfolio_typography.jpg | Login page + page headers |
| 09 | 09_blog_cards.jpg | Papers/Versions list cards |
| 10 | 10_pulse_fitness_stats.jpg | Dashboard stat highlight sections |
| 11 | 11_jobstobe_staggered_cards.jpg | Question type/difficulty selectors |
| 12 | 12_thankyou_confirmation.jpg | Success/confirmation states |
| 13 | 13_eduflex_hero.jpg | Login/landing hero elements |

---

## Breakpoint Architecture

### Hook: useBreakpoint()

Location: `frontend/src/hooks/useBreakpoint.ts`
Returns: `'mobile' | 'tablet' | 'desktop'`

| Breakpoint | Width | Layout |
|---|---|---|
| mobile | <= 767px | Bottom nav, full-width single column |
| tablet | 768-1024px | Collapsible sidebar, 2-column grid |
| desktop | > 1024px | Persistent sidebar, multi-column bento grid |

Implementation: ResizeObserver on document.documentElement + window resize event.

### Layout Folder Structure

```
src/layouts/
├── AppLayout.tsx
├── desktop/DesktopLayout.tsx   <- built in Prompt 2
├── tablet/TabletLayout.tsx     <- built in Prompt 2
└── mobile/MobileLayout.tsx     <- built in Prompt 2
```

---

## BANNED PATTERNS (never use)

1. Purple-to-pink or blue-to-purple gradient backgrounds
2. Emoji used as icons or decoration
3. Generic glassmorphism cards (blurred translucent white)
4. Every element having identical border-radius
5. Centered-everything layouts with no asymmetry
6. Icon-in-a-colored-circle badge repeated for every feature
7. 3D isometric illustration style graphics
8. Uniform drop-shadows applied equally to every card

## REQUIRED PATTERNS (always include)

1. Asymmetric grid layouts - bento-style, mismatched card sizes (refs 4, 9, 11)
2. Color as functional blocking - whole card in flat accent color (ref 1)
3. Typography as design element - big bold headlines doing structural work (refs 8, 6)
4. Purposeful motion - hover lifts, staggered entrance, smooth transitions
5. Lucide React outline icons ONLY
6. Warm background #F7F5F1 on every page

---

## Component Inventory

### shadcn/ui Components
button, card, table, input, select, tabs, dialog, badge, dropdown-menu
All in: `src/components/ui/`
Icon library: lucide-react (Nova preset)

### Custom Components
- `src/components/ui/bento-grid.tsx` - BentoGrid + BentoCard (ref image 04)
- `src/components/ui/animated-card.tsx` - AnimatedCard with stagger entrance (refs 09, 11)

### Utility
- `src/lib/utils.ts` - cn() helper (clsx + tailwind-merge)
- `src/lib/motion.ts` - Single source of truth for motion tokens, physics & utilities
- `src/hooks/useBreakpoint.ts` - Breakpoint detection hook

---

## Motion & Animation System

All motion across desktop, tablet, and mobile is centralized in `src/lib/motion.ts` and `src/index.css`.
Components must NEVER scatter hardcoded duration, delay, or easing values.

### Motion Tokens Summary

| Token | Desktop / Tablet | Mobile (Touch) | Purpose |
|---|---|---|---|
| **Stagger Delay** | `60ms` per item | `40ms` per item | Sequential list/grid entrance pacing |
| **Entrance Duration** | `300ms` | `200ms` | Smooth card & section entrance |
| **Entrance Easing** | `cubic-bezier(0.16, 1, 0.3, 1)` | `ease-out` | Decelerating natural arrival |
| **Entrance Transform** | `translateY(12px) -> 0` | `translateY(6px) -> 0` | Lighter vertical displacement on mobile |
| **Hover-Lift Transform** | `-translate-y-1` (-4px) | N/A (Touch) | Standard elevation on mouse hover |
| **Hover-Lift Shadow** | `hover:shadow-md` | N/A (Touch) | Elevated card depth on hover |
| **Hover-Lift Timing** | `200ms ease-out` | N/A (Touch) | Snappy, non-sluggish hover response |
| **Card Touch Press** | `active:scale-[0.99]` | `active:scale-[0.99]` | Tactile compression on touch tap |
| **Button Touch Press** | `active:scale-95` | `active:scale-95` | Instant tactile feedback on button clicks |
| **Press Duration** | `100ms ease-out` | `100ms ease-out` | Snappy tap return |

### Explicitly Non-Animated Scope

To preserve performance, clarity, and focus, the following elements MUST NOT have entrance or morphing animations:
1. **Action Buttons**: Buttons must feel crisp and instant. No sluggish transitions or width morphing (`duration-100` active press only).
2. **Form Inputs**: Focus rings and borders switch with instant feedback (`transition-colors duration-100`). No sliding labels or layout morphs.
3. **Test Attempt Screen**: Under strict minimal-motion constraints (Prompt 4). Deliberately **no** card entrance animations and **no** hover-lifts during exams to prevent visual fatigue and support cognitive calm.

### Usage in Components

```tsx
import { getStaggerDelay, MOTION, CARD_MOTION } from '@/lib/motion';

// 1. Staggered list items
{items.map((item, idx) => (
  <div
    key={item.id}
    style={getStaggerDelay(idx)}
    className={`animate-card-enter bg-surface border border-border rounded-card p-5 shadow-card ${MOTION.hoverLift.className} ${MOTION.touch.card.className}`}
  >
    ...
  </div>
))}

// 2. Or using pre-bundled classes:
<div className={`animate-card-enter ${CARD_MOTION.interactive}`}>
  ...
</div>
```

