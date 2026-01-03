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
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-700 ring-1 ring-green-200';
      case 'occupied':
        return 'bg-amber-100 text-amber-700 ring-1 ring-amber-200';
      case 'reserved':
        return 'bg-blue-100 text-blue-700 ring-1 ring-blue-200';
      default:
        return 'bg-gray-100 text-gray-600 ring-1 ring-gray-200';
    }
  };

  // Calculate duration if lastOrderAt is present
  const getDuration = () => {
    if (!table.lastOrderAt) return null;
    const diff = Date.now() - new Date(table.lastOrderAt).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} m`;
    const hours = Math.floor(minutes / 60);
    return `${hours} h`;
  };

  const duration = getDuration();

  return (
    <button
      onClick={onClick}
      className={`
        relative aspect - square w - full rounded - xl p - 3 flex flex - col justify - between
transition - all active: scale - 95 border border - transparent
        ${
          table.status === 'occupied'
            ? 'bg-white shadow-sm ring-1 ring-gray-100'
            : 'bg-white/60 hover:bg-white ring-1 ring-gray-100'
        }
`}
    >
      {/* Header: Status Pill */}
      <div className="flex justify-between items-start w-full">
        <span
          className={`
px - 2 py - 0.5 rounded - md text - [10px] font - bold uppercase tracking - wide
          ${getStatusStyle(table.status)}
`}
        >
          {table.status}
        </span>

        {/* Active Orders Badge */}
        {table.status === 'occupied' && (table.currentOrders || 0) > 0 && (
          <span className="flex items-center justify-center bg-amber-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            <Utensils className="w-2.5 h-2.5 mr-0.5" />
            {table.currentOrders}
          </span>
        )}
      </div>

      {/* Center: Table Number */}
      <div className="flex-1 flex items-center justify-center">
        <span className="text-2xl font-bold text-gray-900 tracking-tighter">
          {table.tableNumber.startsWith('T') || table.tableNumber.length > 3
            ? table.tableNumber
            : `T${table.tableNumber} `}
        </span>
      </div>

      {/* Footer: Stats */}
      <div className="flex items-center justify-center text-gray-400 font-medium text-xs">
        {table.status === 'occupied' && duration ? (
          <div className="flex items-center text-gray-600">
            <Clock className="w-3.5 h-3.5 mr-1" />
            {duration}
          </div>
        ) : (
          <div className="flex items-center">
            <Users className="w-3.5 h-3.5 mr-1" />
            {table.capacity}
          </div>
        )}
      </div>
    </button>
  );
}
