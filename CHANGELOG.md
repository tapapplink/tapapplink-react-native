# Changelog

## 0.3.1

- **Fixed:** Android and React Native 0.3.0 could return an error from `applyCode()` as if it were a normal result, so an app could show a code as applied when it wasn't. Upgrade to 0.3.1, which raises a typed error for unknown, inactive and wrong-environment codes. iOS and Flutter 0.3.0 threw a generic error, and 0.3.1 makes it typed.
- Check HTTP status on every request; non-2xx responses are never treated as success.
- Add `TapAppLinkRedeemError` with codes `unknownCode`, `inactiveCode`, `wrongEnvironment`, `network` and `other`.
- Send `X-TapAppLink-SDK-Version: 0.3.1` on all requests.

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
