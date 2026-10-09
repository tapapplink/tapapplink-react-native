import { NativeModules, Platform } from "react-native";
import {
  clearInstallState,
  createInstallId,
  loadInstallState,
  resetStorageHelpersForTesting,
  resolveStorage,
  saveInstallState,
  type KeyValueStorage,
  type PersistedInstallState,
} from "./storage";

/** Sent as `X-TapAppLink-SDK-Version` on every request. */
export const SDK_VERSION = "0.3.1";

export type TapAppLinkEnvironment = "production" | "sandbox";

export type TapAppLinkOffer = {
  creatorName: string;
  promoCode: string | null;
  billingOfferId: string | null;
};

export type TapAppLinkConfig = {
  publicKey: string;
  environment: TapAppLinkEnvironment;
  ingestUrl?: string;
  /** When true, logs requests, responses and stored state with the API key redacted. */
  debug?: boolean;
};

export type TapAppLinkRedeemErrorCode =
  | "unknownCode"
  | "inactiveCode"
  | "wrongEnvironment"
  | "network"
  | "other";

/**
 * Thrown by `applyCode` when the redeem endpoint fails or the request cannot
 * complete. Inspect `code` to choose customer-facing copy.
 */
export class TapAppLinkRedeemError extends Error {
  readonly name = "TapAppLinkRedeemError";
  readonly code: TapAppLinkRedeemErrorCode;
  /** HTTP status when the server responded; omitted for network failures. */
  readonly status?: number;

  /**
   * Developer-only warning for `wrongEnvironment`. Log this; never show it to
   * customers (they should see the same copy as `unknownCode`).
   */
  static readonly wrongEnvironmentDevWarning =
    "This code belongs to the other environment (Sandbox or Production). Check your API key.";

