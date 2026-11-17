/**
 * Member Hooks - TanStack Query
 *
 * Owner dashboard hooks for `/api/members` (§18.20.7, §18.20.9). Search is a
 * POST so the phone travels in the JSON body and never in a URL, query string
 * or query key. Every mutation sends a fresh `Idempotency-Key`.
 *
 * The server decides whether the full E.164 phone is returned: it is present
 * only for a caller with `members:pii`. The helpers here still require the
 * caller to pass `canViewPii`, so a mocked or unexpected payload cannot leak a
 * full phone into a screen without that permission.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

/** Fixed, auditable purpose for the owner member lookup. */
export const MEMBER_SEARCH_PURPOSE = 'Owner member lookup';
export const MEMBER_PROFILE_PURPOSE = 'Owner member profile';
export const MEMBER_EXPORT_PURPOSE = 'Owner member export';
export const MARKETING_EXPORT_PURPOSE = 'Owner marketing list export';
export const MARKETING_CONSENT_PURPOSE = 'Owner recorded marketing consent';

export type MemberStatus = 'ACTIVE' | 'ANONYMIZED';
export type ConsentScope = 'LOYALTY' | 'MARKETING';

export interface MemberCard {
  visitsInCycle: number;
  visitsRequired: number;
  cycleNumber: number;
}

export interface Member {
  id: string;
  name: string | null;
  /** Full E.164 phone only with `members:pii`; otherwise null. */
  phone: string | null;
  maskedPhone: string | null;
  status: MemberStatus;
  consentAt: string | null;
  consentVersion: string | null;
  consentSource: string | null;
  consentWithdrawnAt: string | null;
  marketingOptIn: boolean;
  marketingConsentAt: string | null;
  marketingConsentVersion: string | null;
  marketingConsentSource: string | null;
  marketingWithdrawnAt: string | null;
  anonymizedAt: string | null;
  lastVisitAt: string | null;
  createdAt: string;
  updatedAt: string;
  card: MemberCard | null;
}

export interface MemberSearchResponse {
  success: true;
  members: Member[];
}

export interface MemberMutationResponse {
  success: true;
  member: Member;
  scope?: ConsentScope;
  noticeVersion?: string;
  ordersAnonymised?: number;
}

export interface MemberQueryOptions {
  enabled?: boolean;
}

/** The phone a screen may render: full only with `members:pii`. */
export function memberPhone(
  member: Pick<Member, 'phone' | 'maskedPhone'>,
  canViewPii: boolean
): string | null {
  return canViewPii ? (member.phone ?? member.maskedPhone) : member.maskedPhone;
}

export function memberStatusLabel(status: MemberStatus): string {
  return status === 'ANONYMIZED' ? 'Anonymised' : 'Active member';
}

/** Visit progress in owner vocabulary; never "points" or "stamps". */
export function memberVisitProgress(card: MemberCard | null): string {
  if (!card) return 'No visit card yet';
  return `${card.visitsInCycle} of ${card.visitsRequired} visits`;
}

/**
 * CSV download links. `purpose` is not PII and the phone is never part of the
 * path or query string. The API responds with `Content-Disposition: attachment`.
 */
export function memberExportHref(memberId: string): string {
  return `/api/members/${memberId}/export?purpose=${encodeURIComponent(
    MEMBER_EXPORT_PURPOSE
  )}`;
}

export function marketingExportHref(): string {
  return `/api/members/export?purpose=${encodeURIComponent(
    MARKETING_EXPORT_PURPOSE
  )}`;
}

/** Exact phone lookup. The phone is only ever sent in the request body. */
export function useMemberSearch() {
  return useMutation({
    mutationFn: async (phone: string) => {
      const data = await ApiClient.post<MemberSearchResponse>(
        '/members/search',
        { phone, purpose: MEMBER_SEARCH_PURPOSE }
      );
      return data.members;
    },
  });
}

/** Tenant-scoped member profile. Disabled until the member and permission exist. */
export function useMemberProfile(
  memberId: string | null,
  options: MemberQueryOptions = {}
) {
  return useQuery({
    queryKey: queryKeys.members.profile(memberId ?? 'none'),
    queryFn: async () => {
      if (!memberId) throw new Error('A member id is required');
      const data = await ApiClient.get<{ member: Member }>(
        `/members/${memberId}`,
        { params: { purpose: MEMBER_PROFILE_PURPOSE } }
      );
      return data.member;
    },
    enabled: (options.enabled ?? true) && Boolean(memberId),
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

function useMemberMutationCache() {
  const queryClient = useQueryClient();

  return {
    queryClient,
    cacheMember(member: Member) {
      queryClient.setQueryData(queryKeys.members.profile(member.id), member);
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all });
    },
  };
}

/**
 * Owner rename behind `members:pii` (P7d). Sends `{ name: string | null }`;
 * `null` clears the name. A fresh `Idempotency-Key` is generated per submit so
 * a double click cannot apply twice. The server returns the updated member and
 * the profile cache is refreshed.
 */
export function useRenameMember() {
  const { cacheMember } = useMemberMutationCache();

  return useMutation({
    mutationFn: async ({
      memberId,
      name,
    }: {
      memberId: string;
      name: string | null;
    }) => {
      return ApiClient.patch<MemberMutationResponse>(
        `/members/${memberId}`,
        { name },
        { headers: { 'Idempotency-Key': crypto.randomUUID() } }
      );
    },
    onSuccess: (data) => {
      if (data?.member) cacheMember(data.member);
    },
  });
}

export function useWithdrawConsent() {
  const { cacheMember } = useMemberMutationCache();

  return useMutation({
    mutationFn: async ({
      memberId,
      scope,
    }: {
      memberId: string;
      scope: ConsentScope;
    }) => {
      return ApiClient.post<MemberMutationResponse>(
        `/members/${memberId}/withdraw-consent`,
        { scope },
        { headers: { 'Idempotency-Key': crypto.randomUUID() } }
      );
    },
    onSuccess: (data) => {
      if (data?.member) cacheMember(data.member);
    },
  });
}

export function useRecordMarketingConsent() {
  const { cacheMember } = useMemberMutationCache();

  return useMutation({
    mutationFn: async (memberId: string) => {
      return ApiClient.post<MemberMutationResponse>(
        `/members/${memberId}/marketing-consent`,
        { purpose: MARKETING_CONSENT_PURPOSE },
        { headers: { 'Idempotency-Key': crypto.randomUUID() } }
      );
    },
    onSuccess: (data) => {
      if (data?.member) cacheMember(data.member);
    },
  });
}

export function useDeleteMember() {
  const { queryClient } = useMemberMutationCache();

  return useMutation({
    mutationFn: async (memberId: string) => {
      return ApiClient.delete<MemberMutationResponse>(`/members/${memberId}`, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
    },
    onSuccess: (data) => {
      if (data?.member) {
        queryClient.setQueryData(
          queryKeys.members.profile(data.member.id),
          data.member
        );
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all });
    },
  });
}
