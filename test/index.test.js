import assert from "node:assert/strict";
import test from "node:test";

import {
  default as worker,
  handleRequest,
  provider,
  resolveAndroidTv,
} from "../src/index.js";

function upstream(streams, status = 200) {
  return async () =>
    new Response(JSON.stringify({ streams }), {
      status,
      headers: { "content-type": "application/json" },
    });
}

test("serves an installable stream-only manifest", async () => {
  const response = await handleRequest(
    new Request("https://example.com/manifest.json"),
  );
  const manifest = await response.json();

  assert.equal(response.status, 200);
  assert.equal(manifest.id, "com.personal.watchselect.v3");
  assert.equal(manifest.name, "WatchSelect");
  assert.equal(manifest.version, "2.2.1");
  assert.deepEqual(manifest.resources, ["stream"]);
  assert.deepEqual(manifest.types, ["movie", "series"]);
  assert.deepEqual(manifest.catalogs, []);
});

test("matches only exact provider names", () => {
  assert.equal(provider("Netflix"), "netflix");
  assert.equal(provider("Disney Plus"), "disney");
  assert.equal(provider("Disney+"), "disney");
  assert.equal(provider("Crunchyroll"), "crunchyroll");
  assert.equal(provider("Crunchyroll Amazon Channel"), null);
  assert.equal(provider("Amazon Prime Video"), null);
});

test("builds a Leanback Netflix intent with the upstream content ID", () => {
  const stream = {
    name: "Netflix",
    androidUrl: "https://www.netflix.com/watch/81767873",
    androidTvUrl: "intent://incomplete-upstream-intent",
  };

  assert.deepEqual(resolveAndroidTv(stream, "netflix", undefined, true), {
    ...stream,
    externalUrl:
      "intent://www.netflix.com/watch/81767873" +
      "#Intent;action=android.intent.action.VIEW;scheme=http;" +
      "package=com.netflix.ninja;" +
      "component=com.netflix.ninja/.MainActivity;" +
      "category=android.intent.category.LEANBACK_LAUNCHER;" +
      "launchFlags=0x10808000;S.source=30;end",
    androidUrl:
      "intent://www.netflix.com/watch/81767873" +
      "#Intent;action=android.intent.action.VIEW;scheme=http;" +
      "package=com.netflix.ninja;" +
      "component=com.netflix.ninja/.MainActivity;" +
      "category=android.intent.category.LEANBACK_LAUNCHER;" +
      "launchFlags=0x10808000;S.source=30;end",
    androidTvUrl:
      "intent://www.netflix.com/watch/81767873" +
      "#Intent;action=android.intent.action.VIEW;scheme=http;" +
      "package=com.netflix.ninja;" +
      "component=com.netflix.ninja/.MainActivity;" +
      "category=android.intent.category.LEANBACK_LAUNCHER;" +
      "launchFlags=0x10808000;S.source=30;end",
  });
});

test("replaces Crunchyroll's stale component with its current TV activity", () => {
  const stream = {
    name: "Crunchyroll",
    androidTvUrl:
      "intent://episode?id=G9DUEJ5VX&referrer=stremio" +
      "#Intent;scheme=crunchyroll;package=com.crunchyroll.crunchyroid;" +
      "component=com.crunchyroll.crunchyroid/.MainActivity;end",
  };

  assert.deepEqual(resolveAndroidTv(stream, "crunchyroll", undefined, true), {
    ...stream,
    externalUrl:
      "intent://episode?id=G9DUEJ5VX&referrer=stremio" +
      "#Intent;action=android.intent.action.VIEW;scheme=crunchyroll;" +
      "package=com.crunchyroll.crunchyroid;" +
      "component=com.crunchyroll.crunchyroid/.main.ui.MainActivity;end",
    androidUrl:
      "intent://episode?id=G9DUEJ5VX&referrer=stremio" +
      "#Intent;action=android.intent.action.VIEW;scheme=crunchyroll;" +
      "package=com.crunchyroll.crunchyroid;" +
      "component=com.crunchyroll.crunchyroid/.main.ui.MainActivity;end",
    androidTvUrl:
      "intent://episode?id=G9DUEJ5VX&referrer=stremio" +
      "#Intent;action=android.intent.action.VIEW;scheme=crunchyroll;" +
      "package=com.crunchyroll.crunchyroid;" +
      "component=com.crunchyroll.crunchyroid/.main.ui.MainActivity;end",
  });
});

test("replaces WatchHub's Reze Arc trailer with the verified movie ID", () => {
  const stream = {
    name: "Crunchyroll",
    externalUrl:
      "https://www.crunchyroll.com/watch/G4VUWQ434/chainsaw-man---the-movie-reze-arc---trailer",
    androidTvUrl:
      "intent://episode?id=G4VUWQ434&referrer=stremio" +
      "#Intent;scheme=crunchyroll;package=com.crunchyroll.crunchyroid;" +
      "component=com.crunchyroll.crunchyroid/.MainActivity;end",
  };
  const resolved = resolveAndroidTv(
    stream,
    "crunchyroll",
    "tt30472557",
    true,
  );

  assert.match(resolved.externalUrl, /GMEE00351495DEDE/);
  assert.doesNotMatch(resolved.externalUrl, /G4VUWQ434/);
});

test("keeps Disney and invalid Android destinations unchanged", () => {
  const disney = {
    name: "Disney Plus",
    androidUrl: "https://www.disneyplus.com/movies/encanto/33q7DY1rtHQH",
    androidTvUrl: "intent://working-disney-intent",
  };
  const mismatched = {
    name: "Netflix",
    androidUrl: "https://example.com/watch/80014749",
    androidTvUrl: "intent://upstream-netflix-intent",
  };

  assert.equal(resolveAndroidTv(disney, "disney"), disney);
  assert.equal(resolveAndroidTv(mismatched, "netflix"), mismatched);
});

