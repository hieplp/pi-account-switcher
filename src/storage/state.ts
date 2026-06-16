import { readFile } from "node:fs/promises";
import z from "zod";
import { STATE_PATH } from "@/constants";
import { fileUtil } from "@/utils";

const sessionStateSchema = z.object({
  activeAccountId: z.string().optional(),
  activeModelId: z.string().optional(),
  activeModelProvider: z.string().optional(),
  lastActive: z.string().optional(),
});

const appStateSchema = z.preprocess(
  (raw) => {
    // Migrate legacy flat format: { activeAccountId, ... } → { sessions: { default: { ... } } }
    if (
      raw &&
      typeof raw === "object" &&
      !("sessions" in raw) &&
      ("activeAccountId" in raw || "activeModelId" in raw)
    ) {
      return { sessions: { default: raw } };
    }
    return raw;
  },
  z.object({
    sessions: z.record(z.string(), sessionStateSchema).default({}),
  }),
);

export interface SessionState {
  activeAccountId?: string;
  activeModelId?: string;
  activeModelProvider?: string;
  lastActive?: string;
}

export interface AppState {
  sessions: Record<string, SessionState>;
}

export interface StateStore {
  load(): Promise<AppState>;
  save(state: AppState): Promise<void>;
  loadSession(sessionKey: string): Promise<SessionState>;
  saveSession(sessionKey: string, state: SessionState): Promise<void>;
  deleteSession(sessionKey: string): Promise<void>;
  sessionExists(sessionKey: string): Promise<boolean>;
  setCleanupDays(days: number): void;
}

export function useStateStore(path = STATE_PATH): StateStore {
  return new StateStoreImpl(path);
}

// ===============================================================================================
// State Store Implementation
// ===============================================================================================

const HARD_CAP = 500;

class StateStoreImpl implements StateStore {
  private cleanupDays = 30;

  constructor(private readonly path: string) {}

  setCleanupDays(days: number): void {
    this.cleanupDays = days;
  }

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

    // Migration: timestamp any pre-upgrade entries so they become TTL-eligible
    for (const [key, entry] of Object.entries(appState.sessions)) {
      if (!entry.lastActive) {
        appState.sessions[key] = { ...entry, lastActive: new Date().toISOString() };
      }
    }

    // Stamp lastActive on the session being written
    const stampedState: SessionState = { ...state, lastActive: new Date().toISOString() };
    appState.sessions[sessionKey] = stampedState;

    // Prune before saving
    const pruned = this.pruneSessions(appState.sessions);
    appState.sessions = pruned;

    await this.save(appState);
  }

  async deleteSession(sessionKey: string): Promise<void> {
    const appState = await this.load();
    delete appState.sessions[sessionKey];
    await this.save(appState);
  }

  async sessionExists(sessionKey: string): Promise<boolean> {
    const appState = await this.load();
    return sessionKey in appState.sessions;
  }

  /**
   * Prune sessions in two passes:
   * 1. TTL eviction: remove entries where lastActive exists AND entry is older than cleanupDays
   * 2. Hard cap: if entries > 500, keep only the 500 most recent
   *
   * Entries without lastActive are preserved (pre-upgrade safety).
   * Entries with invalid lastActive are treated as "recent enough" (not evicted).
   */
  private pruneSessions(sessions: Record<string, SessionState>): Record<string, SessionState> {
    const entries = Object.entries(sessions);
    const now = Date.now();
    const ttlMs = this.cleanupDays * 86400000;

    // TTL pass — keep entries that are either:
    // - without lastActive (pre-upgrade safety)
    // - with valid lastActive that is within TTL
    const ttlFiltered = entries.filter(([, state]) => {
      if (!state.lastActive) return true; // Preserve pre-upgrade entries
      const ts = new Date(state.lastActive).getTime();
      if (isNaN(ts)) return true; // Preserve invalid timestamps
      return now - ts <= ttlMs;
    });

    // Hard cap pass — keep only the 500 most recent
    if (ttlFiltered.length <= HARD_CAP) {
      return Object.fromEntries(ttlFiltered);
    }

    // Sort by lastActive ascending (oldest first), treating undefined as 0
    const sorted = [...ttlFiltered].sort(([, a], [, b]) => {
      const aTs = a.lastActive ? new Date(a.lastActive).getTime() : 0;
      const bTs = b.lastActive ? new Date(b.lastActive).getTime() : 0;
      return aTs - bTs;
    });

    // Keep the last 500 (most recent)
    const trimmed = sorted.slice(-HARD_CAP);
    return Object.fromEntries(trimmed);
  }
}