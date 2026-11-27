import { useState } from 'react'
import { useQuery, type RecordData } from 'deepspace'
import { CheckCircle2, Hand, Undo2, X } from 'lucide-react'
import { Badge, Button, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions-client'
import type { IncidentData, ReportData } from '@/server/ingest'
import type { FusionBreakdown } from '@/lib/pipeline/types'
import { asArray, asObject, priorityColor, timeAgo, typeLabel } from './format'

export default function IncidentDetail({
  incident,
  currentUserId,
  onClose,
}: {
  incident: RecordData<IncidentData>
  currentUserId: string | undefined
  onClose: () => void
}) {
  const d = incident.data
  const { records: reports } = useQuery<ReportData>('reports', {
    where: { incidentId: incident.recordId },
    orderBy: 'reportedAt',
    orderDir: 'asc',
  })
  const [busy, setBusy] = useState<string | null>(null)
  const { error } = useToast()

  async function act(name: string) {
    setBusy(name)
    const res = await callAction(name, { id: incident.recordId })
    setBusy(null)
    if (!res.success) error('Could not update incident', res.error)
  }

  const mine = d.claimedBy === currentUserId
  const reasons = asArray(d.reasons)
  const needs = asArray(d.needs)

  return (
    <div className="flex h-full flex-col" data-testid="incident-detail">
      <div className="flex items-start gap-3 border-b border-border p-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-black"
          style={{ background: priorityColor(d.priority) }}
        >
          {d.priority}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">
            {typeLabel(d.eventType)} · {d.locationText}
          </h2>
          <p className="text-xs text-muted-foreground">
            {d.reportsCount} report{d.reportsCount === 1 ? '' : 's'} · last {timeAgo(d.lastReportAt)} · about{' '}
            {d.peopleAffected} affected
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        <section className="rounded-md border border-primary/40 bg-primary/10 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Recommended action</p>
          <p className="mt-0.5 font-medium text-foreground">{d.recommendedAction}</p>
        </section>

        <div className="flex flex-wrap gap-2">
          {d.status === 'resolved' ? (
            <Badge variant="success">Resolved</Badge>
          ) : d.status === 'claimed' && !mine ? (
            <Badge variant="info">Claimed by {d.claimedByName}</Badge>
          ) : d.status === 'claimed' && mine ? (
            <>
              <Button size="sm" onClick={() => act('resolveIncident')} loading={busy === 'resolveIncident'}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark resolved
              </Button>
              <Button size="sm" variant="outline" onClick={() => act('releaseIncident')} loading={busy === 'releaseIncident'}>
                <Undo2 className="h-3.5 w-3.5" /> Release
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => act('claimIncident')} loading={busy === 'claimIncident'}>
              <Hand className="h-3.5 w-3.5" /> I'm on it
            </Button>
          )}
        </div>

        <section>
          <h3 className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Why this priority</h3>
          <ul className="space-y-0.5">
            {reasons.map((r) => (
              <li key={r} className="text-foreground/90">
                • {r}
              </li>
            ))}
          </ul>
          {needs.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {needs.map((n) => (
                <Badge key={n} variant="outline" size="sm">
                  {n}
                </Badge>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Fused reports</h3>
          <ol className="space-y-2">
            {reports.map((r) => {
              const f = asObject<FusionBreakdown>(r.data.fusion)
              return (
                <li key={r.recordId} className="rounded-md border border-border bg-card p-2.5">
                  <p className="text-foreground/90">"{r.data.text}"</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.data.source} · {r.data.submittedByName} · {timeAgo(r.data.reportedAt)} ·{' '}
                    {r.data.extractedBy === 'ai' ? 'read by AI' : 'read by rules'}
                  </p>
                  {f && (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      match {f.total.toFixed(2)} = text {f.semantic.toFixed(2)} · place {f.location.toFixed(2)} · time{' '}
                      {f.time.toFixed(2)} · type {f.type.toFixed(2)}
                    </p>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      </div>
    </div>
  )
}
