'use client';

import { useId } from 'react';
import { formatPrice } from '@/lib/qr-utils';
import {
  buildRuleCopy,
  type LoyaltyNotice,
  type LoyaltyQuote,
} from '@/components/qr/loyalty-checkout';

interface LoyaltyRuleCardProps {
  notice: LoyaltyNotice;
  quote?: LoyaltyQuote | null;
  currency: string;
}

/**
 * The rewards rule in plain words. Every number and label comes from the
 * server notice/quote; this component only lays it out.
 */
export function LoyaltyRuleCard({
  notice,
  quote,
  currency,
}: LoyaltyRuleCardProps) {
  const headingId = useId();
  const copy = buildRuleCopy(notice, quote);

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-orange-100 bg-orange-50/70 p-4"
    >
      <h2 id={headingId} className="text-sm font-bold text-gray-900">
        Rewards
      </h2>
      <ul className="mt-2 space-y-1 text-sm leading-6 text-gray-800">
        <li>{copy.intro}</li>
        <li>{copy.visits}</li>
        <li>{copy.reward}</li>
        {copy.capAmount && (
          <li>
            {copy.capLabel} {formatPrice(copy.capAmount, currency)}
          </li>
        )}
        <li>{copy.minimum}</li>
      </ul>
    </section>
  );
}
