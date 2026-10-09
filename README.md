# Tap App Link React Native SDK

Attribution SDK for React Native apps, including Expo. Call `configure`, `trackInstall`, and `setAppUserId` with the same billing user id your webhook provider sends.

Works in Expo **dev clients and production builds**. Expo Go cannot load the Android Play Install Referrer module.

## Install

Install the SDK and AsyncStorage together. AsyncStorage is required so install state survives cold launches; without it each launch can post a new install.

**Expo**

```bash
npx expo install @tapapplink/react-native @react-native-async-storage/async-storage
```

**Bare React Native**

```bash
npm install @tapapplink/react-native @react-native-async-storage/async-storage
# or: yarn add @tapapplink/react-native @react-native-async-storage/async-storage
```

Bare React Native iOS apps should run `cd ios && pod install` after installing.

Rebuild the native binary after adding the package.

### Why AsyncStorage (not the Android native module)

The Play Install Referrer bridge is Android-only. Storing install state only there would leave iOS (and Expo iOS builds) without persistence. AsyncStorage is the usual cross-platform key/value store for Expo and bare React Native, so one path covers both platforms.

## Usage

```ts
import { TapAppLink } from "@tapapplink/react-native";

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

## Publishing

Maintainers: see [PUBLISHING.md](./PUBLISHING.md) for the CI release tag flow and one-time npm trusted publishing setup.

## License

MIT
