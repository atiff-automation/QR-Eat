import React from 'react';

interface CategoryBadgeProps {
  categoryName: string;
  categoryType: 'COGS' | 'OPERATING' | 'OTHER';
  isSystem?: boolean;
}

const typeColors = {
  COGS: 'bg-orange-100 text-orange-700 border-orange-200',
  OPERATING: 'bg-blue-100 text-blue-700 border-blue-200',
  OTHER: 'bg-gray-100 text-gray-700 border-gray-200',
};

export function CategoryBadge({
  categoryName,
  categoryType,
  isSystem = false,
}: CategoryBadgeProps) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${typeColors[categoryType]}`}
      >
        {categoryName}
      </span>
      {isSystem && <span className="text-xs text-gray-500">(System)</span>}
    </div>
  );
}
