export type SP = Promise<Record<string, string | string[] | undefined>>;

export async function readSP(sp: SP) {
  const p = await sp;
  const get = (k: string) => {
    const v = p[k];
    return (Array.isArray(v) ? v[0] : v)?.slice(0, 200) ?? "";
  };
  const page = Math.max(1, Math.min(10_000, Number(get("page")) || 1));
  return { get, page };
}

export const isUuid = (v: string | undefined | null): v is string => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Échappe les jokers LIKE saisis par l'utilisateur. */
export const likeEscape = (v: string) => `%${v.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
