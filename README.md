# Lifeline

**A live incident board for disaster response, built on DeepSpace.**

During an emergency the same flood gets reported ten times: by a field unit, a phone call, three social posts. Lifeline reads each report, works out whether it describes an incident the team already knows about, and keeps one ranked, de-duplicated queue on a map that every responder sees update in real time.

Live app: https://lifeline.app.space

## Try it

1. Open the app and sign in with GitHub or Google.
2. Press **Demo** to load a scripted San Francisco storm: 9 reports become 5 incidents, and one non-emergency post is filtered out.
3. Type your own report, for example *"Grandma's oxygen machine stopped when the power went out, Pine St near Polk"*. Watch it merge into the existing Pine St incident and the queue re-rank.
4. Open an incident to see why it has its priority, which reports were fused into it, and the match score for each. Press **I'm on it** to claim it, and open the board in a second browser to see the claim appear live.

## How it works

```
report text ──► AI extraction ──► geocode ──► triage ──► fusion ──► score ──► live board
 (+ optional     (type, urgency,   (Nominatim,  (filter    (match against   (0-100 with    (useQuery over
  map pin)        needs, people,    biased to    chatter)   open incidents)  reasons)       WebSocket)
                  place)            the map view)
```

- **Extraction** (`src/server/extract-ai.ts`): Claude Haiku, through DeepSpace's AI proxy, returns a typed object (event type, urgency 1 to 10, needs, people affected, a geocodable place). If the model call fails or times out, the deterministic rules extractor (`src/lib/pipeline/rules.ts`) takes over, and the report is labelled "read by rules".
- **Location**: a pin dropped on the map wins. Otherwise the place the model found is geocoded with OpenStreetMap Nominatim, biased to the area currently on screen.
- **Triage**: reports that score below 0.5 on actionability are kept but quarantined, so "lovely sunny afternoon" never becomes an incident.
- **Fusion** (`src/lib/pipeline/fusion.ts`): each open incident within 5 km is scored as `0.45 × text similarity + 0.25 × distance + 0.20 × time gap + 0.10 × type compatibility`. A score of 0.62 or more merges the report; otherwise it opens a new incident. Text similarity uses hashed n-gram vectors, so it runs inside the request with no model call.
- **Priority** (`src/lib/pipeline/scoring.ts`): urgency, medical needs, vulnerable people, number affected, and independent sources, each listed as a reason on the incident.

## How DeepSpace is used

| Need | DeepSpace primitive | Where |
| --- | --- | --- |
| Shared, live data | `RecordRoom` collections with `useQuery`; every browser re-renders when the room changes | `src/schemas/incident-schemas.ts`, `src/pages/(app)/(protected)/board.tsx` |
| Consistent writes | Server actions. Members can read `incidents` and `reports` but cannot write them; only the pipeline in the worker does | `src/actions/index.ts`, `src/server/ingest.ts` |
| Who is responding | Auth (GitHub/Google) and the `users` collection; claims record the responder's name | `claimIncident` in `src/actions/index.ts` |
| Reading free text | `createDeepSpaceAI(env, 'anthropic')` with the AI SDK's structured output, billed to the app owner | `src/server/extract-ai.ts` |
| Hosting | `npx deepspace deploy` to a Cloudflare Worker at `*.app.space` | |

This replaces the original Python prototype's Redis streams, Server-Sent Events, and local Ollama model with platform primitives, which is most of why the rewrite is smaller.

### Left out on purpose

- **Voice transcription.** The original used Whisper, which needs Python. A browser speech API would work, but typed reports already exercise the whole pipeline.
- **Scheduled feeds (NWS, USGS).** DeepSpace's `CronRoom` fits this well and is the first thing I'd add. It wasn't needed to show the core flow.
- **Presence and messaging.** Claims already stop two responders from taking the same incident. Chat would duplicate the team's radio or phone.
- **Payments, file uploads, maps from a paid provider.** None of them improve triage. The map uses free OpenStreetMap / CARTO tiles with Leaflet.

## Main tradeoff

**An LLM does the extraction, with rules as the fallback.** The model handles the way people actually write under stress ("O2 machine died", "water up to the doors") far better than keyword rules, which miss anything they weren't written for. The cost is a paid call per report, a few hundred milliseconds of latency, and the chance of a wrong reading. To keep that visible and safe: every incident shows the reasons behind its score and which reports were read by AI versus rules; the scripted demo uses the rules so it is free and identical on every run; and fusion and scoring stay deterministic code with unit tests, so the model only influences the fields it reads from text.

## Known limits

- Two reports that arrive in the same instant can both open a new incident for the same event, because fusion reads then writes without a lock. Routing every report through one `JobRoom` queue would serialize them.
- Candidate incidents are scanned in the worker (up to 200 open). Fine for a team's board; a city-wide deployment would want a geo index.
- Nominatim's public server is for light use. A production deployment would self-host it or use a geocoding integration.
- This is a prototype for exploring the idea, not a system for real emergency dispatch.

## Develop

Requires Node 22.15+ and npm 11.6+.

```bash
npm install
npx deepspace auth login     # browser sign-in
npx deepspace dev start      # http://localhost:5173
npm run test:unit            # pipeline tests (fusion of the demo scenario, ranking, claims)
npx deepspace deploy
```

## Project layout

```
src/lib/pipeline/     pure TypeScript: rules extraction, embeddings, fusion, scoring (runs in worker, browser and tests)
src/server/           worker-only: AI extraction, geocoding, ingest (the single writer of reports/incidents)
src/actions/          server actions the board calls: submitReport, loadDemo, claim/release/resolve, resetBoard
src/schemas/          incidents and reports collections, read-only to members
src/components/board/ map, queue, report form, incident detail
src/pages/            static landing page and the signed-in board
```
