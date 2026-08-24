const WATCHHUB = "https://watchhub.strem.io";

const MANIFEST = {
  id: "com.personal.watchselect.v3",
  version: "2.2.0",
  name: "WatchSelect",
  description: "Choose your region. Choose your services. Open them from Stremio.",
  resources: ["stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: [],
};

const PROVIDERS = {
  netflix: { order: 0, name: "Netflix", logo: "/logos/netflix.svg" },
  disney: { order: 1, name: "Disney+", logo: "/logos/disney-plus.svg" },
  crunchyroll: {
    order: 2,
    name: "Crunchyroll",
    logo: "/logos/crunchyroll.svg",
  },
};

const LOGOS = {
  "/logos/netflix.svg":
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img"><title>Netflix</title><rect width="24" height="24" rx="4" fill="#141414"/><path fill="#E50914" d="M5.398 0v.006c3.028 8.556 5.37 15.175 8.348 23.596 2.344.058 4.85.398 4.854.398-2.8-7.924-5.923-16.747-8.487-24zm8.489 0v9.63L18.6 22.951c-.043-7.86-.004-15.913.002-22.95zM5.398 1.05V24c1.873-.225 2.81-.312 4.715-.398v-9.22z"/></svg>',
  "/logos/disney-plus.svg":
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" role="img"><title>Disney+</title><rect width="240" height="240" rx="40" fill="#071A40"/><path d="M45 91c38-53 117-67 159-18" fill="none" stroke="#00B9F2" stroke-width="9" stroke-linecap="round"/><text x="120" y="148" fill="#fff" font-family="Arial,sans-serif" font-size="45" font-weight="700" text-anchor="middle">Disney+</text></svg>',
  "/logos/crunchyroll.svg":
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img"><title>Crunchyroll</title><rect width="24" height="24" rx="4" fill="#fff"/><path fill="#F47521" d="M2.933 13.467a10.55 10.55 0 1 1 21.067-.8V12c0-6.627-5.373-12-12-12S0 5.373 0 12s5.373 12 12 12h.8a10.617 10.617 0 0 1-9.867-10.533zM19.2 14a3.85 3.85 0 0 1-1.333-7.467A7.89 7.89 0 0 0 14 5.6a8.4 8.4 0 1 0 8.4 8.4 6.492 6.492 0 0 0-.133-1.6A3.415 3.415 0 0 1 19.2 14z"/></svg>',
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
        externalUrl: isAndroidTv ? androidIntent : stream.androidUrl,
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

function logo(svg) {
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=31536000, immutable",
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

  if (LOGOS[url.pathname]) {
    return logo(LOGOS[url.pathname]);
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
        title: "🇦🇷 Suscripción · Abrir",
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
