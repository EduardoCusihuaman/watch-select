# WatchSelect

Choose your region. Choose your services. Open them from Stremio.

The addon manifest includes a dedicated 256x256 transparent PNG logo.

Stremio addon that proxies the official WatchHub stream resource and keeps only
Netflix, Disney+, and Crunchyroll for Argentina.

WatchHub 1.15 supplies separate Web and Android destinations. Disney's working
`androidTvUrl` is preserved. Netflix gets a Leanback intent with WatchHub's
content ID because its default intent only opened the app home. Netflix Web
opens the title page instead of the player. Crunchyroll's
upstream scheme and content ID are preserved while its stale `.MainActivity`
is replaced with the installed TV app's `.main.ui.MainActivity`. Both intents
were validated directly through ADB on the target TV. Results are deduplicated
to one stream per provider.

Decompilation of Stremio Android TV 1.10.4 confirmed that its external playback
path calls `Intent.parseUri(externalUrl, URI_INTENT_SCHEME)`. TV requests on the
validated client omit `User-Agent`, so they receive the tested Android intent
in `externalUrl`. Browser requests include `User-Agent` and preserve an HTTPS
`externalUrl`.

WatchHub currently maps `tt30472557` to a Reze Arc trailer. That single title
is corrected to the verified Crunchyroll movie ID `GMEE00351495DEDE`.

Streams use the provider-specific label `<Provider> · Abrir`. Horizontal 16:9
provider cards are served under `/logos/*.png` with immutable one-year caching.
Stremio Web renders these thumbnails; Stremio TV 1.10.4 falls back to the
provider name and text label.

## Test

```bash
npm test
```

## Deploy

```bash
npx wrangler login
npm run deploy
```

Install the production manifest in Stremio:

```text
https://watchselect.luiscusihuaman88.workers.dev/manifest.json
```

Netflix, Disney+, and Crunchyroll were smoke-tested on a TCL Android 14 TV with
Stremio TV 1.10.4. Provider app updates can change their exported Android
activities and should be validated before changing the intent adapters.
