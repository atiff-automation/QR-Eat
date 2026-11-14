/**
 * Presentational states and cards for the owner members page.
 *
 * Kept out of `page.tsx` because Next.js only allows the page's default export
 * plus its reserved exports. These are exported for state tests.
 */

'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Search,
  ShieldOff,
  UserX,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  memberExportHref,
  memberPhone,
  memberStatusLabel,
  memberVisitProgress,
  type Member,
} from '@/lib/hooks/queries/useMembers';

/** Maximum owner-entered member name, mirrored by the API (P7d). */
export const MEMBER_NAME_MAX_LENGTH = 80;

const NAME_INPUT_CLASS =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500';

const ERROR_BANNER =
  'flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700';
const SUCCESS_BANNER =
  'flex items-start gap-2 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700';

/**
 * Plain-language delete confirmation. A member is anonymised in place; the
 * financial records are never deleted (§18.20.9).
 */
export const DELETE_MEMBER_CONFIRMATION_MESSAGE =
  'This anonymises the member: their name and phone are removed and marketing consent is cleared. Financial records are kept.';

function StatusBadge({ member }: { member: Member }) {
  const anonymised = member.status === 'ANONYMIZED';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        anonymised ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-800'
      }`}
    >
      {memberStatusLabel(member.status)}
    </span>
  );
}

function memberName(member: Member): string {
  return member.name?.trim() || 'Unnamed member';
}

/** Permission-denied state. */
export function MembersPermissionDenied() {
  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <div className="mx-auto max-w-3xl space-y-5 px-5 pt-4 md:px-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <ShieldOff className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
            <div>
              <h2 className="text-lg font-semibold text-amber-900">
                Members are owner-managed
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                You need the members:read permission to search members and view
                their visit cards.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Empty state, both before a search and when no member matches. */
export function MembersEmptyState({ hasSearched }: { hasSearched: boolean }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-8 text-center shadow-sm">
      {hasSearched ? (
        <UserX className="mx-auto h-8 w-8 text-gray-400" />
      ) : (
        <Search className="mx-auto h-8 w-8 text-gray-400" />
      )}
      <h2 className="mt-3 text-base font-semibold text-gray-900">
        {hasSearched ? 'No member found' : 'Search for a member'}
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        {hasSearched
          ? 'No active member matches that phone number. Check the number or ask the member to join at the counter.'
          : 'Search by phone number to see the member’s visit card, consent and export options.'}
      </p>
    </div>
  );
}

/** Error state with a retry action. */
export function MembersErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div role="alert" className={ERROR_BANNER}>
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 min-h-11 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        Retry
      </button>
    </div>
  );
}

/** A status/success banner shared by the page actions. */
export function MembersBanner({
  kind,
  message,
}: {
  kind: 'success' | 'error';
  message: string;
}) {
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={kind === 'error' ? ERROR_BANNER : SUCCESS_BANNER}
    >
      {kind === 'error' ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      ) : (
        <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      )}
      <span>{message}</span>
    </div>
  );
}

/**
 * Search results. The list always shows the masked phone; the full E.164 value
 * is reserved for the profile view and only for a caller with `members:pii`.
 */
export function MemberResultsList({
  members,
  selectedId,
  onSelect,
}: {
  members: Member[];
  selectedId: string | null;
  onSelect: (memberId: string) => void;
}) {
  return (
    <ul className="space-y-2" aria-label="Member search results">
      {members.map((member) => {
        const selected = member.id === selectedId;
        return (
          <li key={member.id}>
            <button
              type="button"
              onClick={() => onSelect(member.id)}
              aria-pressed={selected}
              className={`flex min-h-11 w-full flex-col gap-1 rounded-xl border p-4 text-left shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                selected
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-gray-100 bg-white hover:bg-gray-50'
              }`}
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-base font-semibold text-gray-900">
                  {memberName(member)}
                </span>
                <StatusBadge member={member} />
              </span>
              <span className="text-sm text-gray-600">
                {member.maskedPhone ?? 'Phone removed'}
              </span>
              <span className="text-sm text-gray-600">
                {memberVisitProgress(member.card)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function consentSummary(member: Member): string {
  if (member.status === 'ANONYMIZED') return 'Anonymised member';
  if (member.consentWithdrawnAt) return 'Loyalty consent withdrawn';
  if (member.consentAt) {
    return member.consentVersion
      ? `Loyalty consent recorded (notice ${member.consentVersion})`
      : 'Loyalty consent recorded';
  }
  return 'No loyalty consent recorded';
}

function marketingSummary(member: Member): string {
  if (member.marketingOptIn) {
    return member.marketingConsentVersion
      ? `Marketing consent recorded (notice ${member.marketingConsentVersion})`
      : 'Marketing consent recorded';
  }
  if (member.marketingWithdrawnAt) return 'Marketing consent withdrawn';
  return 'No marketing consent';
}

/**
 * Owner rename control behind `members:pii` (P7d). Trimmed, max 80
 * characters; leaving it blank clears the name. Field-level errors use
 * `aria-invalid`/`aria-describedby`. The input follows the standard 40px
 * token; the submit button keeps a 44px touch target.
 */
export function MemberNameEditor({
  member,
  isBusy,
  onRename,
}: {
  member: Member;
  isBusy: boolean;
  onRename: (name: string | null) => Promise<void> | void;
}) {
  const [value, setValue] = useState(member.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const trimmed = value.trim();
  const tooLong = trimmed.length > MEMBER_NAME_MAX_LENGTH;
  const displayError = tooLong
    ? `A member name can be at most ${MEMBER_NAME_MAX_LENGTH} characters.`
    : error;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (tooLong) return;

    setIsSaving(true);
    try {
      await onRename(trimmed.length === 0 ? null : trimmed);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not update the name. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4"
      noValidate
    >
      <h3 className="text-sm font-semibold text-gray-900">Edit name</h3>
      <p className="mt-1 text-sm text-gray-600">
        Correct a name captured at enrolment. Leave it blank to clear the name.
        This is recorded in the member audit log.
      </p>
      <label
        htmlFor="member-name"
        className="mt-3 mb-1 block text-xs font-semibold uppercase text-gray-500"
      >
        Member name
      </label>
      <input
        id="member-name"
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className={NAME_INPUT_CLASS}
        disabled={isBusy || isSaving}
        aria-invalid={Boolean(displayError) || undefined}
        aria-describedby={
          displayError ? 'member-name-error' : 'member-name-help'
        }
      />
      <p id="member-name-help" className="mt-1 text-xs text-gray-500">
        Up to {MEMBER_NAME_MAX_LENGTH} characters. Leading and trailing spaces
        are removed.
      </p>
      {displayError && (
        <p
          id="member-name-error"
          role="alert"
          className="mt-1 text-xs text-red-700"
        >
          {displayError}
        </p>
      )}
      <Button
        type="submit"
        className="mt-3 min-h-11"
        loading={isSaving}
        disabled={isBusy || isSaving}
      >
        Save name
      </Button>
    </form>
  );
}

/** Member profile with consent, export, rename and delete actions. */
export function MemberProfileCard({
  member,
  canViewPii,
  canEditName,
  canExport,
  canWithdrawConsent,
  canDelete,
  isBusy,
  onWithdraw,
  onMarketingConsent,
  onRename,
  onDelete,
}: {
  member: Member;
  canViewPii: boolean;
  canEditName: boolean;
  canExport: boolean;
  canWithdrawConsent: boolean;
  canDelete: boolean;
  isBusy: boolean;
  onWithdraw: (member: Member, scope: 'LOYALTY' | 'MARKETING') => void;
  onMarketingConsent: (member: Member) => void;
  onRename: (name: string | null) => Promise<void> | void;
  onDelete: (member: Member) => void;
}) {
  const phone = memberPhone(member, canViewPii);
  const loyaltyActive =
    member.status === 'ACTIVE' &&
    Boolean(member.consentAt) &&
    !member.consentWithdrawnAt;
  const canWithdrawLoyalty = canWithdrawConsent && loyaltyActive;
  const canWithdrawMarketing =
    canWithdrawConsent && member.status === 'ACTIVE' && member.marketingOptIn;
  const canRecordMarketing =
    canWithdrawConsent && loyaltyActive && !member.marketingOptIn;
  const missingActions = [
    !canExport ? 'export' : null,
    !canWithdrawConsent ? 'change consent' : null,
    !canDelete ? 'delete' : null,
  ].filter((value): value is string => value !== null);

  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {memberName(member)}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            {phone ?? 'Phone removed'}
            {!canViewPii && phone ? ' · masked for your role' : ''}
          </p>
        </div>
        <StatusBadge member={member} />
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase text-gray-500">
            Visit card
          </dt>
          <dd className="mt-0.5 text-gray-900">
            {memberVisitProgress(member.card)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-gray-500">
            Loyalty consent
          </dt>
          <dd className="mt-0.5 text-gray-900">{consentSummary(member)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-gray-500">
            Marketing consent
          </dt>
          <dd className="mt-0.5 text-gray-900">{marketingSummary(member)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-gray-500">
            Last visit
          </dt>
          <dd className="mt-0.5 text-gray-900">
            {member.lastVisitAt
              ? new Date(member.lastVisitAt).toLocaleDateString('en-MY')
              : 'No visits yet'}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {canExport && (
          <a
            href={memberExportHref(member.id)}
            download
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
          >
            Export member CSV
          </a>
        )}
        {canWithdrawLoyalty && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={isBusy}
            onClick={() => onWithdraw(member, 'LOYALTY')}
          >
            Withdraw loyalty consent
          </Button>
        )}
        {canWithdrawMarketing && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={isBusy}
            onClick={() => onWithdraw(member, 'MARKETING')}
          >
            Withdraw marketing consent
          </Button>
        )}
        {canDelete && member.status !== 'ANONYMIZED' && (
          <Button
            type="button"
            variant="danger"
            className="min-h-11"
            disabled={isBusy}
            onClick={() => onDelete(member)}
          >
            Delete member
          </Button>
        )}
      </div>

      {missingActions.length > 0 && (
        <p className="mt-3 text-xs text-gray-600">
          Your role can view this member but cannot {missingActions.join(', ')}.
          Ask an owner if you need to make those changes.
        </p>
      )}

      {canEditName && member.status === 'ACTIVE' && (
        <MemberNameEditor
          key={`${member.id}:${member.name ?? ''}`}
          member={member}
          isBusy={isBusy}
          onRename={onRename}
        />
      )}

      {canRecordMarketing && (
        <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-900">
            Record marketing consent
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            This records marketing consent for this member using your staff
            account as the actor and the current notice version. Only continue
            if the member has agreed to receive marketing.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11"
            disabled={isBusy}
            onClick={() => onMarketingConsent(member)}
          >
            Record marketing consent
          </Button>
        </div>
      )}
    </section>
  );
}
