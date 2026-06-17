"use server";

import { getSessionCtx } from "@/lib/auth-context";
import { listCis, getCi, getDownstreamImpact } from "@/lib/services/cmdb";

export async function listCisAction() {
  const ctx = await getSessionCtx();
  return listCis(ctx);
}

export async function getCiAction(ciId: string) {
  const ctx = await getSessionCtx();
  return getCi(ctx, ciId);
}

export async function getDownstreamImpactAction(ciId: string) {
  const ctx = await getSessionCtx();
  return getDownstreamImpact(ctx, ciId);
}
