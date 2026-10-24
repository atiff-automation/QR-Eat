'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRole } from '@/components/rbac/RoleProvider';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import {
  Check,
  Copy,
  Loader2,
  MonitorSmartphone,
  Plus,
  RefreshCw,
  Server,
  ShieldOff,
  ShieldCheck,
  X,
} from 'lucide-react';

interface StationCategory {
  category: { id: string; name: string; isActive: boolean };
}

interface Station {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  categories: StationCategory[];
  _count: { devices: number };
}

interface Device {
  id: string;
  name: string;
  platform: string;
  appVersion: string | null;
  deviceModel: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  lastPrintAt: string | null;
  station: { id: string; name: string; isActive: boolean };
}

interface Category {
  id: string;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

interface ProvisionResult {
  deviceId: string;
  deviceSecret: string;
  name: string;
  station: { id: string; name: string };
  restaurant: { id: string; name: string };
}

function relativeTime(value: string | null): string {
  if (!value) return 'never';
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff)) return value;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function CategoryPicker({
  categories,
  selected,
  onToggle,
}: {
  categories: Category[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (categories.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No menu categories yet. Create menu categories before mapping stations.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {categories.map((category) => {
        const checked = selected.has(category.id);
        return (
          <label
            key={category.id}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              checked
                ? 'border-blue-300 bg-blue-50 text-blue-900'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(category.id)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="flex-1">{category.name}</span>
            {category.status === 'INACTIVE' && (
              <span className="text-[10px] uppercase text-gray-400">
                inactive
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

export default function StationsPage() {
  const { hasPermission, isLoading: roleLoading } = useRole();
  const canManage = hasPermission('restaurant:settings');

  const [stations, setStations] = useState<Station[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [stationName, setStationName] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [newStationCategories, setNewStationCategories] = useState<Set<string>>(
    new Set()
  );
  const [creatingStation, setCreatingStation] = useState(false);

  const [editingStationId, setEditingStationId] = useState<string | null>(null);
  const [editCategories, setEditCategories] = useState<Set<string>>(new Set());
  const [savingCategories, setSavingCategories] = useState(false);

  const [deviceName, setDeviceName] = useState('');
  const [deviceStationId, setDeviceStationId] = useState('');
  const [provisioning, setProvisioning] = useState(false);
  const [provisioned, setProvisioned] = useState<ProvisionResult | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    setError('');
    try {
      const [stationData, deviceData, categoryData] = await Promise.all([
        ApiClient.get<{ stations: Station[] }>('/stations'),
        ApiClient.get<{ devices: Device[] }>('/devices'),
        ApiClient.get<{ categories: Category[] }>('/admin/menu/categories'),
      ]);
      setStations(stationData.stations);
      setDevices(deviceData.devices);
      setCategories(categoryData.categories);
      setDeviceStationId((current) => {
        if (current && stationData.stations.some((s) => s.id === current)) {
          return current;
        }
        return stationData.stations.find((s) => s.isActive)?.id ?? '';
      });
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not load stations and devices.'
      );
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeStations = useMemo(
    () => stations.filter((station) => station.isActive),
    [stations]
  );

  const toggleSet = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string
  ) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createStation = async () => {
    if (!stationName.trim()) return;
    setCreatingStation(true);
    setError('');
    try {
      await ApiClient.post('/stations', {
        name: stationName.trim(),
        isDefault: makeDefault,
        categoryIds: [...newStationCategories],
      });
      setStationName('');
      setMakeDefault(false);
      setNewStationCategories(new Set());
      setNotice('Station created.');
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not create station.'
      );
    } finally {
      setCreatingStation(false);
    }
  };

  const beginEditCategories = (station: Station) => {
    setEditingStationId(station.id);
    setEditCategories(new Set(station.categories.map((c) => c.category.id)));
    setError('');
  };

  const saveCategories = async (station: Station) => {
    setSavingCategories(true);
    setError('');
    try {
      await ApiClient.patch(`/stations/${station.id}`, {
        categoryIds: [...editCategories],
      });
      setEditingStationId(null);
      setNotice('Station category mapping updated.');
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not update station categories.'
      );
    } finally {
      setSavingCategories(false);
    }
  };

  const provisionDevice = async () => {
    if (!deviceName.trim() || !deviceStationId) return;
    setProvisioning(true);
    setError('');
    try {
      const result = await ApiClient.post<ProvisionResult>(
        '/devices/provision',
        {
          name: deviceName.trim(),
          stationId: deviceStationId,
          platform: 'android',
        }
      );
      setProvisioned(result);
      setDeviceName('');
      setNotice('Device provisioned. Save the secret now.');
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not provision device.'
      );
    } finally {
      setProvisioning(false);
    }
  };

  const revokeDevice = async (device: Device) => {
    if (
      !window.confirm(
        `Revoke "${device.name}"? The station will need a new device secret.`
      )
    ) {
      return;
    }
    try {
      await ApiClient.post(`/devices/${device.id}/revoke`, {});
      setNotice(`Revoked ${device.name}.`);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Could not revoke device.'
      );
    }
  };

  const copySecret = async () => {
    if (!provisioned) return;
    try {
      await navigator.clipboard.writeText(provisioned.deviceSecret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Clipboard unavailable. Select and copy the secret manually.');
    }
  };

  if (roleLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-lg font-semibold text-amber-900">
            Owner access required
          </h1>
          <p className="mt-2 text-sm text-amber-800">
            Stations and devices are managed by the restaurant owner. A manager
            can run the floor but cannot reveal device credentials.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Stations &amp; Devices
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Each station is a work area. Each phone is one provisioned device. A
            kitchen phone prints only its station&apos;s items.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Stations</h2>
          </div>

          {stations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-600">
              No stations yet. Create the first station before provisioning a
              phone.
            </div>
          ) : (
            <div className="space-y-3">
              {stations.map((station) => (
                <div
                  key={station.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-900">
                          {station.name}
                        </h3>
                        {station.isDefault && (
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                            Default
                          </span>
                        )}
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            station.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {station.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {station._count.devices} device
                        {station._count.devices === 1 ? '' : 's'} ·{' '}
                        {station.categories.length} categor
                        {station.categories.length === 1 ? 'y' : 'ies'} mapped
                      </p>
                    </div>
                    <button
                      onClick={() => beginEditCategories(station)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Edit categories
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {station.categories.length === 0 ? (
                      <span className="text-xs text-amber-700">
                        No categories mapped; unmapped items fall back to the
                        default station.
                      </span>
                    ) : (
                      station.categories.map(({ category }) => (
                        <span
                          key={category.id}
                          className="rounded bg-gray-100 px-2 py-1 text-[11px] text-gray-700"
                        >
                          {category.name}
                        </span>
                      ))
                    )}
                  </div>

                  {editingStationId === station.id && (
                    <div className="mt-4 space-y-3 border-t border-gray-100 pt-3">
                      <CategoryPicker
                        categories={categories}
                        selected={editCategories}
                        onToggle={(id) => toggleSet(setEditCategories, id)}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingStationId(null)}
                          className="h-9 rounded-lg border border-gray-200 px-3 text-sm text-gray-600"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => void saveCategories(station)}
                          disabled={savingCategories}
                          className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {savingCategories && (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          )}
                          Save mapping
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Create station</h3>
            </div>
            <div className="mt-3 space-y-3">
              <input
                value={stationName}
                onChange={(event) => setStationName(event.target.value)}
                placeholder="e.g. Grill, Drinks, Pass"
                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={makeDefault}
                  onChange={(event) => setMakeDefault(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Make this the default station
              </label>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Categories routed here
                </p>
                <CategoryPicker
                  categories={categories}
                  selected={newStationCategories}
                  onToggle={(id) => toggleSet(setNewStationCategories, id)}
                />
              </div>
              <button
                onClick={() => void createStation()}
                disabled={creatingStation || !stationName.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creatingStation ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create station
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <MonitorSmartphone className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Devices</h2>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="font-semibold text-gray-900">Provision a phone</h3>
            <p className="mt-1 text-sm text-gray-600">
              The secret is shown once. Enter it in the station Setup screen.
              Revoking a device invalidates its token.
            </p>
            <div className="mt-3 space-y-3">
              <input
                value={deviceName}
                onChange={(event) => setDeviceName(event.target.value)}
                placeholder="e.g. Redmi Kitchen"
                className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <select
                value={deviceStationId}
                onChange={(event) => setDeviceStationId(event.target.value)}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Select a station</option>
                {activeStations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void provisionDevice()}
                disabled={
                  provisioning || !deviceName.trim() || !deviceStationId
                }
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {provisioning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Provision device
              </button>
            </div>
          </div>

          {provisioned && (
            <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-blue-900">
                    Device secret — show once
                  </h3>
                  <p className="mt-1 text-xs text-blue-800">
                    Enter these values in the station Setup screen. The secret
                    cannot be retrieved again.
                  </p>
                </div>
                <button
                  onClick={() => setProvisioned(null)}
                  aria-label="Dismiss secret"
                >
                  <X className="h-4 w-4 text-blue-700" />
                </button>
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase text-blue-700">
                    Device ID
                  </dt>
                  <dd className="break-all rounded bg-white p-2 font-mono text-xs text-gray-900">
                    {provisioned.deviceId}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-blue-700">
                    Device secret
                  </dt>
                  <dd className="flex items-center gap-2 break-all rounded bg-white p-2 font-mono text-xs text-gray-900">
                    <span className="flex-1">{provisioned.deviceSecret}</span>
                    <button
                      onClick={() => void copySecret()}
                      className="inline-flex h-8 items-center gap-1 rounded border border-gray-200 px-2 text-[11px] font-semibold text-gray-700"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </dd>
                </div>
              </dl>
            </div>
          )}

          <div className="space-y-3">
            {devices.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-600">
                No devices yet.
              </div>
            ) : (
              devices.map((device) => (
                <div
                  key={device.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">
                          {device.name}
                        </h3>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                            device.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {device.isActive ? 'Active' : 'Revoked'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {device.station.name} · {device.platform}
                        {device.appVersion ? ` · v${device.appVersion}` : ''}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Last seen {relativeTime(device.lastSeenAt)} · last print{' '}
                        {relativeTime(device.lastPrintAt)}
                      </p>
                    </div>
                    {device.isActive ? (
                      <button
                        onClick={() => void revokeDevice(device)}
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                      >
                        <ShieldOff className="h-3.5 w-3.5" />
                        Revoke
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        inactive
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
