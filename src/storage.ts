export type PendingRedeemState = {
  normalisedCode: string;
  requestId: string;
};

export type PersistedInstallState = {
  installId: string;
  tracked: boolean;
  attributionId?: string;
  offer?: {
    creatorName: string;
    promoCode: string | null;
    billingOfferId: string | null;
  } | null;
  /** Pending redeem attempt so retries after restart reuse the same requestId. */
  pendingRedeem?: PendingRedeemState | null;
};

export type KeyValueStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export const STORAGE_KEY = "@tapapplink/react-native/installState";

let memoryFallback: string | null = null;
let warnedMissingStorage = false;

const memoryStorage = (): KeyValueStorage => ({
  getItem: async () => memoryFallback,
  setItem: async (_key, value) => {
    memoryFallback = value;
  },
  removeItem: async () => {
    memoryFallback = null;
  },
});

/**
 * Prefer AsyncStorage so install state survives cold starts on both iOS and
 * Android (Expo and bare). The Android native module alone cannot cover iOS.
 */
export const resolveStorage = (): KeyValueStorage => {
  try {
    // Optional peer; resolve at runtime so the SDK still loads without it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@react-native-async-storage/async-storage") as {
      default?: KeyValueStorage;
    } & KeyValueStorage;
    const storage = mod.default ?? mod;
    if (
      storage &&
      typeof storage.getItem === "function" &&
      typeof storage.setItem === "function"
    ) {
      return storage;
    }
  } catch {
    // fall through
  }

  if (!warnedMissingStorage) {
    warnedMissingStorage = true;
    console.warn(
      "[TapAppLink] @react-native-async-storage/async-storage is not installed. Install state cannot persist, so each cold launch will post a new /ingestInstall until you add AsyncStorage.",
    );
  }
  return memoryStorage();
};

export const loadInstallState = async (
  storage: KeyValueStorage,
): Promise<PersistedInstallState | null> => {
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedInstallState;
    if (!parsed || typeof parsed.installId !== "string") return null;
    const pending = parsed.pendingRedeem;
    const pendingRedeem =
      pending &&
      typeof pending === "object" &&
      typeof pending.normalisedCode === "string" &&
      typeof pending.requestId === "string"
        ? {
            normalisedCode: pending.normalisedCode,
            requestId: pending.requestId,
          }
        : null;

    return {
      installId: parsed.installId,
      tracked: Boolean(parsed.tracked),
      attributionId:
        typeof parsed.attributionId === "string"
          ? parsed.attributionId
          : undefined,
      offer: parsed.offer ?? null,
      pendingRedeem,
    };
  } catch {
    return null;
  }
};

export const saveInstallState = async (
  storage: KeyValueStorage,
  state: PersistedInstallState,
): Promise<void> => {
  await storage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const clearInstallState = async (
  storage: KeyValueStorage,
): Promise<void> => {
  memoryFallback = null;
  await storage.removeItem(STORAGE_KEY);
};

export const resetStorageHelpersForTesting = () => {
  memoryFallback = null;
  warnedMissingStorage = false;
};

export const createInstallId = (): string => {
  const cryptoObj =
    typeof globalThis !== "undefined"
      ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
      : undefined;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  // RFC 4122 version 4 fallback when randomUUID is unavailable.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
};
