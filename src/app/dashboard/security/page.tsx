'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Laptop,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { AUTH_ROUTES } from '@/lib/auth-routes';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface SessionSummary {
  id: string;
  isCurrent: boolean;
  roleTemplate: string;
  userType: string;
  restaurant: { id: string; name: string } | null;
  device: { platform: string; browser: string; label: string };
  ipAddress?: string;
  createdAt: string;
  lastActivity: string;
  expiresAt: string;
}

interface SessionsResponse {
  success: boolean;
  sessions: SessionSummary[];
  currentSessionId: string;
  maxSessions: number;
}

function relativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'just now';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function roleLabel(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function DeviceIcon({ platform }: { platform: string }) {
  if (platform === 'Android' || platform === 'iOS') {
    return <Smartphone className="h-5 w-5 text-gray-500" />;
  }
  if (platform === 'Unknown') {
    return <MonitorSmartphone className="h-5 w-5 text-gray-500" />;
  }
  return <Laptop className="h-5 w-5 text-gray-500" />;
}

export default function SecurityPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [maxSessions, setMaxSessions] = useState(5);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isBusyAll, setIsBusyAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await ApiClient.get<SessionsResponse>('/auth/sessions');
      setSessions(data.sessions || []);
      setMaxSessions(data.maxSessions || 5);
    } catch (error) {
      if (error instanceof ApiClientError) {
        toast.error(error.message);
      } else {
        toast.error('Failed to load active devices');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (session: SessionSummary) => {
    if (
      !window.confirm(
        session.isCurrent
          ? 'Sign out this device now?'
          : `Sign out ${session.device.label}?`
      )
    ) {
      return;
    }
    setBusyId(session.id);
    try {
      await ApiClient.delete(`/auth/sessions/${session.id}`);
      if (session.isCurrent) {
        ApiClient.clearRefreshState();
        router.replace(AUTH_ROUTES.LOGIN);
        return;
      }
      toast.success('Device signed out');
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : 'Failed to sign out device'
      );
    } finally {
      setBusyId(null);
    }
  };

  const revokeOthers = async () => {
    if (
      !window.confirm(
        'Sign out every other device? This device stays signed in.'
      )
    ) {
      return;
    }
    setIsBusyAll(true);
    try {
      await ApiClient.post('/auth/sessions/revoke-all', { othersOnly: true });
      toast.success('Other devices signed out');
      await load();
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : 'Failed to sign out other devices'
      );
    } finally {
      setIsBusyAll(false);
    }
  };

  const revokeAll = async () => {
    if (
      !window.confirm(
        'Sign out everywhere, including this device? You will need to log in again.'
      )
    ) {
      return;
    }
    setIsBusyAll(true);
    try {
      await ApiClient.post('/auth/sessions/revoke-all', { othersOnly: false });
      ApiClient.clearRefreshState();
      router.replace(AUTH_ROUTES.LOGIN);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : 'Failed to sign out everywhere'
      );
      setIsBusyAll(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const otherCount = sessions.filter((session) => !session.isCurrent).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-semibold text-gray-900">
            Security &amp; devices
          </h1>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Each web or Counter login is a separate session. Up to {maxSessions}{' '}
          sessions are kept; signing in on a sixth device removes the oldest.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-medium text-gray-900">Active sessions</h2>
            <p className="text-sm text-gray-500">
              {sessions.length} of {maxSessions} sessions
              {otherCount > 0
                ? ` · ${otherCount} other device${otherCount === 1 ? '' : 's'}`
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={revokeOthers}
              disabled={isBusyAll || otherCount === 0}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out other devices
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={revokeAll}
              disabled={isBusyAll}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Sign out everywhere
            </Button>
          </div>
        </div>

        <ul className="divide-y divide-gray-100">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-gray-50 p-2">
                  <DeviceIcon platform={session.device.platform} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {session.device.label}
                    </span>
                    {session.isCurrent && (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                        This device
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {roleLabel(session.roleTemplate)}
                    {session.restaurant ? ` · ${session.restaurant.name}` : ''}
                  </p>
                  <p className="text-xs text-gray-500">
                    Last active {relativeTime(session.lastActivity)}
                    {session.ipAddress ? ` · ${session.ipAddress}` : ''}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => revoke(session)}
                disabled={busyId === session.id || isBusyAll}
              >
                {busyId === session.id ? 'Signing out…' : 'Sign out'}
              </Button>
            </li>
          ))}
        </ul>

        {sessions.length === 0 && (
          <p className="p-6 text-center text-sm text-gray-500">
            No active sessions found.
          </p>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Lost a device? Sign it out here, then change your password. Signing out
        a web session does not stop a paired kitchen station; use Stations &amp;
        Devices for station hardware.
      </p>
    </div>
  );
}
