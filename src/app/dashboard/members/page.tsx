/**
 * Owner members page — `/dashboard/members`.
 *
 * Search by phone, view a member profile, export CSV, withdraw consent,
 * record marketing consent and anonymise a member (§18.20.7, §18.20.9).
 *
 * The phone is sent only in the POST body and is never placed in a URL, query
 * string, query key, log or `title`. The full phone is rendered only for a
 * caller with `members:pii`; every other caller sees the masked value.
 */

'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useRole } from '@/components/rbac/RoleProvider';
import { Button } from '@/components/ui/Button';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  marketingExportHref,
  useDeleteMember,
  useMemberProfile,
  useMemberSearch,
  useRecordMarketingConsent,
  useRenameMember,
  useWithdrawConsent,
  type ConsentScope,
  type Member,
} from '@/lib/hooks/queries/useMembers';
import {
  DELETE_MEMBER_CONFIRMATION_MESSAGE,
  MemberProfileCard,
  MemberResultsList,
  MembersBanner,
  MembersEmptyState,
  MembersErrorState,
  MembersPermissionDenied,
} from './MembersStates';

const INPUT_CLASS =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-900 outline-none focus:ring-2 focus:ring-blue-500';

type Banner = { kind: 'success' | 'error'; message: string } | null;
type WithdrawTarget = { member: Member; scope: ConsentScope } | null;

