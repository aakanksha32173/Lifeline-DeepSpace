import { useState } from 'react'
import { MapPin, Send, X } from 'lucide-react'
import { Button, Textarea, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions-client'
import { SOURCES, type Source } from '@/lib/pipeline/types'
import type { FusionBreakdown } from '@/lib/pipeline/types'
import type { Bounds } from './IncidentMap'

interface SubmitResult {
  outcome: 'merged' | 'created' | 'quarantined'
  incidentId: string | null
  fusion: FusionBreakdown | null
  extractedBy: 'ai' | 'rules'
  located: boolean
  actionability: number
}

const SOURCE_LABEL: Record<Source, string> = {
  field: 'Field unit',
  voice: 'Phone call',
  social: 'Social post',
  web: 'Web',
  weather: 'Weather alert',
  sensor: 'Sensor',
}

export default function ReportForm({
  bounds,
  pin,
  pinMode,
  onPinMode,
  onClearPin,
  onSubmitted,
}: {
  bounds: Bounds | null
  pin: { lat: number; lng: number } | null
  pinMode: boolean
  onPinMode: (on: boolean) => void
  onClearPin: () => void
  onSubmitted: (incidentId: string | null) => void
}) {
  const [text, setText] = useState('')
  const [source, setSource] = useState<Source>('field')
  const [busy, setBusy] = useState(false)
  const { success, error, info } = useToast()

  async function submit() {
    setBusy(true)
    const res = await callAction<SubmitResult>('submitReport', {
      text,
      source,
      ...(pin ?? {}),
      viewbox: bounds,
    })
    setBusy(false)
    if (!res.success) return error('Report not saved', res.error)
    const r = res.data
    const how = r.extractedBy === 'ai' ? 'AI read the report' : 'Read with rules (AI unavailable)'
    const where = r.located ? '' : ' Location not found, so it is off the map.'
    if (r.outcome === 'quarantined') {
      info('Filtered out', `This doesn't look like an emergency (score ${r.actionability}). It's kept in the log.`)
    } else if (r.outcome === 'merged') {
      success('Merged into an existing incident', `${how}. Match score ${r.fusion?.total.toFixed(2)}.${where}`)
    } else {
      success('New incident opened', `${how}.${where}`)
    }
    setText('')
    onClearPin()
    onSubmitted(r.incidentId)
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What's happening, and where? e.g. 'Water up to the doors at 16th and Mission, two people on a car roof'"
        rows={3}
        maxLength={2000}
        aria-label="Report text"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as Source)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
          aria-label="Report source"
        >
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
        {pin ? (
          <button
            onClick={onClearPin}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-sky-500/50 px-2 text-xs text-sky-300"
          >
            <MapPin className="h-3.5 w-3.5" /> Pinned <X className="h-3 w-3" />
          </button>
        ) : (
          <button
            onClick={() => onPinMode(!pinMode)}
            className={`inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs ${pinMode ? 'border-sky-500 text-sky-300' : 'border-border text-muted-foreground hover:text-foreground'}`}
            title="Optional: click the map to set the exact spot"
          >
            <MapPin className="h-3.5 w-3.5" /> {pinMode ? 'Click the map…' : 'Drop pin'}
          </button>
        )}
        <div className="flex-1" />
        <Button size="sm" onClick={submit} disabled={busy || !text.trim()} loading={busy}>
          <Send className="h-3.5 w-3.5" /> Submit
        </Button>
      </div>
    </div>
  )
}
