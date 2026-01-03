import React from 'react';
import { Users, Utensils, Clock } from 'lucide-react';

export interface TableTileProps {
  table: {
    id: string;
    tableNumber: string;
    status: string;
    capacity: number;
    currentOrders?: number;
    lastOrderAt?: string;
  };
  onClick: () => void;
}

export function TableTile({ table, onClick }: TableTileProps) {
  // calculate duration
  const getDuration = () => {
    if (!table.lastOrderAt) return null;
    const diff = Date.now() - new Date(table.lastOrderAt).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  const duration = getDuration();

  // Status visual logic
  // "Available" = Clean, no border, no dot
  // "Occupied" = Orange Border, Orange Pulse
  // "Reserved" = Blue Border, Blue Dot
  const isOccupied = table.status === 'occupied';
  const isReserved = table.status === 'reserved';

  let borderClass = 'border-transparent';
  if (isOccupied) borderClass = 'border-amber-500 border-2';
  if (isReserved) borderClass = 'border-blue-500 border-2';

  return (
    <button
      onClick={onClick}
      className={`
        group relative aspect-square w-full rounded-2xl p-4 flex flex-col justify-between
        bg-white shadow-sm hover:shadow-md transition-all active:scale-95
        ${borderClass}
      `}
    >
      {/* Top Right: Status Signal */}
      <div className="absolute top-3 right-3">
        {isOccupied && (
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
          </div>
        )}
        {isReserved && (
          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500 ring-2 ring-blue-100"></span>
        )}
        {/* Available has no dot */}
      </div>

      {/* Center: Hero Number */}
      <div className="flex-1 flex flex-col items-center justify-center -mt-4">
        <span className="text-6xl font-black text-gray-900 tracking-tighter shadow-gray-200">
          {table.tableNumber.replace(/^T-?/, '')}
        </span>
      </div>

      {/* Footer: Stats */}
      <div className="w-full flex items-center justify-center pb-2">
        {isOccupied ? (
          <div className="flex flex-col items-center space-y-1.5">
            <div className="flex items-center space-x-2 text-amber-600 font-bold text-xs bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
              <Utensils className="w-3.5 h-3.5" />
              <span>{table.currentOrders || 0} Items Pending</span>
            </div>
            <div className="text-xs text-gray-500 font-semibold flex items-center">
              <Clock className="w-3.5 h-3.5 mr-1" />
              {duration || '0m'}
            </div>
          </div>
        ) : isReserved ? (
          <div className="flex items-center text-blue-600 font-bold text-xs bg-blue-50 px-3 py-1 rounded-full">
            <span className="mr-1">Reserved</span>
          </div>
        ) : (
          <div className="flex items-center text-gray-400 font-bold text-xs group-hover:text-gray-600 transition-colors">
            <Users className="w-4 h-4 mr-1.5" />
            <span>{table.capacity} Guests</span>
          </div>
        )}
      </div>
    </button>
  );
}
