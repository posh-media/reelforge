// Hardcoded, best-effort estimates. These are NOT exact reconciled bills.
// Refresh when providers publish current pricing.
export const PRICING = {
  anthropic: {
    'claude-3-5-sonnet-20241022': { inputPer1M: 3.0, outputPer1M: 15.0 },
  },
  elevenlabs: {
    'eleven_multilingual_v2': { perCharacter: 0.00003 },
  },
  falai: {
    seedance: { perSecond: 0.05 },
    kling: { perSecond: 0.07 },
    veo: { perSecond: 0.1 },
  },
  synclabs: {
    'lipsync-2': { perSecond: 0.05 },
  },
};

export function estimateAnthropicCost(inputTokens: number, outputTokens: number): number {
  const model = PRICING.anthropic['claude-3-5-sonnet-20241022'];
  return (inputTokens * model.inputPer1M + outputTokens * model.outputPer1M) / 1_000_000;
}

export function estimateElevenLabsCost(characters: number): number {
  return characters * PRICING.elevenlabs['eleven_multilingual_v2'].perCharacter;
}

export function estimateFalCost(modelId: string, durationSeconds: number): number {
  const rate = (PRICING.falai as any)[modelId]?.perSecond ?? 0.05;
  return durationSeconds * rate;
}

export function estimateSyncCost(modelId: string, durationSeconds: number): number {
  const rate = (PRICING.synclabs as any)[modelId]?.perSecond ?? 0.05;
  return durationSeconds * rate;
}
