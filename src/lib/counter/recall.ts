import { isRecallEnabled } from '@/lib/recall';

/** Shared nested select for an order's active recall(s). */
export const ACTIVE_RECALL_SELECT = {
  where: { resolvedAt: null },
  select: { recalledAt: true, reason: true },
  orderBy: { recalledAt: 'desc' as const },
  take: 1,
};

export interface ActiveRecallRow {
  recalledAt: Date;
  reason: string | null;
}

export function recallFields(recalls: ActiveRecallRow[] | undefined) {
  const recall = recalls?.[0];
  return {
    recalled: Boolean(recall),
    recalledAt: recall?.recalledAt.toISOString() ?? null,
    recallReason: recall?.reason ?? null,
  };
}

export function recallCapability() {
  return { recallEnabled: isRecallEnabled() };
}
