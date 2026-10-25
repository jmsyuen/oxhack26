import { createRoot } from "react-dom/client";
import App from "@/components/App";
import { runtime } from "@/lib/runtime";
import { claudeBackend } from "./claudeBackend";

type ClaudeRt = { use: (n: string) => Promise<{ save?: (r: { filename: string; data: string }) => Promise<unknown> } | null> };

runtime.hasServer = false;
runtime.analyst = claudeBackend;
const blobSave = runtime.saveFile;
runtime.saveFile = async (name, text, mime) => {
  const rt = (window as unknown as { claude?: ClaudeRt }).claude;
  const dl = rt?.use ? await rt.use("downloads").catch(() => null) : null;
  if (dl?.save) { try { await dl.save({ filename: name, data: text }); return; } catch { /* declined: nothing else to do */ return; } }
  return blobSave(name, text, mime);
};
const el = document.getElementById("cp-data");
(window as unknown as { __CHOKEPOINT_DATA__: unknown }).__CHOKEPOINT_DATA__ = JSON.parse(el?.textContent ?? "{}");
createRoot(document.getElementById("root")!).render(<App />);
