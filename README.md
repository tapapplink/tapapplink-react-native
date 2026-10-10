# Tap App Link React Native SDK

Attribution SDK for React Native apps, including Expo. Call `configure`, `trackInstall`, and `setAppUserId` with the same billing user id your webhook provider sends.

Works in Expo **dev clients and production builds**. Expo Go cannot load the Android Play Install Referrer module.

## Install

Install **0.3.2 or later** of the SDK, together with AsyncStorage. AsyncStorage is required so install state survives cold launches; without it each launch can post a new install.

**Expo**

```bash
npx expo install @tapapplink/react-native@0.3.2 @react-native-async-storage/async-storage
```

**Bare React Native**

```bash
npm install @tapapplink/react-native@0.3.2 @react-native-async-storage/async-storage
# or: yarn add @tapapplink/react-native@0.3.2 @react-native-async-storage/async-storage
```

Bare React Native iOS apps should run `cd ios && pod install` after installing.

Rebuild the native binary after adding the package.

### Why AsyncStorage (not the Android native module)

The Play Install Referrer bridge is Android-only. Storing install state only there would leave iOS (and Expo iOS builds) without persistence. AsyncStorage is the usual cross-platform key/value store for Expo and bare React Native, so one path covers both platforms.

## Usage

```ts
import {
  TapAppLink,
  TapAppLinkRedeemError,
} from "@tapapplink/react-native";

TapAppLink.configure({
  publicKey: "etk_live_…",
  environment: __DEV__ ? "sandbox" : "production",
  debug: __DEV__,
});

await TapAppLink.trackInstall();
await TapAppLink.setAppUserId(await Purchases.getAppUserID());

const offer = TapAppLink.getOffer();
```

`trackInstall` posts `/ingestInstall` once per install (keyed by a persisted `installId`). Later launches restore the stored attribution id and offer without posting again. `setAppUserId` sends that stored `attributionId` after hydrate.

Set `debug: true` to log each request, response and stored state. The API key is redacted in those logs.

Purchases are attributed with billing **webhooks**, not a client `trackPurchase` call.

### Apply a creator code

Show success only when `applyCode` resolves. Map each result to UI state as below. Customers must never see the word "environment".

On a `network` (or timeout) error only, retry `applyCode` once with the same code. Do not auto-retry `unknownCode`, `inactiveCode`, or `wrongEnvironment`. If that retry also fails, show N6 ("We couldn't check your code. Check your connection and try again.") with a **Try again** button. From 0.3.2, that automatic retry is safe because the SDK reuses its request ID, so the server will not count the install twice.

```ts
type RedeemUi = {
  title: string;
  detail?: string;
  hint?: string;
  showCode: boolean;
  /** When true, show a Try again button (N6 after a failed network retry). */
  tryAgain?: boolean;
};

async function redeemForUi(code: string): Promise<RedeemUi> {
  const offerLineFrom = (result: Record<string, unknown>): string | undefined => {
    const offer = result.offer;
    if (
      offer &&
      typeof offer === "object" &&
      typeof (offer as { creatorName?: string }).creatorName === "string"
    ) {
      return `Offer from ${(offer as { creatorName: string }).creatorName}`;
    }
    return undefined;
  };

  const mapSuccess = (result: Record<string, unknown>): RedeemUi => {
    const offerLine = offerLineFrom(result);
    if (result.alreadyAttributed === true) {
      return {
        title: "You're all set",
        detail: offerLine,
        showCode: false,
      };
    }
    return {
      title: "Code applied",
      detail: offerLine,
      showCode: true,
    };
  };

  const networkFailureUi = (): RedeemUi => ({
    title: "We couldn't check your code. Check your connection and try again.",
    showCode: true,
    tryAgain: true,
  });

  const mapError = (error: unknown): RedeemUi => {
    if (error instanceof TapAppLinkRedeemError) {
      switch (error.code) {
        case "unknownCode":
          return {
            title: "We don't recognise that code. Check it and try again.",
            hint: "Codes aren't case sensitive.",
            showCode: true,
          };
        case "inactiveCode":
          return {
            title: "This code is no longer active.",
            hint: "You can still subscribe at the regular price.",
            showCode: true,
          };
        case "wrongEnvironment":
          // Developer only. Customers see the unknownCode copy (never "environment").
          console.warn(TapAppLinkRedeemError.wrongEnvironmentDevWarning);
          return {
            title: "We don't recognise that code. Check it and try again.",
            hint: "Codes aren't case sensitive.",
            showCode: true,
          };
        case "network":
          return networkFailureUi();
        case "other":
        default:
          console.warn("TapAppLink applyCode failed", {
            code: error.code,
            status: error.status,
            message: error.message,
          });
          return networkFailureUi();
      }
    }
    throw error;
  };

  try {
    return mapSuccess(await TapAppLink.applyCode(code));
  } catch (error) {
    // Auto-retry once for network/timeout only. Never for unknown/inactive/wrongEnvironment.
    if (error instanceof TapAppLinkRedeemError && error.code === "network") {
      try {
        return mapSuccess(await TapAppLink.applyCode(code));
      } catch (retryError) {
        if (
          retryError instanceof TapAppLinkRedeemError &&
          retryError.code === "network"
        ) {
          return networkFailureUi();
        }
        return mapError(retryError);
      }
    }
    return mapError(error);
  }
}
```

## Publishing

Maintainers: see [PUBLISHING.md](./PUBLISHING.md) for the CI release tag flow and one-time npm trusted publishing setup.

## License

MIT
