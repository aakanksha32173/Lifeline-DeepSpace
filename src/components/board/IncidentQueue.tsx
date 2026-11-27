import type { RecordData } from 'deepspace'
import type { IncidentData } from '@/server/ingest'
import { cn } from '@/lib/utils'
import { priorityColor, timeAgo, typeLabel } from './format'

export default function IncidentQueue({
  incidents,
  selectedId,
  onSelect,
}: {
  incidents: RecordData<IncidentData>[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (incidents.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-muted-foreground">
        No open incidents. Submit a report, or load the demo scenario.
      </p>
    )
  }
  return (
    <ol className="space-y-1.5" data-testid="incident-queue">
      {incidents.map((i, idx) => (
        <li key={i.recordId}>
          <button
            onClick={() => onSelect(i.recordId)}
            className={cn(
              'flex w-full items-start gap-3 rounded-md border p-2.5 text-left transition-colors',
              i.recordId === selectedId
                ? 'border-primary/70 bg-accent'
                : 'border-border bg-card hover:bg-accent/60',
            )}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-bold text-black tabular-nums"
              style={{ background: priorityColor(i.data.priority) }}
              title={`Priority ${i.data.priority}/100`}
            >
              {i.data.priority}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {idx + 1}. {typeLabel(i.data.eventType)}
                </span>
                <span>· {i.data.reportsCount} report{i.data.reportsCount === 1 ? '' : 's'}</span>
                <span>· {timeAgo(i.data.lastReportAt)}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm text-foreground/90">{i.data.summary}</p>
              {i.data.status === 'claimed' && (
                <p className="mt-1 text-xs text-sky-300">Claimed by {i.data.claimedByName}</p>
              )}
            </div>
          </button>
        </li>
      ))}
    </ol>
  )
}