export default function MembersPage() {
  const { hasPermission, isLoading: roleLoading } = useRole();
  const canRead = hasPermission('members:read');
  const canViewPii = hasPermission('members:pii');
  const canEditName = hasPermission('members:pii');
  const canExport = hasPermission('members:export');
  const canDelete = hasPermission('members:delete');
  const canWithdrawConsent = hasPermission('members:consent_withdraw');
  const queriesEnabled = !roleLoading && canRead;

  const [phone, setPhone] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<Member[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<WithdrawTarget>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);

  const searchMutation = useMemberSearch();
  const profileQuery = useMemberProfile(selectedId, {
    enabled: queriesEnabled,
  });
  const withdrawMutation = useWithdrawConsent();
  const marketingMutation = useRecordMarketingConsent();
  const renameMutation = useRenameMember();
  const deleteMutation = useDeleteMember();

  if (roleLoading) {
    return <LoadingSpinner message="Checking permissions..." />;
  }

  if (!canRead) {
    return <MembersPermissionDenied />;
  }

  const selectedMember =
    profileQuery.data ??
    results.find((member) => member.id === selectedId) ??
    null;

  const replaceMember = (updated: Member) => {
    setResults((previous) =>
      previous.map((member) => (member.id === updated.id ? updated : member))
    );
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setBanner(null);
    setSearchError(null);

    const value = phone.trim();
    if (!value) {
      setSearchError('Enter a phone number to search.');
      return;
    }

    try {
      const members = await searchMutation.mutateAsync(value);
      setResults(members);
      setHasSearched(true);
      setSelectedId(members[0]?.id ?? null);
    } catch (error) {
      setResults([]);
      setHasSearched(true);
      setSelectedId(null);
      setSearchError(
        error instanceof Error
          ? error.message
          : 'Could not search for a member. Please try again.'
      );
    }
  };

  const confirmWithdraw = async () => {
    if (!withdrawTarget) return;
    setBanner(null);
    try {
      const data = await withdrawMutation.mutateAsync({
        memberId: withdrawTarget.member.id,
        scope: withdrawTarget.scope,
      });
      replaceMember(data.member);
      setBanner({
        kind: 'success',
        message:
          withdrawTarget.scope === 'LOYALTY'
            ? 'Loyalty consent withdrawn. Marketing consent was cleared too.'
            : 'Marketing consent withdrawn.',
      });
      setWithdrawTarget(null);
    } catch (error) {
      setBanner({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not withdraw consent. Please try again.',
      });
    }
  };

  const handleMarketingConsent = async (member: Member) => {
    setBanner(null);
    try {
      const data = await marketingMutation.mutateAsync(member.id);
      replaceMember(data.member);
      setBanner({ kind: 'success', message: 'Marketing consent recorded.' });
    } catch (error) {
      setBanner({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not record marketing consent. Please try again.',
      });
    }
  };

  const handleRename = async (member: Member, name: string | null) => {
    setBanner(null);
    const data = await renameMutation.mutateAsync({
      memberId: member.id,
      name,
    });
    replaceMember(data.member);
    setBanner({
      kind: 'success',
      message: name === null ? 'Member name cleared.' : 'Member name updated.',
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBanner(null);
    try {
      const data = await deleteMutation.mutateAsync(deleteTarget.id);
      setResults((previous) =>
        previous.filter((member) => member.id !== data.member.id)
      );
      setSelectedId(null);
      setBanner({
        kind: 'success',
        message: 'Member anonymised. Financial records were kept.',
      });
      setDeleteTarget(null);
    } catch (error) {
      setBanner({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not delete the member. Please try again.',
      });
    }
  };

  const isBusy =
    withdrawMutation.isPending ||
    marketingMutation.isPending ||
    renameMutation.isPending ||
    deleteMutation.isPending;

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <div className="mx-auto max-w-7xl space-y-5 px-5 pt-4 md:px-6">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <form
            onSubmit={handleSearch}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            noValidate
          >
            <div className="flex-1">
              <label
                htmlFor="member-phone"
                className="mb-1 block text-xs font-semibold uppercase text-gray-500"
              >
                Phone number
              </label>
              <input
                id="member-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={INPUT_CLASS}
                placeholder="+60123456789"
                disabled={searchMutation.isPending}
              />
              <p className="mt-1 text-xs text-gray-500">
                The number is sent in the request body only and is never placed
                in the URL.
              </p>
            </div>
            <Button
              type="submit"
              loading={searchMutation.isPending}
              className="min-h-11"
            >
              Search member
            </Button>
            {canExport && (
              <a
                href={marketingExportHref()}
                download
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
              >
                Export marketing list
              </a>
            )}
          </form>
        </div>

        {banner && (
          <MembersBanner kind={banner.kind} message={banner.message} />
        )}

        {searchError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{searchError}</span>
          </div>
        )}

        {searchMutation.isPending && (
          <LoadingSpinner size="sm" message="Searching members..." />
        )}

        {!searchMutation.isPending && results.length > 0 && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="space-y-2">
              <h2 className="text-sm font-semibold uppercase text-gray-500">
                Search results
              </h2>
              <MemberResultsList
                members={results}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </div>

            <div>
              {profileQuery.isLoading ? (
                <LoadingSpinner size="sm" message="Loading member profile..." />
              ) : profileQuery.isError ? (
                <MembersErrorState
                  message={
                    profileQuery.error instanceof Error
                      ? profileQuery.error.message
                      : 'Could not load the member profile.'
                  }
                  onRetry={() => {
                    void profileQuery.refetch();
                  }}
                />
              ) : selectedMember ? (
                <MemberProfileCard
                  member={selectedMember}
                  canViewPii={canViewPii}
                  canEditName={canEditName}
                  canExport={canExport}
                  canWithdrawConsent={canWithdrawConsent}
                  canDelete={canDelete}
                  isBusy={isBusy}
                  onWithdraw={(member, scope) =>
                    setWithdrawTarget({ member, scope })
                  }
                  onMarketingConsent={handleMarketingConsent}
                  onRename={(name) => handleRename(selectedMember, name)}
                  onDelete={setDeleteTarget}
                />
              ) : (
                <MembersEmptyState hasSearched={false} />
              )}
            </div>
          </div>
        )}

        {!searchMutation.isPending && results.length === 0 && !searchError && (
          <MembersEmptyState hasSearched={hasSearched} />
        )}
      </div>

      <ConfirmationModal
        isOpen={Boolean(withdrawTarget)}
        title={
          withdrawTarget?.scope === 'LOYALTY'
            ? 'Withdraw loyalty consent?'
            : 'Withdraw marketing consent?'
        }
        message={
          withdrawTarget?.scope === 'LOYALTY'
            ? 'The member stops earning visits and any marketing consent is cleared. Financial records and the visit card history are kept.'
            : 'The member will no longer receive marketing. Their visit card and financial records are kept.'
        }
        confirmText="Withdraw"
        variant="warning"
        onConfirm={confirmWithdraw}
        onCancel={() => setWithdrawTarget(null)}
        isLoading={withdrawMutation.isPending}
      />

      <ConfirmationModal
        isOpen={Boolean(deleteTarget)}
        title="Delete member?"
        message={DELETE_MEMBER_CONFIRMATION_MESSAGE}
        confirmText="Delete member"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
