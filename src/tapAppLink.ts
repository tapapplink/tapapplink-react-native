import { NativeModules, Platform } from "react-native";

export type TapAppLinkEnvironment = "production" | "sandbox";

export type TapAppLinkOffer = {
  creatorName: string;
  promoCode: string | null;
  discountBps: number;
  billingOfferId: string | null;
};

export type TapAppLinkConfig = {
  publicKey: string;
  environment: TapAppLinkEnvironment;
  ingestUrl?: string;
};

type NativeSignals = {
  deviceFamily?: string;
  locale?: string;
  networkContext?: string;
  installReferrer?: string;
};

type NativeTapAppLink = {
  getInstallSignals?: () => Promise<NativeSignals>;
};

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
let tracked = false;
let lastAttributionId: string | undefined;
let lastAppUserId: string | undefined;
let lastOffer: TapAppLinkOffer | null = null;

const ingestBase = (cfg: TapAppLinkConfig): string => {
  if (cfg.ingestUrl) return cfg.ingestUrl.replace(/\/$/, "");
  return "https://us-central1-tapapplink.cloudfunctions.net";
};

const post = async (path: string, body: unknown) => {
  if (!config) {
    throw new Error("TapAppLink.configure() must be called first");
  }
  const response = await fetch(`${ingestBase(config)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.publicKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<Record<string, unknown>>;
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

export const TapAppLink = {
  configure: (next: TapAppLinkConfig) => {
    config = next;
  },

  trackInstall: async () => {
    if (tracked) {
      return { matched: false, skipped: true };
    }
    const signals = await collectSignals();
    const result = await post("/ingestInstall", {
      platform:
        Platform.OS === "ios"
          ? "IOS"
          : Platform.OS === "android"
            ? "ANDROID"
            : "UNKNOWN",
      deviceFamily: signals.deviceFamily,
      locale: signals.locale,
      networkContext: signals.networkContext,
      installReferrer: signals.installReferrer,
      firstOpenAt: new Date().toISOString(),
    });
    tracked = true;
    cacheFromResult(result);
    return result;
  },

  setAppUserId: async (appUserId: string) => {
    lastAppUserId = appUserId;
    return post("/ingestIdentify", {
      appUserId,
      attributionId: lastAttributionId,
    });
  },

  applyCode: async (code: string) => {
    const result = await post("/redeemCode", {
      code,
      appUserId: lastAppUserId,
      attributionId: lastAttributionId,
      platform:
        Platform.OS === "ios"
          ? "IOS"
          : Platform.OS === "android"
            ? "ANDROID"
            : "UNKNOWN",
    });
    cacheFromResult(result);
    return result;
  },

  getOffer: () => lastOffer,
  getAttributionId: () => lastAttributionId,
  getAppUserId: () => lastAppUserId,

  linkRevenueCatUser: async (appUserId: string) =>
    TapAppLink.setAppUserId(appUserId),
  linkAdaptyUser: async (customerUserId: string) =>
    TapAppLink.setAppUserId(customerUserId),
  linkSuperwallUser: async (appUserId: string) =>
    TapAppLink.setAppUserId(appUserId),
  linkQonversionUser: async (userId: string) => TapAppLink.setAppUserId(userId),

  resetForTesting: async () => {
    tracked = false;
    lastAttributionId = undefined;
    lastAppUserId = undefined;
    lastOffer = null;
  },
};

export default TapAppLink;
