/**
 * Server-only configuration. API keys are read from environment variables, which Next.js loads
 * from .env.local (gitignored). They are never imported by client components.
 */
export function getConfig() {
  const v = (k: string) => (process.env[k] ?? "").trim();
  return {
    gemini: { key: v("GEMINI_API_KEY"), model: v("GEMINI_MODEL") || "gemini-2.5-flash" },
    elevenlabs: {
      key: v("ELEVENLABS_API_KEY"),
      voiceId: v("ELEVENLABS_VOICE_ID") || "21m00Tcm4TlvDq8ikWAM",
      modelId: v("ELEVENLABS_MODEL_ID") || "eleven_flash_v2_5",
    },
    fred: { key: v("FRED_API_KEY") },
  };
}
