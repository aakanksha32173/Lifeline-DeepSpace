/**
 * The shared incident board. Every signed-in responder sees the same live
 * queue and map: `useQuery` subscribes over the RecordRoom WebSocket, so a
 * report submitted in one browser re-ranks the queue in all of them.
 */

import { lazy, Suspense, useMemo, useState } from 'react'
import { useAuthProfileReady, useQuery } from 'deepspace'
import { PlayCircle, RotateCcw } from 'lucide-react'
import { Button, ConfirmModal, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions-client'
import type { IncidentData, ReportData } from '@/server/ingest'
import ReportForm from '@/components/board/ReportForm'
import IncidentQueue from '@/components/board/IncidentQueue'
import IncidentDetail from '@/components/board/IncidentDetail'
import type { Bounds } from '@/components/board/IncidentMap'

// Leaflet touches `window` at import time, so keep it out of any prerender path.
const IncidentMap = lazy(() => import('@/components/board/IncidentMap'))

export default function BoardPage() {
  const { user } = useAuthProfileReady({ requireUser: true })
  const { records: incidents, status } = useQuery<IncidentData>('incidents', {
    orderBy: 'priority',
    orderDir: 'desc',
    limit: 200,
  })
  const { records: quarantined } = useQuery<ReportData>('reports', {
    where: { outcome: 'quarantined' },
    limit: 50,
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)
  const [bounds, setBounds] = useState<Bounds | null>(null)
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null)
  const [pinMode, setPinMode] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const { success, error } = useToast()

  // Highest priority first; ties go to the most recent report.
  const ranked = useMemo(
    () =>
      [...incidents].sort(
        (a, b) => b.data.priority - a.data.priority || b.data.lastReportAt.localeCompare(a.data.lastReportAt),
      ),
    [incidents],
  )
  const active = ranked.filter((i) => i.data.status !== 'resolved')
  const resolved = ranked.filter((i) => i.data.status === 'resolved')
  const selected = incidents.find((i) => i.recordId === selectedId) ?? null
  const critical = active.filter((i) => i.data.priority >= 90).length
  const claimed = active.filter((i) => i.data.status === 'claimed').length

  async function loadDemo() {
    setDemoBusy(true)
    const res = await callAction<{ outcomes: string[] }>('loadDemo')
    setDemoBusy(false)
    if (!res.success) return error('Demo failed', res.error)
    const merged = res.data.outcomes.filter((o) => o === 'merged').length
    success('Demo loaded', `${res.data.outcomes.length} reports in, ${merged} merged into existing incidents.`)
  }

  async function reset() {
    const res = await callAction<{ deleted: number }>('resetBoard')
    setConfirmReset(false)
    if (!res.success) return error('Reset refused', res.error)
    setSelectedId(null)
    success('Board cleared', `${res.data.deleted} records removed.`)
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Left: intake + queue */}
      <aside className="flex w-full flex-col border-border lg:w-[400px] lg:shrink-0 lg:border-r">
        <div className="border-b border-border p-3">
          <ReportForm
            bounds={bounds}
            pin={pin}
            pinMode={pinMode}
            onPinMode={setPinMode}
            onClearPin={() => {
              setPin(null)
              setPinMode(false)
            }}
            onSubmitted={(id) => id && setSelectedId(id)}
          />
        </div>
        <div className="flex items-center gap-3 border-b border-border px-3 py-2 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground">{active.length}</strong> open
          </span>
          <span>
            <strong className="text-red-400">{critical}</strong> critical
          </span>
          <span>
            <strong className="text-sky-300">{claimed}</strong> claimed
          </span>
          <span title={quarantined.map((q) => q.data.text).join('\n')}>
            <strong className="text-foreground">{quarantined.length}</strong> filtered
          </span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={loadDemo} loading={demoBusy}>
            <PlayCircle className="h-3.5 w-3.5" /> Demo
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setConfirmReset(true)} title="Owner only">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {status === 'loading' ? (
            <p className="text-sm text-muted-foreground">Loading incidents…</p>
          ) : (
            <>
              <IncidentQueue incidents={active} selectedId={selectedId} onSelect={setSelectedId} />
              {resolved.length > 0 && (
                <div className="mt-4">
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setShowResolved((v) => !v)}
                  >
                    {showResolved ? 'Hide' : 'Show'} {resolved.length} resolved
                  </button>
                  {showResolved && (
                    <div className="mt-2 opacity-60">
                      <IncidentQueue incidents={resolved} selectedId={selectedId} onSelect={setSelectedId} />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Right: map, with detail panel over it */}
      <section className="relative h-[60vh] min-h-0 flex-1 lg:h-auto">
        <Suspense fallback={<div className="h-full w-full bg-[#0b1220]" />}>
          <IncidentMap
            incidents={incidents}
            selectedId={selectedId}
            onSelect={setSelectedId}
            pin={pin}
            pinMode={pinMode}
            onPin={(lat, lng) => {
              setPin({ lat, lng })
              setPinMode(false)
            }}
            onBounds={setBounds}
          />
        </Suspense>
        {selected && (
          <div className="absolute inset-y-0 right-0 z-[1000] w-full max-w-md border-l border-border bg-background/95 backdrop-blur">
            <IncidentDetail incident={selected} currentUserId={user?.id} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </section>

      <ConfirmModal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={reset}
        title="Clear the board?"
        description="Deletes every report and incident for everyone. Only the app owner can do this."
        confirmText="Clear board"
        variant="destructive"
      />
    </div>
  )
}
