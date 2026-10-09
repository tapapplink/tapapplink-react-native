jest.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "ios", isPad: false },
}));

import { TapAppLink } from "../src/tapAppLink";

describe("TapAppLink", () => {
  beforeEach(async () => {
    await TapAppLink.resetForTesting();
    jest.restoreAllMocks();
  });

  it("requires configure before trackInstall", async () => {
    await expect(TapAppLink.trackInstall()).rejects.toThrow(
      "TapAppLink.configure() must be called first",
    );
  });

  it("tracks install once and caches offer", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
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
      publicKey: "etk_test",
      environment: "sandbox",
      ingestUrl: "https://example.test",
    });

    const first = await TapAppLink.trackInstall();
    const second = await TapAppLink.trackInstall();

    expect(first).toMatchObject({ attributionId: "attr_123" });
    expect(second).toEqual({ matched: false, skipped: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(TapAppLink.getOffer()).toEqual({
      creatorName: "Ada",
      promoCode: "ADA10",
      billingOfferId: "offer_1",
    });
    expect(TapAppLink.getAttributionId()).toBe("attr_123");
  });

  it("posts identify with app user id", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({ ok: true }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    TapAppLink.configure({
      publicKey: "etk_test",
      environment: "sandbox",
      ingestUrl: "https://example.test",
    });

    await TapAppLink.setAppUserId("user_42");

    expect(TapAppLink.getAppUserId()).toBe("user_42");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/ingestIdentify",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer etk_test",
        }),
      }),
    );
  });
});
