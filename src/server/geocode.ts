/**
 * Place name -> coordinates with OpenStreetMap Nominatim, biased to the area
 * the responder is looking at on the map. Nominatim's policy asks for an
 * identifying User-Agent and light use: one request per report, never in a loop.
 */

export interface Viewbox {
  west: number
  south: number
  east: number
  north: number
}

export async function geocode(
  query: string,
  viewbox?: Viewbox,
): Promise<{ lat: number; lng: number; label: string } | null> {
  if (!query.trim()) return null
  const params = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' })
  if (viewbox) {
    params.set('viewbox', [viewbox.west, viewbox.north, viewbox.east, viewbox.south].join(','))
    params.set('bounded', '1')
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'lifeline-deepspace-demo/1.0 (incident triage prototype)' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const hits = (await res.json()) as { lat: string; lon: string; display_name: string }[]
    if (!hits.length) {
      // Retry once without the viewbox: the place may be just off screen.
      return viewbox ? geocode(query) : null
    }
    return { lat: Number(hits[0].lat), lng: Number(hits[0].lon), label: hits[0].display_name }
  } catch (err) {
    console.warn(`[geocode] failed for ${JSON.stringify(query)}: ${String(err)}`)
    return null
  }
}
