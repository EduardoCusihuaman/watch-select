const WATCHHUB = "https://watchhub.strem.io";

const MANIFEST = {
  id: "com.personal.watchselect.v3",
  version: "2.2.2",
  name: "WatchSelect",
  description: "Choose your region. Choose your services. Open them from Stremio.",
  resources: ["stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: [],
};

const PROVIDERS = {
  netflix: { order: 0, name: "Netflix", logo: "/logos/netflix-v2.png" },
  disney: { order: 1, name: "Disney+", logo: "/logos/disney-plus-v2.png" },
  crunchyroll: {
    order: 2,
    name: "Crunchyroll",
    logo: "/logos/crunchyroll-v2.png",
  },
};

// WatchHub currently resolves this movie to its trailer instead of the film.
const CRUNCHYROLL_CONTENT_OVERRIDES = {
  tt30472557: "GMEE00351495DEDE",
};

export function provider(name = "") {
  switch (name.trim().toLowerCase()) {
    case "netflix":
      return "netflix";
    case "disney+":
    case "disney plus":
      return "disney";
    case "crunchyroll":
      return "crunchyroll";
    default:
      return null;
  }
}

export function resolveAndroidTv(stream, providerId, resourceId, isAndroidTv) {
  if (providerId === "netflix" && typeof stream?.androidUrl === "string") {
    try {
      const url = new URL(stream.androidUrl);
      const contentId = url.pathname.match(/^\/watch\/(\d+)$/)?.[1];
      if (url.hostname !== "www.netflix.com" || !contentId) {
        return stream;
      }

      const androidIntent =
        `intent://www.netflix.com/watch/${contentId}` +
        "#Intent;action=android.intent.action.VIEW;scheme=http;" +
        "package=com.netflix.ninja;" +
        "component=com.netflix.ninja/.MainActivity;" +
        "category=android.intent.category.LEANBACK_LAUNCHER;" +
        "launchFlags=0x10808000;S.source=30;end";

      return {
        ...stream,
        externalUrl: isAndroidTv
          ? androidIntent
          : `https://www.netflix.com/title/${contentId}`,
        androidUrl: androidIntent,
        androidTvUrl: androidIntent,
      };
    } catch {
      return stream;
    }
  }

  if (providerId === "crunchyroll" && typeof stream?.androidTvUrl === "string") {
    const match = stream.androidTvUrl.match(
      /^intent:\/\/([^#]+)#Intent;[^#]*scheme=crunchyroll;[^#]*end$/,
    );
    if (match) {
      const contentOverride = CRUNCHYROLL_CONTENT_OVERRIDES[resourceId];
      const target = contentOverride
        ? `episode?id=${contentOverride}&referrer=stremio`
        : match[1];
      const webUrl =
        contentOverride
          ? `https://www.crunchyroll.com/watch/${contentOverride}/chainsaw-man--the-movie-reze-arc`
          : stream.externalUrl;
      const androidIntent =
        `intent://${target}` +
        "#Intent;action=android.intent.action.VIEW;" +
        "scheme=crunchyroll;package=com.crunchyroll.crunchyroid;" +
        "component=com.crunchyroll.crunchyroid/.main.ui.MainActivity;end";
      return {
        ...stream,
        externalUrl: isAndroidTv ? androidIntent : webUrl,
        androidUrl: androidIntent,
        androidTvUrl: androidIntent,
      };
    }
  }

  return stream;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

export async function handleRequest(request, fetchImpl = fetch) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
      },
    });
  }

  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (url.pathname === "/manifest.json") {
    return json(MANIFEST);
  }

  const resourceMatch = url.pathname.match(
    /^\/stream\/(movie|series)\/(tt\d+(?::\d+:\d+)?)\.json$/,
  );
  if (!resourceMatch) {
    return json({ error: "Not found" }, 404);
  }

  try {
    const response = await fetchImpl(`${WATCHHUB}${url.pathname}${url.search}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return json({ streams: [] });
    }

    const data = await response.json();
    const found = new Map();

    for (const stream of Array.isArray(data.streams) ? data.streams : []) {
      const providerId = provider(stream?.name);
      if (!providerId || found.has(providerId)) {
        continue;
      }

      const resolved = resolveAndroidTv(
        stream,
        providerId,
        resourceMatch[2],
        !request.headers.get("user-agent"),
      );
      found.set(providerId, {
        ...resolved,
        name: PROVIDERS[providerId].name,
        title: `${PROVIDERS[providerId].name} · Abrir`,
        thumbnail: `${url.origin}${PROVIDERS[providerId].logo}`,
      });
    }

    const streams = [...found.entries()]
      .sort(
        ([a], [b]) => PROVIDERS[a].order - PROVIDERS[b].order,
      )
      .map(([, stream]) => stream);

    return json({ streams });
  } catch {
    return json({ streams: [] });
  }
}

export default {
  fetch(request) {
    return handleRequest(request);
  },
};
