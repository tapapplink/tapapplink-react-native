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

import {
  SDK_VERSION,
  TapAppLink,
  TapAppLinkRedeemError,
} from "../src/tapAppLink";
import { STORAGE_KEY } from "../src/storage";

const configure = () => {
  TapAppLink.configure({
    publicKey: "etk_test_key",
    environment: "sandbox",
    ingestUrl: "https://example.test",
  });
};

const jsonResponse = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
});

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

  it("sends the SDK version header on every request", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, { attributionId: "attr_hdr" }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    configure();
    await TapAppLink.trackInstall();

    const headers = (fetchMock.mock.calls[0][1] as { headers: Record<string, string> })
      .headers;
    expect(headers["X-TapAppLink-SDK-Version"]).toBe("0.3.3");
    expect(SDK_VERSION).toBe("0.3.3");
  });

  it("tracks install once, sends installId, and caches offer", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        attributionId: "attr_123",
        offer: {
          creatorName: "Ada",
          promoCode: "ADA10",
          billingOfferId: "offer_1",
        },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    configure();

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
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        attributionId: "attr_cold",
        offer: {
          creatorName: "Bea",
          promoCode: null,
          billingOfferId: "offer_2",
        },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    configure();
    await TapAppLink.trackInstall();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const installId = TapAppLink.getInstallId();

    // Simulate process death: clear in-memory SDK state but keep AsyncStorage.
    const persisted = asyncStore.get(STORAGE_KEY);
    expect(persisted).toBeTruthy();
    await TapAppLink.resetForTesting();
    asyncStore.set(STORAGE_KEY, persisted!);

    configure();
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
      .mockResolvedValueOnce(jsonResponse(200, { attributionId: "attr_id_9" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    configure();
    await TapAppLink.trackInstall();

    const persisted = asyncStore.get(STORAGE_KEY)!;
    await TapAppLink.resetForTesting();
    asyncStore.set(STORAGE_KEY, persisted);

    configure();
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

  it("skips ingestIdentify when appUserId matches the last successful identify", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { attributionId: "attr_id" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    configure();
    await TapAppLink.trackInstall();
    const first = await TapAppLink.setAppUserId("user_same");
    const second = await TapAppLink.setAppUserId("user_same");

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({
      skipped: true,
      appUserId: "user_same",
      attributionId: "attr_id",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(asyncStore.get(STORAGE_KEY)).toContain("user_same");
  });

  it("does not post ingestIdentify again after a cold start with the same appUserId", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { attributionId: "attr_cold_id" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    configure();
    await TapAppLink.trackInstall();
    await TapAppLink.setAppUserId("user_persisted");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const persisted = asyncStore.get(STORAGE_KEY);
    expect(persisted).toContain("user_persisted");
    await TapAppLink.resetForTesting();
    asyncStore.set(STORAGE_KEY, persisted!);

    configure();
    const resumed = await TapAppLink.setAppUserId("user_persisted");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resumed).toMatchObject({
      skipped: true,
      appUserId: "user_persisted",
      attributionId: "attr_cold_id",
    });
    expect(TapAppLink.getAppUserId()).toBe("user_persisted");
  });

  it("coalesces concurrent identical setAppUserId calls into one POST", async () => {
    let resolveIdentify: ((value: unknown) => void) | undefined;
    const identifyGate = new Promise((resolve) => {
      resolveIdentify = resolve;
    });
    const fetchMock = jest.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/ingestIdentify")) {
        await identifyGate;
        return jsonResponse(200, { ok: true });
      }
      return jsonResponse(200, { attributionId: "attr_race" });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    configure();
    await TapAppLink.trackInstall();

    const a = TapAppLink.setAppUserId("user_race");
    const b = TapAppLink.setAppUserId("user_race");
    const c = TapAppLink.setAppUserId("user_race");
    resolveIdentify?.(undefined);
    const results = await Promise.all([a, b, c]);

    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(results[0]).toMatchObject({ ok: true });
    const identifyCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/ingestIdentify"),
    );
    expect(identifyCalls).toHaveLength(1);
  });

  it("posts ingestIdentify again when appUserId changes", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { attributionId: "attr_change" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    configure();
    await TapAppLink.trackInstall();
    await TapAppLink.setAppUserId("user_a");
    await TapAppLink.setAppUserId("user_b");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const secondIdentify = JSON.parse(
      (fetchMock.mock.calls[2][1] as { body: string }).body,
    ) as { appUserId: string };
    expect(secondIdentify.appUserId).toBe("user_b");
    expect(TapAppLink.getAppUserId()).toBe("user_b");
    expect(asyncStore.get(STORAGE_KEY)).toContain("user_b");
    expect(asyncStore.get(STORAGE_KEY)).not.toContain("user_a");
  });

  it("does not skip identify after a failed ingestIdentify", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { attributionId: "attr_fail" }))
      .mockResolvedValueOnce(jsonResponse(500, { message: "identify failed" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    global.fetch = fetchMock as unknown as typeof fetch;

    configure();
    await TapAppLink.trackInstall();
    await expect(TapAppLink.setAppUserId("user_retry")).rejects.toThrow(
      "identify failed",
    );
    const retry = await TapAppLink.setAppUserId("user_retry");

    expect(retry).toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(asyncStore.get(STORAGE_KEY)).toContain("user_retry");
  });

  it("does not treat a non-2xx ingest response as success", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(500, {
        error: "server_error",
        message: "boom",
        attributionId: "should_not_cache",
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    configure();
    await expect(TapAppLink.trackInstall()).rejects.toThrow("boom");
    expect(TapAppLink.getAttributionId()).toBeUndefined();
  });

  it("redacts the API key in debug logs", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { attributionId: "attr_dbg" }));
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

  describe("applyCode", () => {
    const expectRedeemCode = async (
      status: number,
      body: Record<string, unknown>,
      code: string,
    ) => {
      const fetchMock = jest.fn().mockResolvedValue(jsonResponse(status, body));
      global.fetch = fetchMock as unknown as typeof fetch;
      configure();
      try {
        await TapAppLink.applyCode("BADCODE");
        throw new Error("expected applyCode to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(TapAppLinkRedeemError);
        const redeem = error as TapAppLinkRedeemError;
        expect(redeem.code).toBe(code);
        expect(redeem.status).toBe(status);
      }
      const headers = (
        fetchMock.mock.calls[0][1] as { headers: Record<string, string> }
      ).headers;
      expect(headers["X-TapAppLink-SDK-Version"]).toBe(SDK_VERSION);
    };

    it("returns a success result and caches the offer", async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(200, {
          attributionId: "attr_applied",
          alreadyAttributed: false,
          codeMatches: true,
          offer: {
            creatorName: "Ada",
            promoCode: "ADA10",
            billingOfferId: "offer_1",
          },
        }),
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      configure();

      const result = await TapAppLink.applyCode("ADA10");
      expect(result).toMatchObject({
        attributionId: "attr_applied",
        alreadyAttributed: false,
        codeMatches: true,
        offer: { creatorName: "Ada" },
      });
      expect(TapAppLink.getOffer()?.creatorName).toBe("Ada");
      expect(TapAppLink.getAttributionId()).toBe("attr_applied");
    });

    it("returns alreadyAttributed success without treating it as an error", async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(200, {
          attributionId: "attr_existing",
          alreadyAttributed: true,
          offer: {
            creatorName: "Bea",
            promoCode: "BEA10",
            billingOfferId: null,
          },
        }),
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      configure();

      const result = await TapAppLink.applyCode("BEA10");
      expect(result).toMatchObject({
        attributionId: "attr_existing",
        alreadyAttributed: true,
      });
      expect(result).not.toBeInstanceOf(TapAppLinkRedeemError);
    });

    it("maps legacy 404 + unknown_code body to unknownCode", async () => {
      await expectRedeemCode(
        404,
        { error: "unknown_code", message: "Unknown code" },
        "unknownCode",
      );
    });

    it("maps new 404 without body error field to unknownCode via status", async () => {
      await expectRedeemCode(404, { message: "Not found" }, "unknownCode");
    });

    it("maps 410 + inactive_code body to inactiveCode", async () => {
      await expectRedeemCode(
        410,
        { error: "inactive_code", message: "Inactive" },
        "inactiveCode",
      );
    });

    it("maps 410 without body error field to inactiveCode via status", async () => {
      await expectRedeemCode(410, { message: "Gone" }, "inactiveCode");
    });

    it("maps 400 + wrong_environment body to wrongEnvironment", async () => {
      await expectRedeemCode(
        400,
        { error: "wrong_environment", message: "Wrong env" },
        "wrongEnvironment",
      );
    });

    it("maps legacy 404 + wrong_environment body to wrongEnvironment", async () => {
      await expectRedeemCode(
        404,
        { error: "wrong_environment", message: "Wrong env" },
        "wrongEnvironment",
      );
    });

    it("exposes the exact wrongEnvironment developer warning (Production, not Live)", () => {
      expect(TapAppLinkRedeemError.wrongEnvironmentDevWarning).toBe(
        "This code belongs to the other environment (Sandbox or Production). Check your API key.",
      );
      expect(TapAppLinkRedeemError.wrongEnvironmentDevWarning).not.toContain(
        "Live",
      );
    });

    it("maps other non-2xx responses to other with status", async () => {
      await expectRedeemCode(
        500,
        { error: "server_error", message: "Internal error" },
        "other",
      );
    });

    it("maps network failures to network", async () => {
      const fetchMock = jest
        .fn()
        .mockRejectedValue(new Error("Network request failed"));
      global.fetch = fetchMock as unknown as typeof fetch;
      configure();

      try {
        await TapAppLink.applyCode("ADA10");
        throw new Error("expected applyCode to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(TapAppLinkRedeemError);
        const redeem = error as TapAppLinkRedeemError;
        expect(redeem.code).toBe("network");
        expect(redeem.status).toBeUndefined();
        expect(redeem.message).toContain("Network request failed");
      }
    });

    it("does not cache attribution from a failed redeem response", async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        jsonResponse(404, {
          error: "unknown_code",
          attributionId: "should_not_apply",
          offer: {
            creatorName: "Nope",
            promoCode: "NOPE",
            billingOfferId: null,
          },
        }),
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      configure();

      await expect(TapAppLink.applyCode("NOPE")).rejects.toBeInstanceOf(
        TapAppLinkRedeemError,
      );
      expect(TapAppLink.getAttributionId()).toBeUndefined();
      expect(TapAppLink.getOffer()).toBeNull();
    });

    const redeemRequestId = (fetchMock: jest.Mock, callIndex: number) => {
      const body = JSON.parse(
        (fetchMock.mock.calls[callIndex][1] as { body: string }).body,
      ) as { requestId: string; code: string };
      return body;
    };

    it("reuses the same requestId when retrying applyCode after a timeout", async () => {
      const fetchMock = jest
        .fn()
        .mockRejectedValueOnce(new Error("Network request failed"))
        .mockResolvedValueOnce(
          jsonResponse(200, {
            attributionId: "attr_retry",
            alreadyAttributed: false,
          }),
        );
      global.fetch = fetchMock as unknown as typeof fetch;
      configure();

      await expect(TapAppLink.applyCode("ada-10")).rejects.toMatchObject({
        code: "network",
      });
      const first = redeemRequestId(fetchMock, 0);
      expect(first.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      const result = await TapAppLink.applyCode("ADA10");
      const second = redeemRequestId(fetchMock, 1);
      expect(second.requestId).toBe(first.requestId);
      expect(result).toMatchObject({ attributionId: "attr_retry" });
      expect(asyncStore.get(STORAGE_KEY)).not.toContain("pendingRedeem");
    });

    it("reuses a pending requestId after an app restart", async () => {
      const fetchMock = jest
        .fn()
        .mockRejectedValueOnce(new Error("Network request failed"))
        .mockResolvedValueOnce(
          jsonResponse(200, {
            attributionId: "attr_restart",
            alreadyAttributed: false,
          }),
        );
      global.fetch = fetchMock as unknown as typeof fetch;
      configure();

      await expect(TapAppLink.applyCode("BEA10")).rejects.toMatchObject({
        code: "network",
      });
      const first = redeemRequestId(fetchMock, 0);
      const persisted = asyncStore.get(STORAGE_KEY);
      expect(persisted).toContain(first.requestId);
      expect(persisted).toContain("BEA10");

      await TapAppLink.resetForTesting();
      asyncStore.set(STORAGE_KEY, persisted!);
      configure();

      await TapAppLink.applyCode("bea-10");
      const second = redeemRequestId(fetchMock, 1);
      expect(second.requestId).toBe(first.requestId);
    });

    it("uses a new requestId when applyCode is called with a different code", async () => {
      const fetchMock = jest
        .fn()
        .mockRejectedValueOnce(new Error("Network request failed"))
        .mockRejectedValueOnce(new Error("Network request failed"));
      global.fetch = fetchMock as unknown as typeof fetch;
      configure();

      await expect(TapAppLink.applyCode("ADA10")).rejects.toMatchObject({
        code: "network",
      });
      await expect(TapAppLink.applyCode("BEA10")).rejects.toMatchObject({
        code: "network",
      });
      const first = redeemRequestId(fetchMock, 0);
      const second = redeemRequestId(fetchMock, 1);
      expect(second.requestId).not.toBe(first.requestId);
      expect(asyncStore.get(STORAGE_KEY)).toContain(second.requestId);
      expect(asyncStore.get(STORAGE_KEY)).not.toContain(first.requestId);
    });

    it("clears the pending requestId after a definitive success or typed error", async () => {
      const fetchMock = jest
        .fn()
        .mockRejectedValueOnce(new Error("Network request failed"))
        .mockResolvedValueOnce(
          jsonResponse(404, {
            error: "unknown_code",
            message: "Unknown",
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, {
            attributionId: "attr_ok",
            alreadyAttributed: false,
          }),
        );
      global.fetch = fetchMock as unknown as typeof fetch;
      configure();

      await expect(TapAppLink.applyCode("ADA10")).rejects.toMatchObject({
        code: "network",
      });
      expect(asyncStore.get(STORAGE_KEY)).toContain("pendingRedeem");
      const pendingId = redeemRequestId(fetchMock, 0).requestId;

      await expect(TapAppLink.applyCode("ADA10")).rejects.toMatchObject({
        code: "unknownCode",
      });
      expect(redeemRequestId(fetchMock, 1).requestId).toBe(pendingId);
      expect(asyncStore.get(STORAGE_KEY) ?? "").not.toContain(
        '"pendingRedeem":{',
      );

      await TapAppLink.applyCode("ADA10");
      const third = redeemRequestId(fetchMock, 2);
      expect(third.requestId).not.toBe(pendingId);
      expect(asyncStore.get(STORAGE_KEY) ?? "").not.toContain(
        '"pendingRedeem":{',
      );
    });
  });
});
