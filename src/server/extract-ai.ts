/**
 * LLM extraction through DeepSpace's AI proxy, with the rules extractor as a
 * fallback. The model reads messy free text far better than keyword rules
 * ("grandma's O2 machine died when the lights went out" has no rule keyword
 * for oxygen), but it can fail or be slow, so the pipeline never depends on it.
 */

import { generateText, Output } from 'ai'
import { z } from 'zod/v4'
import { createDeepSpaceAI } from 'deepspace/worker'
import type { DeepSpaceAIEnv } from 'deepspace/worker'
import { extractWithRules, type RulesInput } from '../lib/pipeline/rules'
import { EVENT_TYPES, type ExtractedEvent } from '../lib/pipeline/types'

const MODEL = 'claude-haiku-5-5'
const TIMEOUT_MS = 12_000

const extractionSchema = z.object({
  eventType: z.enum(EVENT_TYPES),
  urgency: z.number().int().min(1).max(10),
  needs: z.array(z.string()).max(8),
  peopleAffected: z.number().int().min(1).max(100_000),
  locationQuery: z
    .string()
    .describe('Most specific place mentioned, written as a geocoder query, or empty if none'),
})

const SYSTEM = `You triage emergency reports for disaster responders.
Return structured fields only. Rules:
- eventType: the single best category. Use medical_rescue when someone needs medical help or equipment (oxygen, insulin, dialysis, injuries).
- urgency 1-10: 9-10 life at immediate risk, 7-8 serious, 4-6 disruptive, 1-3 routine or not an emergency.
- needs: short lowercase nouns from: oxygen, insulin, dialysis, medicine, ambulance, water, food, shelter, evacuation, rescue, power.
- peopleAffected: best estimate of how many people are directly affected; 1 if unclear.
- locationQuery: the place as a geocoder would understand it (e.g. "Mission St & 16th St"). Do not invent a place.`

export interface AiExtraction {
  event: ExtractedEvent
  locationQuery: string
  /** Why the rules fallback was used, when it was. */
  fallbackReason?: string
}

export async function extractEvent(env: DeepSpaceAIEnv, input: RulesInput): Promise<AiExtraction> {
  const rules = extractWithRules(input)
  try {
    const anthropic = createDeepSpaceAI(env, 'anthropic')
    const { output } = await generateText({
      model: anthropic(MODEL),
      system: SYSTEM,
      prompt: `Source: ${input.source}\nReport: ${input.text}`,
      output: Output.object({ schema: extractionSchema }),
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const ai = extractionSchema.parse(output)
    return {
      event: {
        ...rules,
        eventType: ai.eventType,
        urgency: ai.urgency,
        needs: [...new Set(ai.needs.map((n) => n.toLowerCase().trim()).filter(Boolean))],
        peopleAffected: ai.peopleAffected,
        extractedBy: 'ai',
      },
      locationQuery: ai.locationQuery.trim(),
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.warn(`[extract] AI extraction failed, using rules: ${reason}`)
    return { event: rules, locationQuery: input.locationText ?? '', fallbackReason: reason }
  }
}