test("filters, preserves, and orders WatchHub streams", async () => {
  const netflix = {
    name: "Netflix",
    title: "Subscription",
    externalUrl: "https://www.netflix.com/title/80014749",
    androidUrl: "https://www.netflix.com/watch/80014749",
    androidTvUrl:
      "intent://www.netflix.com/watch/80014749#Intent;scheme=https;package=com.netflix.ninja;end",
  };
  const response = await handleRequest(
    new Request("https://example.com/stream/movie/tt2953050.json"),
    upstream([
      {
        name: "Crunchyroll",
        title: "Subscription",
        externalUrl: "https://www.crunchyroll.com/watch/GK9U3KWZN",
      },
      {
        name: "Prime Video",
        title: "Subscription",
        externalUrl: "https://www.primevideo.com/detail/1",
      },
      {
        name: "Disney Plus",
        title: "Subscription",
        externalUrl: "https://www.disneyplus.com/movies/encanto/33q7DY1rtHQH",
      },
      netflix,
      {
        name: "Netflix",
        title: "Duplicate",
        externalUrl: "https://www.netflix.com/title/99999999",
      },
      {
        name: "Crunchyroll Amazon Channel",
        title: "Subscription",
        externalUrl: "https://www.amazon.com/video/detail/1",
      },
    ]),
  );
  const body = await response.json();

  assert.deepEqual(
    body.streams.map(({ name }) => name),
    ["Netflix", "Disney+", "Crunchyroll"],
  );
  assert.equal(body.streams.filter(({ name }) => name === "Netflix").length, 1);
  assert.equal(
    body.streams.find(({ name }) => name === "Netflix").externalUrl,
    body.streams.find(({ name }) => name === "Netflix").androidTvUrl,
  );
  assert.deepEqual(
    body.streams.map(({ title }) => title),
    ["Netflix · Abrir", "Disney+ · Abrir", "Crunchyroll · Abrir"],
  );
  assert.deepEqual(
    body.streams.map(({ thumbnail }) => thumbnail),
    [
      "https://example.com/logos/netflix-v2.png",
      "https://example.com/logos/disney-plus-v2.png",
      "https://example.com/logos/crunchyroll-v2.png",
    ],
  );
  assert.equal(
    body.streams.find(({ name }) => name === "Netflix").androidUrl,
    body.streams.find(({ name }) => name === "Netflix").androidTvUrl,
  );
  assert.equal(
    body.streams.find(({ name }) => name === "Netflix").androidTvUrl,
    "intent://www.netflix.com/watch/80014749" +
      "#Intent;action=android.intent.action.VIEW;scheme=http;" +
      "package=com.netflix.ninja;" +
      "component=com.netflix.ninja/.MainActivity;" +
      "category=android.intent.category.LEANBACK_LAUNCHER;" +
      "launchFlags=0x10808000;S.source=30;end",
  );
});

test("keeps browser destinations as HTTPS when User-Agent is present", async () => {
  const response = await handleRequest(
    new Request("https://example.com/stream/movie/tt30472557.json", {
      headers: { "user-agent": "Mozilla/5.0 Chrome/151" },
    }),
    upstream([
      {
        name: "Netflix",
        externalUrl: "https://www.netflix.com/title/81767873",
        androidUrl: "https://www.netflix.com/watch/81767873",
      },
      {
        name: "Crunchyroll",
        externalUrl:
          "https://www.crunchyroll.com/watch/G4VUWQ434/reze-arc-trailer",
        androidTvUrl:
          "intent://episode?id=G4VUWQ434&referrer=stremio" +
          "#Intent;scheme=crunchyroll;package=com.crunchyroll.crunchyroid;" +
          "component=com.crunchyroll.crunchyroid/.MainActivity;end",
      },
    ]),
  );
  const streams = (await response.json()).streams;

  assert.equal(
    streams.find(({ name }) => name === "Netflix").externalUrl,
    "https://www.netflix.com/watch/81767873",
  );
  assert.equal(
    streams.find(({ name }) => name === "Crunchyroll").externalUrl,
    "https://www.crunchyroll.com/watch/GMEE00351495DEDE/chainsaw-man--the-movie-reze-arc",
  );
});

test("preserves the querystring when proxying to WatchHub", async () => {
  let upstreamUrl;
  const response = await handleRequest(
    new Request(
      "https://example.com/stream/movie/tt2953050.json?country=AR&token=abc",
    ),
    async (url) => {
      upstreamUrl = url;
      return new Response('{"streams":[]}');
    },
  );

  assert.equal(response.status, 200);
  assert.equal(
    upstreamUrl,
    "https://watchhub.strem.io/stream/movie/tt2953050.json?country=AR&token=abc",
  );
});

test("does not advertise downstream caching in v1", async () => {
  const response = await handleRequest(
    new Request("https://example.com/manifest.json"),
  );

  assert.equal(response.headers.get("cache-control"), null);
});

test("fails soft when WatchHub fails", async () => {
  const response = await handleRequest(
    new Request("https://example.com/stream/movie/tt2953050.json"),
    upstream([], 500),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { streams: [] });
});

test("rejects paths outside the Stremio resource contract", async () => {
  const response = await handleRequest(
    new Request("https://example.com/stream/movie/not-imdb.json"),
  );

  assert.equal(response.status, 404);
});

test("does not treat Cloudflare env and ctx arguments as fetch", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/manifest.json"),
    { SOME_BINDING: "value" },
    { waitUntil() {} },
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).id, "com.personal.watchselect.v3");
});
