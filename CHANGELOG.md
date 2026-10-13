# Changelog

## 0.3.3

- **Fixed:** `setAppUserId` posted `/ingestIdentify` on every call, so apps that link the billing user id from several places (for example Keep Maps) could fire it three times per launch. 0.3.3 skips when the id matches the last successfully identified value (persisted like `trackInstall`), and coalesces concurrent identical calls into one request. A different id still posts.
- Add optional `codeMatches` and `offer.creatorName` on the typed `TapAppLinkRedeemResult` from `applyCode` (matches server redeem response fields).
- Send `X-TapAppLink-SDK-Version: 0.3.3` on all requests.

## 0.3.2

- **Fixed:** retrying `applyCode` after a timeout could count an install twice. 0.3.2 sends a request ID so the server recognises the retry. No code changes needed.

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
