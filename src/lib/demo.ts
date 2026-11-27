/** Scripted San Francisco storm scenario with known coordinates (from the original Lifeline AI). */

import type { Source } from './pipeline/types'

export interface DemoReport {
  text: string
  source: Source
  locationText: string
  lat?: number
  lng?: number
}

export const DEMO_REPORTS: DemoReport[] = [
  {
    "text": "Water rising fast on Mission St near 16th St, cars stalled and two people stranded on a car roof.",
    "source": "field",
    "locationText": "Mission St & 16th St",
    "lat": 37.765,
    "lng": -122.4194
  },
  {
    "text": "Flooding at 16th and Mission, people stuck on top of a car and need a rescue boat.",
    "source": "social",
    "locationText": "16th St & Mission St",
    "lat": 37.7652,
    "lng": -122.419
  },
  {
    "text": "Caller says flooding on Mission St, two people trapped on a vehicle, water waist deep.",
    "source": "voice",
    "locationText": "Mission St",
    "lat": 37.7648,
    "lng": -122.4196
  },
  {
    "text": "Elderly residents at a nursing home on Pine St need oxygen. Power is out and the backup generator failed.",
    "source": "field",
    "locationText": "Pine St",
    "lat": 37.7898,
    "lng": -122.4205
  },
  {
    "text": "Pine St senior home: oxygen concentrators down after the power outage, 12 residents affected.",
    "source": "social",
    "locationText": "Pine St",
    "lat": 37.7899,
    "lng": -122.4203
  },
  {
    "text": "Power outage across the Marina district, traffic lights out on Lombard St.",
    "source": "web",
    "locationText": "Lombard St, Marina",
    "lat": 37.799,
    "lng": -122.436
  },
  {
    "text": "Fallen tree blocking the Embarcadero near Pier 23, road closed in both directions.",
    "source": "field",
    "locationText": "Embarcadero near Pier 23",
    "lat": 37.804,
    "lng": -122.401
  },
  {
    "text": "Smoke and fire reported at a warehouse on 7th St in SoMa, workers evacuating.",
    "source": "social",
    "locationText": "7th St, SoMa",
    "lat": 37.7745,
    "lng": -122.408
  },
  {
    "text": "Lovely sunny afternoon at the park, nothing unusual today.",
    "source": "social",
    "locationText": "Unknown"
  }
]
