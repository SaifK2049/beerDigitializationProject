# Beer Game Digitalization Tool

Web-based Beer Game / Supply Chain classroom tool for a university digitalization project.

## What Is Implemented

- React + TypeScript + Vite app with mobile-friendly role and admin dashboards.
- Local demo persistence through `localStorage`, so the app works immediately without backend credentials.
- Supabase-ready client wrapper and PostgreSQL migration in `supabase/migrations/0001_beer_game_schema.sql`.
- Four role flow: Retailer, Wholesaler, Distributor, Producer.
- Admin/Evaluator flow with lobby, role PINs, start/pause/resume/reset, manual advance, statistics, and CSV export.
- Option B engine:
  - 1-round order delay.
  - Material delay through `Transport -> Wareneingang -> Lager`.
  - Retailer manually enters physical customer demand.
  - Backorder is cumulative.
  - Inventory and backorder cannot both be positive at the end of a round.
  - Producer uses unlimited upstream stock in v1.
- Explainable recommender and warning indicators.
- Unit tests for core Beer Game rules.

## Scripts

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
```

## Local Classroom Demo

1. Run `npm run dev`.
2. Create a game from the home screen.
3. Share the game code and default role PINs shown in the admin lobby:
   - Retailer: `1111`
   - Wholesaler: `2222`
   - Distributor: `3333`
   - Producer: `4444`
   - Admin: `ADMIN`
4. Start the game from the admin lobby.
5. Each role submits its weekly decision before the timer expires.
6. Download the final CSV from the admin dashboard.

The current implementation stores games in the browser for immediate testing. For live multi-device synchronized gameplay, apply the Supabase migration and replace the local store adapter with Supabase RPC/realtime calls.

## Supabase Deployment Path

1. Create a Supabase project.
2. Apply both SQL files in order:
   - `supabase/migrations/0001_beer_game_schema.sql`
   - `supabase/migrations/0002_shared_game_documents.sql`
3. Copy `.env.example` to `.env.local`.
4. Set:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
```

5. Deploy the frontend to Vercel or Netlify.

For GitHub Pages, add repository variables under **Settings -> Secrets and variables -> Actions -> Variables**:

```bash
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

The GitHub Pages workflow passes those variables to the Vite build.

The schema includes the planned normalized domain entities plus `game_documents`, a pragmatic shared JSON document table used by the current frontend for realtime classroom synchronization. This table uses public anon policies for ease of classroom access, so do not store private data in game records. A later production hardening step should move round submission and advancement into Supabase RPC or Edge Functions with stricter role-based access.

## Rule Notes

- Customer demand is not generated or revealed in normal mode. The Retailer must enter the physical customer card value.
- Demo mode can prefill customer demand for testing only.
- There is no chat, notes, or cross-role free text.
- Role dashboards expose only local structured transparency: own inventory, backorder, pipeline, history, costs, recommendation, and warnings.
- Admin/Evaluator can see the full game state and export results.
