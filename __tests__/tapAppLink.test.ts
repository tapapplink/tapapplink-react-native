const asyncStore = new Map<string, string>();

jest.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "ios", isPad: false },
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => asyncStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      asyncStore.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      asyncStore.delete(key);
    }),
  },
}));

import { TapAppLink } from "../src/tapAppLink";
import { STORAGE_KEY } from "../src/storage";

describe("TapAppLink", () => {
  beforeEach(async () => {
    asyncStore.clear();
    await TapAppLink.resetForTesting();
    jest.clearAllMocks();
  });

  it("requires configure before trackInstall", async () => {
    await expect(TapAppLink.trackInstall()).rejects.toThrow(
      "TapAppLink.configure() must be called first",
    );
  });

  it("tracks install once, sends installId, and caches offer", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        attributionId: "attr_123",
        offer: {
          creatorName: "Ada",
          promoCode: "ADA10",
          billingOfferId: "offer_1",
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    TapAppLink.configure({
      publicKey: "etk_test_key",
      environment: "sandbox",
      ingestUrl: "https://example.test",
    });

    const first = await TapAppLink.trackInstall();
    const second = await TapAppLink.trackInstall();

    expect(first).toMatchObject({ attributionId: "attr_123" });
    expect(second).toMatchObject({
      matched: false,
      skipped: true,
      attributionId: "attr_123",
      offer: {
        creatorName: "Ada",
        promoCode: "ADA10",
        billingOfferId: "offer_1",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as { body: string }).body,
    ) as { installId: string };
    expect(typeof body.installId).toBe("string");
    expect(body.installId.length).toBeGreaterThan(0);
    expect(TapAppLink.getInstallId()).toBe(body.installId);
    expect(TapAppLink.getOffer()).toEqual({
      creatorName: "Ada",
      promoCode: "ADA10",
      billingOfferId: "offer_1",
    });
    expect(TapAppLink.getAttributionId()).toBe("attr_123");
    expect(asyncStore.get(STORAGE_KEY)).toContain("attr_123");
  });

  it("does not post ingestInstall again after a cold start with persisted state", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        attributionId: "attr_cold",
        offer: {
          creatorName: "Bea",
          promoCode: null,
          billingOfferId: "offer_2",
        },
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    TapAppLink.configure({
      publicKey: "etk_test_key",
      environment: "sandbox",
      ingestUrl: "https://example.test",
    });
    await TapAppLink.trackInstall();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const installId = TapAppLink.getInstallId();

    // Simulate process death: clear in-memory SDK state but keep AsyncStorage.
    const persisted = asyncStore.get(STORAGE_KEY);
    expect(persisted).toBeTruthy();
    await TapAppLink.resetForTesting();
    asyncStore.set(STORAGE_KEY, persisted!);

    TapAppLink.configure({
      publicKey: "etk_test_key",
      environment: "sandbox",
      ingestUrl: "https://example.test",
    });
    const resumed = await TapAppLink.trackInstall();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resumed).toMatchObject({
      skipped: true,
      installId,
      attributionId: "attr_cold",
      offer: {
        creatorName: "Bea",
        promoCode: null,
        billingOfferId: "offer_2",
      },
    });
    expect(TapAppLink.getAttributionId()).toBe("attr_cold");
    expect(TapAppLink.getOffer()?.creatorName).toBe("Bea");
  });

  it("sends stored attributionId on identify after hydrate", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ attributionId: "attr_id_9" }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    TapAppLink.configure({
      publicKey: "etk_test_key",
      environment: "sandbox",
      ingestUrl: "https://example.test",
    });
    await TapAppLink.trackInstall();

    const persisted = asyncStore.get(STORAGE_KEY)!;
    await TapAppLink.resetForTesting();
    asyncStore.set(STORAGE_KEY, persisted);

    TapAppLink.configure({
      publicKey: "etk_test_key",
      environment: "sandbox",
      ingestUrl: "https://example.test",
    });
    await TapAppLink.setAppUserId("user_42");

    expect(TapAppLink.getAppUserId()).toBe("user_42");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const identifyBody = JSON.parse(
      (fetchMock.mock.calls[1][1] as { body: string }).body,
    ) as { appUserId: string; attributionId: string };
    expect(identifyBody).toEqual({
      appUserId: "user_42",
      attributionId: "attr_id_9",
    });
  });

  it("redacts the API key in debug logs", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ attributionId: "attr_dbg" }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    TapAppLink.configure({
      publicKey: "etk_live_supersecret",
      environment: "sandbox",
      ingestUrl: "https://example.test",
      debug: true,
    });
    await TapAppLink.trackInstall();

    const logged = logSpy.mock.calls.map((call) => JSON.stringify(call));
    expect(logged.some((line) => line.includes("etk_live_supersecret"))).toBe(
      false,
    );
    expect(logged.some((line) => line.includes("etk_...cret"))).toBe(true);
    logSpy.mockRestore();
  });
});
