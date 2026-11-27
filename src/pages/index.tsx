/**
 * Landing page: static and prerendered (no auth call, no WebSocket), so it is
 * cheap and readable by crawlers. The live board is behind sign-in at /board.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'

const STEPS = [
  ['Report', 'Anyone on the team types what they see, in their own words. An AI model reads it for type, urgency, needs and place.'],
  ['Fuse', 'Reports about the same emergency merge into one incident, scored on text, distance, time and type.'],
  ['Rank', 'Every incident gets a 0 to 100 priority with the reasons shown, so the queue explains itself.'],
  ['Respond', 'The board is live for the whole team. Claim an incident so nobody doubles up, then resolve it.'],
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="min-h-screen bg-background px-6 py-16 text-foreground">
        <div className="mx-auto max-w-3xl">
          <p className="mb-4 flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden /> Lifeline
          </p>
          <h1 className="mb-5 text-4xl font-bold tracking-tight sm:text-5xl">
            Ten calls about one flood should be one incident.
          </h1>
          <p className="mb-8 max-w-xl text-lg text-muted-foreground">
            Lifeline turns messy emergency reports into ranked, de-duplicated incidents on a live map that a whole
            response team shares.
          </p>
          <Link
            to="/board"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Open the board
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            Sign in with GitHub or Google, then press <strong>Demo</strong> to load a storm scenario.
          </p>
          <ol className="mt-14 grid gap-4 sm:grid-cols-2">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs font-semibold text-primary">
                  {i + 1}. {title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-10 text-xs text-muted-foreground">
            A prototype for exploring the idea, not a system for real emergency dispatch.
          </p>
        </div>
      </div>
    </>
  )
}
