import { readFile } from "node:fs/promises";
import z from "zod";
import { STATE_PATH } from "../constants";
import { fileUtil } from "../utils";

const sessionStateSchema = z.object({
  activeAccountId: z.string().optional(),
  activeModelId: z.string().optional(),
  activeModelProvider: z.string().optional(),
});

const legacyStateSchema = z.object({
  activeAccountId: z.string().optional(),
  activeModelId: z.string().optional(),
  activeModelProvider: z.string().optional(),
});

const appStateSchema = z.preprocess((raw) => {
  // Migrate legacy flat format: { activeAccountId, ... } → { sessions: { default: { ... } } }
  if (raw && typeof raw === "object" && !("sessions" in raw) && ("activeAccountId" in raw || "activeModelId" in raw)) {
    return { sessions: { default: raw } };
  }
  return raw;
}, z.object({
  sessions: z.record(z.string(), sessionStateSchema).default({}),
}));

export interface SessionState {
  activeAccountId?: string;
  activeModelId?: string;
  activeModelProvider?: string;
}

export interface AppState {
  sessions: Record<string, SessionState>;
}

export interface StateStore {
  load(): Promise<AppState>;
  save(state: AppState): Promise<void>;
  loadSession(sessionKey: string): Promise<SessionState>;
  saveSession(sessionKey: string, state: SessionState): Promise<void>;
}

export function useStateStore(path = STATE_PATH): StateStore {
  return new StateStoreImpl(path);
}

class StateStoreImpl implements StateStore {
  constructor(private readonly path: string) {}

  async load(): Promise<AppState> {
    try {
      const raw = await readFile(this.path, "utf8");
      return appStateSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (fileUtil.isMissingFileError(error)) return { sessions: {} };
      throw error;
    }
  }

  async save(state: AppState): Promise<void> {
    await fileUtil.writePrivateJson(this.path, state);
  }

  async loadSession(sessionKey: string): Promise<SessionState> {
    const appState = await this.load();
    return appState.sessions[sessionKey] ?? {};
  }

  async saveSession(sessionKey: string, state: SessionState): Promise<void> {
    const appState = await this.load();
    appState.sessions[sessionKey] = state;
    await this.save(appState);
  }
}
