# `/home2` experiment

## Concept

**Look beyond the listing.** A photographic, editorial sequence contrasts what an advertisement shows with the evidence and unanswered questions a buyer needs. The page is a self-contained experiment; `/` and existing business flows are unchanged.

## Scope and implementation

- New route: `src/app/home2/page.tsx`, `Home2Experience.tsx`, and `home2.module.css`.
- New local photography: `public/home2/` (four JPEGs). No global styles, tokens, APIs, authentication, data tables, or payment code were changed.
- Existing Next.js 15, React 19, `next/image`, and Lucide icons. No new runtime dependency or animation library. CSS transitions, pointer transforms, and Intersection Observer handle motion, with reduced-motion fallbacks.
- Interactions: pointer-responsive hero, keyboard-operable comparison slider, five selectable investigation areas, and five selectable workflow stages. Both primary CTAs link to the existing `/check` intake route.
- All investigation content is labeled as illustrative questions, not verified findings or a diagnostic scan.

## Photography and licensing

All four photographs were downloaded from the linked original Unsplash image endpoints, stored locally, and used under the [Unsplash License](https://unsplash.com/license), which permits free commercial website use. Photographer attribution and source pages:

| Local file | Photographer | Source page | Original image URL |
| --- | --- | --- | --- |
| `honda-fog.jpg` | TopSphere Media | [Gray Honda sedan](https://unsplash.com/photos/gray-honda-sedan-parked-on-road-during-day-ht14f-Hvtcg) | https://images.unsplash.com/photo-1578659258511-4a4e7dee7344 |
| `silver-sedan.jpg` | Kai Winckler | [Silver sedan](https://unsplash.com/photos/silver-sedan-on-parking-lot-IPKKY4SsvPY) | https://images.unsplash.com/photo-1608724344033-c3d860efd60d |
| `dashboard.jpg` | Obi | [Dashboard interior](https://unsplash.com/photos/the-interior-of-a-cars-dashboard-is-displayed-E3Mrc8_AJGM) | https://images.unsplash.com/photo-1751941709682-22ecc301ccdc |
| `dark-profile.jpg` | Lee Tianxian | [Dark side profile](https://unsplash.com/photos/a-dark-side-profile-view-of-a-car-W7PCxobpNO4) | https://images.unsplash.com/photo-1752550218115-0ccc08e4d4b4 |

## Verification

- Real Chrome/Playwright inspection at 1440×900, 1920×1080, 390px mobile, and 375px reduced-motion; two visual passes. Full-page and viewport screenshots are in `output/playwright/` (for example, `home2-1440-full-final.png`, `home2-1920-full-final.png`, `home2-mobile-full-pass2.png`, `home2-reduced-375-full.png`).
- `/home2` loaded with HTTP 200. The original `/` also loaded. No horizontal overflow at the inspected viewport widths; no browser console errors.
- Verified comparison slider by pointer and keyboard, category hotspots, workflow selection, mobile navigation, and hero CTA navigation to the existing `/check` intake.
- TypeScript typecheck and route-targeted ESLint passed. Isolated Next.js production build passed, including `/home2` static generation. Full-repository ESLint is blocked by an unrelated existing `no-require-imports` error in `scripts/knowledge/importer.ts`. Existing tests: 214 passed, one skipped, one unrelated `@/lib/freeQuickCheck` module-resolution failure.

## Performance and limitations

Photography is local and served through responsive `next/image`; the hero is prioritized and later images are lazy. Motion uses transforms/opacity and stops under reduced-motion preference. The experience does not inspect a real vehicle; its questions are examples only. The page is desktop-first; mobile uses simpler composition. A development-only LCP heuristic warning was observed during rapid scripted full-page scrolling, without runtime console errors. Ignored temporary build directories (about 480 MB) remain in `output/` because environment policy denied their cleanup.

## Safe removal

Delete only `src/app/home2/`, `public/home2/`, and this file. Optional ignored verification artifacts are under `output/playwright/` and `output/home2-*`; remove those separately only if screenshots/build evidence are no longer needed. Do not remove or change the existing homepage or intake flow. No production promotion, commit, push, or deployment has been performed.
