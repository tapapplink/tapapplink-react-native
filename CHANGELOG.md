# Changelog

## 0.3.0

- Persist install id, tracked flag, attribution id and offer across launches (AsyncStorage optional peer).
- Send `installId` on `/ingestInstall` so the server can dedupe; `trackInstall` posts only once per install.
- Add opt-in `debug` configure flag with redacted API key logging.

## 0.2.0

- Remove `discountBps` from `TapAppLinkOffer`. Present `billingOfferId` on the paywall.

## 0.1.3

- Remove unused `debugSessionId` from `configure()`. The sandbox debugger attaches via the QR link or code watch.

## 0.1.2

- Point `repository` and `bugs` at the tapapplink GitHub org.

## 0.1.1

- Point `repository` and `bugs` at the public GitHub repo.

## 0.1.0

- First public release of `@tapapplink/react-native`.
- Classic React Native Android module for Play Install Referrer.
- JavaScript install signals on iOS.
