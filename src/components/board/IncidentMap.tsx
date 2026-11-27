import { useEffect } from 'react'
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RecordData } from 'deepspace'
import type { IncidentData } from '@/server/ingest'
import { priorityColor, typeLabel } from './format'

export interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

const SF: [number, number] = [37.78, -122.42]

// Leaflet's default marker icon points at image files the bundler does not
// copy; a small div icon avoids that and matches the theme.
const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:9999px;background:#38bdf8;border:3px solid white;box-shadow:0 0 0 2px #0ea5e9"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

function MapEvents({
  onBounds,
  onClick,
}: {
  onBounds: (b: Bounds) => void
  onClick: (lat: number, lng: number) => void
}) {
  const map = useMapEvents({
    moveend: () => report(),
    click: (e) => onClick(e.latlng.lat, e.latlng.lng),
  })
  function report() {
    const b = map.getBounds()
    onBounds({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() })
  }
  useEffect(report, [])
  return null
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 14), { duration: 0.6 })
  }, [map, target])
  return null
}

export default function IncidentMap({
  incidents,
  selectedId,
  onSelect,
  pin,
  pinMode,
  onPin,
  onBounds,
}: {
  incidents: RecordData<IncidentData>[]
  selectedId: string | null
  onSelect: (id: string) => void
  pin: { lat: number; lng: number } | null
  pinMode: boolean
  onPin: (lat: number, lng: number) => void
  onBounds: (b: Bounds) => void
}) {
  const selected = incidents.find((i) => i.recordId === selectedId)
  const target: [number, number] | null =
    selected && selected.data.lat != null && selected.data.lng != null
      ? [selected.data.lat, selected.data.lng]
      : null

  return (
    <MapContainer
      center={SF}
      zoom={13}
      className="h-full w-full"
      style={{ cursor: pinMode ? 'crosshair' : undefined, background: '#0b1220' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapEvents onBounds={onBounds} onClick={(lat, lng) => pinMode && onPin(lat, lng)} />
      <FlyTo target={target} />
      {incidents
        .filter((i) => i.data.lat != null && i.data.lng != null && i.data.status !== 'resolved')
        .map((i) => {
          const color = priorityColor(i.data.priority)
          const isSel = i.recordId === selectedId
          return (
            <CircleMarker
              key={i.recordId}
              center={[i.data.lat!, i.data.lng!]}
              radius={8 + Math.min(i.data.reportsCount, 6) * 2}
              pathOptions={{
                color: isSel ? '#ffffff' : color,
                weight: isSel ? 3 : 1.5,
                fillColor: color,
                fillOpacity: i.data.status === 'claimed' ? 0.35 : 0.75,
                dashArray: i.data.status === 'claimed' ? '4 3' : undefined,
              }}
              eventHandlers={{ click: () => onSelect(i.recordId) }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <strong>{typeLabel(i.data.eventType)}</strong> · priority {i.data.priority}
                <br />
                {i.data.locationText}
              </Tooltip>
            </CircleMarker>
          )
        })}
      {pin && <Marker position={[pin.lat, pin.lng]} icon={pinIcon} />}
    </MapContainer>
  )
}
