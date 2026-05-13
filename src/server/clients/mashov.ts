import "server-only";
import { createRequire } from "node:module";
// node-mashov ships a UMD bundle whose ESM `import * as` namespace is
// polluted with internals; the real public API (`Client`, `fetchSchools`)
// lives under `.default` when loaded via Node's CJS interop, but may be
// at the top level depending on the loader. We mark this package as
// `serverExternalPackages` in next.config.js to skip Webpack bundling,
// then use createRequire to load it via Node's normal CJS path and probe
// both export shapes to be safe.
import type { Client as ClientType, School } from "node-mashov";
import { env } from "~/env";

interface MashovExports {
  Client: new () => ClientType;
  fetchSchools: () => Promise<School[]>;
}

const requireFromHere = createRequire(import.meta.url);
const loaded = requireFromHere("node-mashov") as Partial<MashovExports> & {
  default?: Partial<MashovExports>;
};
const api: MashovExports =
  typeof loaded.fetchSchools === "function" && loaded.Client
    ? (loaded as MashovExports)
    : loaded.default && typeof loaded.default.fetchSchools === "function"
      ? (loaded.default as MashovExports)
      : (() => {
          throw new Error(
            "node-mashov import failed: neither top-level nor .default exposes Client/fetchSchools",
          );
        })();
const { Client, fetchSchools } = api;

interface MashovCreds {
  username: string;
  password: string;
  schoolId: number;
  year: number;
}

function getCreds(): MashovCreds | null {
  const { MASHOV_USERNAME, MASHOV_PASSWORD, MASHOV_SCHOOL_ID, MASHOV_YEAR } =
    env;
  if (!MASHOV_USERNAME || !MASHOV_PASSWORD || !MASHOV_SCHOOL_ID || !MASHOV_YEAR) {
    return null;
  }
  return {
    username: MASHOV_USERNAME,
    password: MASHOV_PASSWORD,
    schoolId: MASHOV_SCHOOL_ID,
    year: MASHOV_YEAR,
  };
}

export function isMashovConfigured(): boolean {
  return getCreds() !== null;
}

// Mashov login is ~1-2s and returns a short-lived session. Cache an
// authenticated client in-process and re-login on demand if a call fails
// with what looks like an auth error. The cache is reset every 30 min.
const SESSION_TTL_MS = 30 * 60 * 1000;
let cached: { client: ClientType; loggedInAt: number } | null = null;

async function resolveSchool(schoolId: number): Promise<School> {
  const schools = await fetchSchools();
  const school = schools.find((s) => s.id === schoolId);
  if (!school) {
    throw new Error(
      `Mashov school with id ${schoolId} not found. Use a different MASHOV_SCHOOL_ID.`,
    );
  }
  return school;
}

async function loginFresh(creds: MashovCreds): Promise<ClientType> {
  const school = await resolveSchool(creds.schoolId);
  const client = new Client();
  await client.login({
    username: creds.username,
    password: creds.password,
    year: creds.year,
    school,
  });
  return client;
}

export async function getMashovClient(): Promise<ClientType> {
  const creds = getCreds();
  if (!creds) {
    throw new Error(
      "Mashov is not configured. Set MASHOV_USERNAME, MASHOV_PASSWORD, MASHOV_SCHOOL_ID, MASHOV_YEAR.",
    );
  }

  if (cached && Date.now() - cached.loggedInAt < SESSION_TTL_MS) {
    return cached.client;
  }

  const client = await loginFresh(creds);
  cached = { client, loggedInAt: Date.now() };
  return client;
}

/**
 * Run `op` with an authenticated client. If the first attempt throws,
 * force a fresh login and try once more — this covers session expiry
 * between the cache TTL window and the actual Mashov-side timeout.
 */
export async function withMashov<T>(
  op: (client: ClientType) => Promise<T>,
): Promise<T> {
  const client = await getMashovClient();
  try {
    return await op(client);
  } catch (err) {
    cached = null;
    const fresh = await getMashovClient();
    try {
      return await op(fresh);
    } catch (retryErr) {
      throw retryErr instanceof Error ? retryErr : new Error(String(err));
    }
  }
}
