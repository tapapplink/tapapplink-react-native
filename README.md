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

```ts
type RedeemUi = {
  title: string;
  detail?: string;
  hint?: string;
  showCode: boolean;
};

async function redeemForUi(code: string): Promise<RedeemUi> {
  try {
    const result = await TapAppLink.applyCode(code);
    const offerLine =
      typeof result.offer === "object" &&
      result.offer &&
      typeof (result.offer as { creatorName?: string }).creatorName === "string"
        ? `Offer from ${(result.offer as { creatorName: string }).creatorName}`
        : undefined;

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
  } catch (error) {
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
          return {
            title:
              "We couldn't check your code. Check your connection and try again.",
            showCode: true,
          };
        case "other":
        default:
          console.warn("TapAppLink applyCode failed", {
            code: error.code,
            status: error.status,
            message: error.message,
          });
          return {
            title:
              "We couldn't check your code. Check your connection and try again.",
            showCode: true,
          };
      }
    }
    throw error;
  }
}
```

## Publishing

Maintainers: see [PUBLISHING.md](./PUBLISHING.md) for the CI release tag flow and one-time npm trusted publishing setup.

## License

MIT
