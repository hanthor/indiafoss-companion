import { registerPlugin } from '@capacitor/core';

/** A peer the on-device Neutrino node has discovered over BLE / LAN. */
export interface NeutrinoPeer {
  /** 64-hex Ed25519 node id, the peer's Matrix `server_name`. */
  serverName: string;
  displayName: string;
  lastSeenMs: number;
}

export interface NeutrinoStatus {
  /** False on the web/iOS PWA and on Android builds without the plugin. */
  available: boolean;
  running: boolean;
  /** Client-server API base URL on loopback when running. */
  baseUrl: string | null;
  serverName: string | null;
  error: string | null;
}

export interface NeutrinoPlugin {
  start(): Promise<NeutrinoStatus>;
  stop(): Promise<NeutrinoStatus>;
  status(): Promise<NeutrinoStatus>;
  peers(): Promise<{ peers: NeutrinoPeer[] }>;
}

export const UNAVAILABLE: NeutrinoStatus = {
  available: false,
  running: false,
  baseUrl: null,
  serverName: null,
  error: null,
};

const webStub: NeutrinoPlugin = {
  start: async () => UNAVAILABLE,
  stop: async () => UNAVAILABLE,
  status: async () => UNAVAILABLE,
  peers: async () => ({ peers: [] }),
};

/**
 * Bridge to the Android `NeutrinoPlugin` (apps/android/capacitor/neutrino).
 * Every call degrades to "unavailable" when the plugin is not compiled in, so
 * the companion never depends on it.
 */
const Neutrino = registerPlugin<NeutrinoPlugin>('Neutrino', {
  web: () => Promise.resolve(webStub),
});

async function guarded<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export interface MeshNode {
  baseUrl: string;
  serverName: string | null;
  /** True when the node was started by the native plugin (not just found on a port). */
  native: boolean;
}

/** Ports an embedded Neutrino node may listen on (plugin default first). */
export const MESH_PORTS = [8008, 3000];

/** Probe loopback for a Neutrino client-server API without the plugin. */
export async function probeMeshHomeserver(): Promise<string | null> {
  for (const port of MESH_PORTS) {
    const base = `http://127.0.0.1:${port}`;
    try {
      const res = await fetch(`${base}/_matrix/client/versions`, {
        signal: AbortSignal.timeout(1200),
      });
      if (res.ok) return base;
    } catch {
      /* not running */
    }
  }
  return null;
}

/**
 * Start (or find) the on-device mesh node. Returns null when there is none,
 * which is the normal case on the web PWA.
 */
export async function startMeshNode(): Promise<MeshNode | null> {
  const status = await guarded(() => Neutrino.start(), UNAVAILABLE);
  if (status.available && status.running && status.baseUrl) {
    return { baseUrl: status.baseUrl, serverName: status.serverName, native: true };
  }
  const probed = await probeMeshHomeserver();
  return probed ? { baseUrl: probed, serverName: null, native: false } : null;
}

export async function stopMeshNode(): Promise<void> {
  await guarded(() => Neutrino.stop(), UNAVAILABLE);
}

export async function meshStatus(): Promise<NeutrinoStatus> {
  return guarded(() => Neutrino.status(), UNAVAILABLE);
}

export async function meshPeers(): Promise<NeutrinoPeer[]> {
  const res = await guarded(() => Neutrino.peers(), { peers: [] });
  return res.peers ?? [];
}

export function shortServerName(serverName: string | null | undefined): string {
  if (!serverName) return '';
  return serverName.length > 12 ? `${serverName.slice(0, 6)}…${serverName.slice(-4)}` : serverName;
}