  constructor(
    code: TapAppLinkRedeemErrorCode,
    message: string,
    status?: number,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

type NativeSignals = {
  deviceFamily?: string;
  locale?: string;
  networkContext?: string;
  installReferrer?: string;
};

type NativeTapAppLink = {
  getInstallSignals?: () => Promise<NativeSignals>;
};

class TapAppLinkHttpError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>, message: string) {
    super(message);
    this.name = "TapAppLinkHttpError";
    this.status = status;
    this.body = body;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const nativeModule = (): NativeTapAppLink => NativeModules.TapAppLink ?? {};

const jsSignals = (): NativeSignals => {
  const locale =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().locale
      : undefined;
  const region = locale?.split(/[-_]/)[1] ?? "unknown";
  const deviceFamily =
    Platform.OS === "ios"
      ? Platform.isPad
        ? "iPad"
        : "iPhone"
      : Platform.OS === "android"
        ? "Android"
        : "unknown";
  return { deviceFamily, locale, networkContext: region };
};

const collectSignals = async (): Promise<NativeSignals> => {
  const fallback = jsSignals();
  if (Platform.OS !== "android") {
    return fallback;
  }
  try {
    const native = await nativeModule().getInstallSignals?.();
    return { ...fallback, ...native };
  } catch {
    return fallback;
  }
};

let config: TapAppLinkConfig | null = null;
let storage: KeyValueStorage = resolveStorage();
let hydratePromise: Promise<void> | null = null;
let installId: string | undefined;
let tracked = false;
let lastAttributionId: string | undefined;
let lastAppUserId: string | undefined;
let lastOffer: TapAppLinkOffer | null = null;

const redactKey = (value: string): string => {
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const debugEnabled = (): boolean => Boolean(config?.debug);

const debugLog = (message: string, details?: unknown) => {
  if (!debugEnabled()) return;
  if (details === undefined) {
    console.log(`[TapAppLink] ${message}`);
    return;
  }
  console.log(`[TapAppLink] ${message}`, details);
};

const applyPersisted = (state: PersistedInstallState) => {
  installId = state.installId;
  tracked = state.tracked;
  lastAttributionId = state.attributionId;
  lastOffer = state.offer ?? null;
};

const persist = async () => {
  if (!installId) return;
  const state: PersistedInstallState = {
    installId,
    tracked,
    attributionId: lastAttributionId,
    offer: lastOffer,
  };
  await saveInstallState(storage, state);
  debugLog("stored state", {
    installId: state.installId,
    tracked: state.tracked,
    attributionId: state.attributionId,
    offer: state.offer,
  });
};

const hydrate = async () => {
  const loaded = await loadInstallState(storage);
  if (loaded) {
    applyPersisted(loaded);
    debugLog("hydrated state", loaded);
  }
};

const ensureHydrated = async () => {
  if (!hydratePromise) {
    hydratePromise = hydrate();
  }
  await hydratePromise;
};

const ingestBase = (cfg: TapAppLinkConfig): string => {
  if (cfg.ingestUrl) return cfg.ingestUrl.replace(/\/$/, "");
  return "https://us-central1-tapapplink.cloudfunctions.net";
};

const parseJsonBody = async (
  response: Response,
): Promise<Record<string, unknown>> => {
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Non-JSON bodies still need a status check below.
  }
  return {};
};

const isOkStatus = (status: number): boolean => status >= 200 && status < 300;

const post = async (path: string, body: unknown) => {
  if (!config) {
    throw new Error("TapAppLink.configure() must be called first");
  }
  const url = `${ingestBase(config)}${path}`;
  const headers = {
    Authorization: `Bearer ${config.publicKey}`,
    "Content-Type": "application/json",
    "X-TapAppLink-SDK-Version": SDK_VERSION,
  };
  debugLog("request", {
    url,
    method: "POST",
    headers: {
      ...headers,
      Authorization: `Bearer ${redactKey(config.publicKey)}`,
    },
    body,
  });
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Network request failed";
    throw new Error(message);
  }
  const result = await parseJsonBody(response);
  debugLog("response", { url, status: response.status, body: result });
  if (!isOkStatus(response.status)) {
    const serverMessage =
      typeof result.message === "string"
        ? result.message
        : typeof result.error === "string"
          ? result.error
          : `Request failed with status ${response.status}`;
    throw new TapAppLinkHttpError(response.status, result, serverMessage);
  }
  return result;
};

const mapRedeemError = (error: unknown): TapAppLinkRedeemError => {
  if (error instanceof TapAppLinkRedeemError) {
    return error;
  }
  if (error instanceof TapAppLinkHttpError) {
    const bodyError =
      typeof error.body.error === "string" ? error.body.error : undefined;
    const message =
      typeof error.body.message === "string"
        ? error.body.message
        : error.message;

    if (bodyError === "unknown_code") {
      return new TapAppLinkRedeemError("unknownCode", message, error.status);
    }
    if (bodyError === "inactive_code") {
      return new TapAppLinkRedeemError("inactiveCode", message, error.status);
    }
    if (bodyError === "wrong_environment") {
      return new TapAppLinkRedeemError(
        "wrongEnvironment",
        message,
        error.status,
      );
    }

    // Status fallback when the body lacks a known `error` field.
    if (error.status === 404) {
      return new TapAppLinkRedeemError("unknownCode", message, error.status);
    }
    if (error.status === 410) {
      return new TapAppLinkRedeemError("inactiveCode", message, error.status);
    }
    if (error.status === 400 && bodyError === "wrong_environment") {
      return new TapAppLinkRedeemError(
        "wrongEnvironment",
        message,
        error.status,
      );
    }

    return new TapAppLinkRedeemError("other", message, error.status);
  }

  const message =
    error instanceof Error ? error.message : "Network request failed";
  return new TapAppLinkRedeemError("network", message);
};

const cacheFromResult = (result: Record<string, unknown>) => {
  if (typeof result.attributionId === "string") {
    lastAttributionId = result.attributionId;
  }
  const offer = result.offer;
  if (offer && typeof offer === "object") {
    lastOffer = offer as TapAppLinkOffer;
  }
};

const platformName = (): "IOS" | "ANDROID" | "UNKNOWN" => {
  if (Platform.OS === "ios") return "IOS";
  if (Platform.OS === "android") return "ANDROID";
  return "UNKNOWN";
};

export const TapAppLink = {
  configure: (next: TapAppLinkConfig) => {
    config = next;
    storage = resolveStorage();
    hydratePromise = hydrate();
    debugLog("configure", {
      environment: next.environment,
      ingestUrl: next.ingestUrl,
      publicKey: redactKey(next.publicKey),
      debug: Boolean(next.debug),
    });
  },

  trackInstall: async () => {
    await ensureHydrated();
    if (tracked) {
      const stored = {
        matched: false,
        skipped: true as const,
        installId,
        attributionId: lastAttributionId,
        offer: lastOffer,
      };
      debugLog("trackInstall skipped; returning stored values", stored);
      return stored;
    }

    if (!installId) {
      installId = createInstallId();
      await persist();
    }

    const signals = await collectSignals();
    const result = await post("/ingestInstall", {
      installId,
      platform: platformName(),
      deviceFamily: signals.deviceFamily,
      locale: signals.locale,
      networkContext: signals.networkContext,
      installReferrer: signals.installReferrer,
      firstOpenAt: new Date().toISOString(),
    });
    tracked = true;
    cacheFromResult(result);
    await persist();
    return result;
  },

  setAppUserId: async (appUserId: string) => {
    await ensureHydrated();
    lastAppUserId = appUserId;
    return post("/ingestIdentify", {
      appUserId,
      attributionId: lastAttributionId,
    });
  },

  applyCode: async (code: string) => {
    await ensureHydrated();
    try {
      const result = await post("/redeemCode", {
        code,
        appUserId: lastAppUserId,
        attributionId: lastAttributionId,
        platform: platformName(),
      });
      cacheFromResult(result);
      await persist();
      return result;
    } catch (error) {
      throw mapRedeemError(error);
    }
  },

  getOffer: () => lastOffer,
  getAttributionId: () => lastAttributionId,
  getAppUserId: () => lastAppUserId,
  getInstallId: () => installId,

  linkRevenueCatUser: async (appUserId: string) =>
    TapAppLink.setAppUserId(appUserId),
  linkAdaptyUser: async (customerUserId: string) =>
    TapAppLink.setAppUserId(customerUserId),
  linkSuperwallUser: async (appUserId: string) =>
    TapAppLink.setAppUserId(appUserId),
  linkQonversionUser: async (userId: string) => TapAppLink.setAppUserId(userId),

  resetForTesting: async () => {
    config = null;
    tracked = false;
    installId = undefined;
    lastAttributionId = undefined;
    lastAppUserId = undefined;
    lastOffer = null;
    hydratePromise = null;
    await clearInstallState(storage);
    resetStorageHelpersForTesting();
    storage = resolveStorage();
  },
};

export default TapAppLink;
