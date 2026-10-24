# Web UI standard — single source of truth

**Status:** active · 2026-10-24
**Product/UX source:** `Tabtep-App/docs/UI-UX-PLAN.md` (accepted role/surface map)
**Implementation source:** this document + `src/components/ui/*` + `src/components/dashboard/DashboardLayout.tsx`
**Scope:** authenticated owner/manager web dashboard

## Rule

Do not invent a page-specific visual language. Reuse the dashboard shell,
shared primitives, spacing, and surface tokens. A page may add domain-specific
content, but its shell, controls, status messages, cards and confirmations must
match the rest of the dashboard.

## Page shell

- `DashboardLayout` owns the page title in the sticky header. Do not repeat the
  same `h1` inside the page.
- Page root: `min-h-screen bg-gray-50/50 pb-20`.
- Content: `mx-auto max-w-7xl space-y-5 px-5 pt-4 md:px-6`.
- Page intro or filters use a white toolbar:
  `rounded-xl border border-gray-100 bg-white p-4 shadow-sm`.
- Desktop may use a two-column content grid, but the mobile layout is the
  primary layout: stack sections before adding columns.

## Surfaces

- Cards: `rounded-xl border border-gray-100 bg-white p-4 shadow-sm`.
- Modals: `ConfirmationModal` for destructive/confirmable actions.
- Empty states: white rounded card, restrained icon, short explanation.
- Avoid `rounded-lg border-gray-200` cards on new dashboard pages unless there
  is a specific reason.

## Controls

- Buttons: `src/components/ui/Button.tsx` (`primary`, `outline`, `danger`,
  sizes, loading).
- Loading: `src/components/ui/LoadingSpinner.tsx` or the shared query skeleton.
- Icon-only actions: 44px minimum touch target, `rounded-lg`, gray by default,
  blue on hover/focus; include `aria-label` and `title`.
- Inputs/selects: 40px height, `rounded-lg`, white surface, gray-300 border,
  blue focus ring. The global input style already enforces white background and
  dark text.
- Destructive actions must use `ConfirmationModal`; do not use
  `window.confirm`.

## Status and feedback

- Error: `rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600`
  with an alert icon.
- Success: `rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700`
  with a check icon.
- Status badges: small uppercase, tinted background, text label. Never use
  colour alone.

## Stations & Devices page

`src/app/dashboard/stations/page.tsx` is aligned to this standard:

- dashboard-owned title, no duplicate page `h1`;
- mobile-first max-width content;
- shared `Button`, `LoadingSpinner`, `ConfirmationModal`;
- consistent card/status tokens;
- destructive device revoke uses the shared confirmation modal;
- the refresh action is an accessible icon button, like Staff/Menu.

## Change rule

If a page needs a new primitive, add it to `src/components/ui` and document the
pattern here rather than embedding another one-off style. If a new page
contradicts this document, the page is wrong until this document is explicitly
changed.
