# Publishing `@tapapplink/react-native`

Releases publish from GitHub Actions when you push a tag named `vX.Y.Z` that matches `package.json` `"version"`. The workflow refuses to publish if the tag and version disagree (this would have blocked the mismatched `0.2.0` tag that still carried `0.1.3` in `package.json`).

## One-time setup (Kenny)

Prefer **npm trusted publishing (OIDC)**. Use an `NPM_TOKEN` secret only as a fallback.

### Option A — Trusted publishing (recommended)

1. Sign in to [npmjs.com](https://www.npmjs.com/) as a maintainer of `@tapapplink/react-native`.
2. Open the package → **Settings** → **Trusted Publisher**.
3. Add **GitHub Actions** with:
   - **Organization or user:** `tapapplink`
   - **Repository:** `tapapplink-react-native`
   - **Workflow filename:** `release.yml` (filename only, not a path)
   - **Environment name:** leave blank unless you later add a GitHub Environment to the release job
   - **Allowed actions:** allow `npm publish` (and staged publish if you want it)
4. Complete the first successful tag publish within **2 days** of creating the trusted publisher, or npm expires the unused config.
5. After a successful OIDC publish, optionally tighten the package to require 2FA and disallow classic tokens.

No repo secret is required for Option A. The release workflow already sets `permissions.id-token: write`.

### Option B — `NPM_TOKEN` fallback

1. On npmjs.com, create a granular access token (or automation token) with permission to publish `@tapapplink/react-native`.
2. In the GitHub repo → **Settings** → **Secrets and variables** → **Actions**, add repository secret `NPM_TOKEN` with that value.
3. You can keep this secret even when using trusted publishing; OIDC is tried first and the token is unused when trust is configured.

## Cut a release

1. Bump `"version"` in `package.json` and add a changelog entry on the same commit.
2. Merge to `main`.
3. Tag that commit and push:

```bash
git tag v0.2.1
git push origin v0.2.1
```

Do not retag an old commit with a new version name. The publish job checks that `v*` equals `package.json` version on the tagged commit.
