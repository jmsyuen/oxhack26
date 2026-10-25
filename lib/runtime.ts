/**
 * Where the app is running. The Next.js app has server routes (Gemini, ElevenLabs, FRED); the single-file
 * artifact build (artifact/entry.tsx) sets hasServer = false and plugs in its own analyst and file saver.
 */
import type { AnalystBackend } from "./analyst/backends";

export const runtime: {
  hasServer: boolean;
  /** analyst used when there is no server (artifact: Claude via the artifact runtime) */
  analyst: AnalystBackend | null;
  saveFile: (name: string, text: string, mime?: string) => Promise<void>;
} = {
  hasServer: true,
  analyst: null,
  saveFile: async (name, text, mime = "text/csv") => {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};
