import { useEffect, useState } from "react";
import { parse } from "yaml";
import { useAuth } from "@/lib/google-auth";
import { getPrivateText } from "@/lib/private-files";
import type { RoomKind } from "./room";

/** contribution-limits.yaml at the repo root (you supply it, see SETUP.md): starting room per tax year. Empty = unknown. */

export const LIMITS_FILE = "contribution-limits.yaml";

export type YearLimits = Partial<Record<RoomKind, number>>;

export interface Limits {
  years: Record<number, YearLimits>;
  descriptions: Partial<Record<RoomKind, string>>;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);

export function parseLimits(text: string): Limits {
  const doc = (parse(text) ?? {}) as { types?: Record<string, { description?: string }>; years?: Record<string, Record<string, unknown> | null> };
  const years: Record<number, YearLimits> = {};
  for (const [y, v] of Object.entries(doc.years ?? {})) {
    const year = Number(y);
    if (!Number.isInteger(year)) continue;
    years[year] = { tfsa: num(v?.tfsa), rrsp: num(v?.rrsp), fhsa: num(v?.fhsa) };
  }
  const descriptions: Limits["descriptions"] = {};
  for (const k of ["tfsa", "rrsp", "fhsa"] as RoomKind[]) {
    const d = doc.types?.[k]?.description;
    if (typeof d === "string") descriptions[k] = d.trim();
  }
  return { years, descriptions };
}

type LimitsState = { status: "loading" } | { status: "missing" } | { status: "error"; error: string } | { status: "ready"; limits: Limits };

export function useLimits(): LimitsState {
  const [state, setState] = useState<LimitsState>({ status: "loading" });
  const signedIn = useAuth().status === "signed-in";
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    getPrivateText(LIMITS_FILE)
      .then((text) => {
        if (cancelled) return;
        if (text === null) setState({ status: "missing" });
        else setState({ status: "ready", limits: parseLimits(text) });
      })
      .catch((e: Error) => !cancelled && setState({ status: "error", error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [signedIn]);
  return state;
}
