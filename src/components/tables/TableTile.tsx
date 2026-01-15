import React from 'react';
import { Users, Utensils, Clock, Trash2 } from 'lucide-react';

import { type Table } from '@/lib/hooks/queries/useTables';

export interface TableTileProps {
  table: Table;
  onClick: () => void;
  onToggleActive?: (
    table: TableTileProps['table'],
    e: React.MouseEvent
  ) => void;
  onDelete?: (table: TableTileProps['table'], e: React.MouseEvent) => void;
}

export function TableTile({
  table,
  onClick,
  onToggleActive,
  onDelete,
}: TableTileProps) {
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
  const isOccupied = table.status === 'OCCUPIED';
  const isReserved = table.status === 'RESERVED';
  const isInactive = table.status === 'INACTIVE';

  let borderClass = 'border-transparent';
  if (isOccupied) borderClass = 'border-amber-500 border-2';
  if (isReserved) borderClass = 'border-blue-500 border-2';
  if (isInactive) borderClass = 'border-gray-300 border-2';

  return (
    <div
      onClick={onClick}
      className={`
        group relative aspect-square w-full rounded-2xl p-4 flex flex-col justify-between
        bg-white shadow-sm hover:shadow-md transition-all active:scale-95 cursor-pointer
        ${borderClass}
        ${isInactive ? 'opacity-50 grayscale' : ''}
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
        {isInactive && (
          <span className="relative inline-flex rounded-full h-3 w-3 bg-gray-400 ring-2 ring-gray-200"></span>
        )}
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
        ) : isInactive ? (
          <div className="flex items-center text-gray-500 font-bold text-xs bg-gray-100 px-3 py-1 rounded-full">
            <span>⊘ INACTIVE</span>
          </div>
        ) : (
          <div className="flex items-center text-gray-400 font-bold text-xs group-hover:text-gray-600 transition-colors">
            <Users className="w-4 h-4 mr-1.5" />
            <span>{table.capacity} Guests</span>
          </div>
        )}
      </div>

      {/* Action Buttons - Only show if handlers provided */}
      {(onToggleActive || onDelete) && (
        <div
          className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Toggle Active/Inactive */}
          {onToggleActive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleActive(table, e);
              }}
              className={`flex-1 p-1.5 rounded-lg transition-colors text-xs font-medium ${
                isInactive
                  ? 'bg-green-50 text-green-600 hover:bg-green-100'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
              title={isInactive ? 'Activate table' : 'Deactivate table'}
            >
              {isInactive ? '✓ Activate' : '⊘ Deactivate'}
            </button>
          )}

          {/* Delete Button */}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(table, e);
              }}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete table"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
