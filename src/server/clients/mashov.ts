import "server-only";
import { env } from "~/env";

/**
 * Mashov parent-mode HTTP client.
 *
 * The official `node-mashov` package supports student accounts only. Parent
 * accounts have a different shape: the login response includes a `children[]`
 * array, and per-student endpoints require the selected child's `childGuid`
 * in the path. This client handles parent login + child selection + the
 * cookie/CSRF dance required by every authenticated call.
 *
 * Auth model (verified against web.mashov.info):
 *  - POST /api/login → sets Cookie `MashovAuthToken=...`, `uniquId=...`,
 *    returns response header `x-csrf-token: <guid>` and a JSON body with
 *    `accessToken.children[]` and `credential`.
 *  - All subsequent calls require the cookie + `x-csrf-token` header.
 */

interface MashovCreds {
  username: string;
  password: string;
  schoolId: number;
  year: number;
  childGuid?: string;
}

interface MashovChild {
  childGuid: string;
  privateName: string;
  familyName: string;
  classCode: string;
  classNum: number;
  groups: number[];
}

interface MashovLoginResponse {
  credential: {
    userId: string;
    userType: number;
    semel: number;
    year: number;
    displayName: string;
  };
  accessToken: {
    children: MashovChild[];
    inactiveChildren: MashovChild[];
    schoolOptions: Record<string, unknown>;
  };
}

export interface MashovSession {
  csrfToken: string;
  cookie: string;
  child: MashovChild;
  children: MashovChild[];
  loggedInAt: number;
}

const BASE_URL = "https://web.mashov.info/api";
const SESSION_TTL_MS = 30 * 60 * 1000;

function getCreds(): MashovCreds | null {
  const {
    MASHOV_USERNAME,
    MASHOV_PASSWORD,
    MASHOV_SCHOOL_ID,
    MASHOV_YEAR,
    MASHOV_CHILD_GUID,
  } = env;
  if (!MASHOV_USERNAME || !MASHOV_PASSWORD || !MASHOV_SCHOOL_ID || !MASHOV_YEAR) {
    return null;
  }
  return {
    username: MASHOV_USERNAME,
    password: MASHOV_PASSWORD,
    schoolId: MASHOV_SCHOOL_ID,
    year: MASHOV_YEAR,
    childGuid: MASHOV_CHILD_GUID,
  };
}

export function isMashovConfigured(): boolean {
  return getCreds() !== null;
}

let cached: MashovSession | null = null;

/**
 * Parse `Set-Cookie` headers into a single `Cookie:` header string that we
 * can replay on subsequent requests. We keep only the `name=value` part of
 * each cookie, discarding attributes like Path/Expires/HttpOnly.
 */
function extractCookieHeader(res: Response): string {
  // Node's undici exposes getSetCookie() to handle multiple Set-Cookie
  // headers; fall back to the raw header if running under an older runtime.
  const setCookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : (res.headers.get("set-cookie")?.split(/,\s*(?=[^;]+=)/) ?? []);
  return setCookies
    .map((c) => c.split(";")[0]?.trim())
    .filter((v): v is string => Boolean(v))
    .join("; ");
}

async function loginFresh(creds: MashovCreds): Promise<MashovSession> {
  const res = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
    },
    body: JSON.stringify({
      semel: creds.schoolId,
      year: creds.year,
      username: creds.username,
      password: creds.password,
      IsBiometric: false,
      appName: "info.mashov.students",
      apiVersion: "3.20210425",
      appVersion: 3.20210425,
      appBuild: 3.20210425,
      deviceUuid: "trustclaw",
      devicePlatform: "node",
      deviceManufacturer: "trustclaw",
      deviceModel: "server",
      deviceVersion: "1.0.0",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Mashov login failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }

  const csrfToken = res.headers.get("x-csrf-token");
  if (!csrfToken) {
    throw new Error(
      "Mashov login succeeded but no x-csrf-token header was returned",
    );
  }

  const cookie = extractCookieHeader(res);
  if (!cookie) {
    throw new Error(
      "Mashov login succeeded but no Set-Cookie header was returned",
    );
  }

  const body = (await res.json()) as MashovLoginResponse;
  const children = body.accessToken.children ?? [];
  if (children.length === 0) {
    throw new Error(
      "Mashov login succeeded but the account has no children. " +
        "This client only supports parent accounts with at least one active child.",
    );
  }

  let child: MashovChild;
  if (creds.childGuid) {
    const match = children.find((c) => c.childGuid === creds.childGuid);
    if (!match) {
      const guids = children
        .map((c) => `${c.privateName} ${c.familyName}: ${c.childGuid}`)
        .join("; ");
      throw new Error(
        `MASHOV_CHILD_GUID=${creds.childGuid} not found in account children. Available: ${guids}`,
      );
    }
    child = match;
  } else if (children.length === 1) {
    child = children[0]!;
  } else {
    const guids = children
      .map((c) => `${c.privateName} ${c.familyName} (${c.classCode}${c.classNum}): ${c.childGuid}`)
      .join("; ");
    throw new Error(
      `Multiple children on this Mashov account; set MASHOV_CHILD_GUID to pick one. Options: ${guids}`,
    );
  }

  return {
    csrfToken,
    cookie,
    child,
    children,
    loggedInAt: Date.now(),
  };
}

export async function getMashovSession(): Promise<MashovSession> {
  const creds = getCreds();
  if (!creds) {
    throw new Error(
      "Mashov is not configured. Set MASHOV_USERNAME, MASHOV_PASSWORD, MASHOV_SCHOOL_ID, MASHOV_YEAR.",
    );
  }

  if (cached && Date.now() - cached.loggedInAt < SESSION_TTL_MS) {
    return cached;
  }

  cached = await loginFresh(creds);
  return cached;
}

interface MashovRequestOptions {
  /**
   * Build the path from the session. The path is appended to BASE_URL.
   * Receives the session so callers can interpolate `child.childGuid`.
   */
  path: (session: MashovSession) => string;
  /** Query string params. Values are encoded with encodeURIComponent. */
  query?: Record<string, string | number | undefined>;
}

/**
 * Authenticated GET against the Mashov API. Auto-retries once with a fresh
 * login if the first attempt returns 401/403 (session expired mid-window).
 */
export async function mashovGet<T>(opts: MashovRequestOptions): Promise<T> {
  const send = async (session: MashovSession): Promise<Response> => {
    let url = `${BASE_URL}${opts.path(session)}`;
    if (opts.query) {
      const params = Object.entries(opts.query)
        .filter(([, v]) => v !== undefined)
        .map(
          ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
        )
        .join("&");
      if (params) url += `?${params}`;
    }
    return fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "x-csrf-token": session.csrfToken,
        Cookie: session.cookie,
      },
    });
  };

  const session = await getMashovSession();
  let res = await send(session);
  if (res.status === 401 || res.status === 403) {
    cached = null;
    const fresh = await getMashovSession();
    res = await send(fresh);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mashov ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}
