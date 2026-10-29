import { OrdersOverview } from '@/components/dashboard/OrdersOverview';

const STATUS_VALUES = new Set(['ACTIVE', 'SERVED', 'CANCELLED', 'ALL']);
const TIME_VALUES = new Set(['today', 'week', 'all_time']);

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawStatus = Array.isArray(params.status)
    ? params.status[0]
    : params.status;
  const rawTime = Array.isArray(params.time) ? params.time[0] : params.time;
  const status =
    rawStatus && STATUS_VALUES.has(rawStatus.toUpperCase())
      ? (rawStatus.toUpperCase() as 'ACTIVE' | 'SERVED' | 'CANCELLED' | 'ALL')
      : 'ACTIVE';
  const time =
    rawTime && TIME_VALUES.has(rawTime)
      ? (rawTime as 'today' | 'week' | 'all_time')
      : 'today';

  return (
    <div className="p-2 md:p-6">
      <OrdersOverview initialStatus={status} initialTimeFilter={time} />
    </div>
  );
}
