import { NextResponse } from "next/server";
import { getConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

/** Which optional services are configured (booleans only, never the keys). */
export function GET() {
  const c = getConfig();
  return NextResponse.json({ gemini: !!c.gemini.key, geminiModel: c.gemini.model, elevenlabs: !!c.elevenlabs.key, fred: !!c.fred.key });
}
