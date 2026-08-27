# Tap App Link React Native SDK

Attribution SDK for React Native apps, including Expo. Call `configure`, `trackInstall`, and `setAppUserId` with the same billing user id your webhook provider sends.

Works in Expo **dev clients and production builds**. Expo Go cannot load the Android Play Install Referrer module.

## Install

```bash
yarn add @tapapplink/react-native
```

Bare React Native iOS apps should run `cd ios && pod install` after installing.

Rebuild the native binary after adding the package.

## Usage

```ts
import { TapAppLink } from "@tapapplink/react-native";

TapAppLink.configure({
  publicKey: "etk_live_…",
  environment: __DEV__ ? "sandbox" : "production",
});

await TapAppLink.trackInstall();
await TapAppLink.setAppUserId(await Purchases.getAppUserID());

const offer = TapAppLink.getOffer();
```

Purchases are attributed with billing **webhooks**, not a client `trackPurchase` call.

## License

MIT
