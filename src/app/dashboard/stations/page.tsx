'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRole } from '@/components/rbac/RoleProvider';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import {
  AlertTriangle,
  CheckCircle2,
  MonitorSmartphone,
  Plus,
  RefreshCw,
  Server,
  ShieldOff,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

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
  pairedAt: string | null;
  hasPendingCode: boolean;
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
  pairingCode: string;
  name: string;
  station: { id: string; name: string };
  restaurant: { id: string; name: string };
}

/** The code currently on screen. One panel serves create, reissue and reveal. */
interface CodePanel {
  deviceId: string;
  deviceName: string;
  code: string;
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
  const [codePanel, setCodePanel] = useState<CodePanel | null>(null);
  const [codeBusyId, setCodeBusyId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Device | null>(null);
  const [revoking, setRevoking] = useState(false);

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
      setCodePanel({
        deviceId: result.deviceId,
        deviceName: result.name,
        code: result.pairingCode,
      });
      setDeviceName('');
      setNotice('Device created. Type its code into the station setup screen.');
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

  const revokeDevice = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await ApiClient.post(`/devices/${revokeTarget.id}/revoke`, {});
      setNotice(`Revoked ${revokeTarget.name}.`);
      setRevokeTarget(null);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Could not revoke device.'
      );
    } finally {
      setRevoking(false);
    }
  };

  const createCode = async (device: Device) => {
    setCodeBusyId(device.id);
    setError('');
    try {
      const result = await ApiClient.post<{
        deviceId: string;
        pairingCode: string;
      }>(`/devices/${device.id}/code`, {});
      setCodePanel({
        deviceId: result.deviceId,
        deviceName: device.name,
        code: result.pairingCode,
      });
      setNotice(`Pairing code created for ${device.name}.`);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not create a pairing code.'
      );
    } finally {
      setCodeBusyId(null);
    }
  };

  const revealCode = async (device: Device) => {
    setCodeBusyId(device.id);
    setError('');
    try {
      const result = await ApiClient.get<{
        deviceId: string;
        pairingCode: string;
      }>(`/devices/${device.id}/code`);
      setCodePanel({
        deviceId: result.deviceId,
        deviceName: device.name,
        code: result.pairingCode,
      });
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Could not read the pairing code.'
      );
    } finally {
      setCodeBusyId(null);
    }
  };

  if (roleLoading) {
    return <LoadingSpinner message="Loading stations and devices..." />;
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
            can run the floor but cannot create pairing codes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <div className="mx-auto max-w-7xl space-y-5 px-5 pt-4 md:px-6">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="max-w-3xl text-sm text-gray-600">
            Each station is a work area. Each phone is one provisioned device. A
            kitchen phone prints only its station&apos;s items.
          </p>
          <button
            onClick={() => void load()}
            className="touch-target rounded-lg p-2 text-gray-400 transition-colors hover:text-blue-600"
            title="Refresh stations and devices"
            aria-label="Refresh stations and devices"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
        {notice && (
          <div className="flex items-center justify-between rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              {notice}
            </span>
            <button onClick={() => setNotice('')} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-2">
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
                    className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => beginEditCategories(station)}
                      >
                        Edit categories
                      </Button>
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
                        <p className="text-xs text-gray-500">
                          One category routes to one station. Selecting it here
                          moves it from any other station.
                        </p>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingStationId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            loading={savingCategories}
                            onClick={() => void saveCategories(station)}
                          >
                            Save mapping
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
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
                  <p className="mt-2 text-xs text-gray-500">
                    One category routes to one station. Selecting it here moves
                    it from any other station.
                  </p>
                </div>
                <Button
                  onClick={() => void createStation()}
                  disabled={!stationName.trim()}
                  loading={creatingStation}
                >
                  {!creatingStation && <Plus className="mr-2 h-4 w-4" />}
                  Create station
                </Button>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <MonitorSmartphone className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Devices</h2>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-gray-900">Add a device</h3>
              <p className="mt-1 text-sm text-gray-600">
                Creates a single-use pairing code. Type it into the station
                setup screen. The code never expires; revoking the device is
                what takes it off the kitchen.
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
                <Button
                  onClick={() => void provisionDevice()}
                  disabled={!deviceName.trim() || !deviceStationId}
                  loading={provisioning}
                >
                  {!provisioning && <Plus className="mr-2 h-4 w-4" />}
                  Create device
                </Button>
              </div>
            </div>

            {codePanel && (
              <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-blue-900">
                      Pairing code
                    </h3>
                    <p className="mt-1 text-xs text-blue-800">
                      Type this into the station setup screen. It works once.
                      The code never expires, so it is safe to set up later.
                    </p>
                  </div>
                  <button
                    onClick={() => setCodePanel(null)}
                    aria-label="Dismiss pairing code"
                  >
                    <X className="h-4 w-4 text-blue-700" />
                  </button>
                </div>
                <p className="mt-3 select-all rounded bg-white p-3 text-center font-mono text-2xl font-semibold tracking-[0.25em] text-gray-900">
                  {codePanel.code}
                </p>
                <p className="mt-2 text-xs text-blue-800">
                  {codePanel.deviceName}
                </p>
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
                    className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
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
                                : device.hasPendingCode
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {device.isActive
                              ? 'Paired'
                              : device.hasPendingCode
                                ? 'Unpaired'
                                : 'Revoked'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {device.station.name} · {device.platform}
                          {device.appVersion ? ` · v${device.appVersion}` : ''}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {device.pairedAt
                            ? `Paired ${relativeTime(device.pairedAt)}`
                            : 'Never paired'}
                          {device.deviceModel ? ` · ${device.deviceModel}` : ''}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Last seen {relativeTime(device.lastSeenAt)} · last
                          print {relativeTime(device.lastPrintAt)}
                        </p>
                      </div>
                      {device.isActive ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          onClick={() => setRevokeTarget(device)}
                        >
                          <ShieldOff className="mr-1 h-3.5 w-3.5" />
                          Revoke
                        </Button>
                      ) : (
                        <div className="flex shrink-0 items-center gap-2">
                          {device.hasPendingCode && (
                            <Button
                              variant="outline"
                              size="sm"
                              loading={codeBusyId === device.id}
                              onClick={() => void revealCode(device)}
                            >
                              <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                              Show code
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            loading={codeBusyId === device.id}
                            onClick={() => void createCode(device)}
                          >
                            {device.hasPendingCode ? 'New code' : 'Create code'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <ConfirmationModal
          isOpen={!!revokeTarget}
          title="Revoke device?"
          message={
            revokeTarget
              ? `Revoke "${revokeTarget.name}"? The tablet stops working until you create a new pairing code.`
              : ''
          }
          onConfirm={() => void revokeDevice()}
          onCancel={() => setRevokeTarget(null)}
          isLoading={revoking}
          variant="danger"
          confirmText="Revoke device"
        />
      </div>
    </div>
  );
}
