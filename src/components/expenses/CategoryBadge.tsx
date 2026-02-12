import React from 'react';

interface CategoryBadgeProps {
  categoryName: string;
  categoryType: 'COGS' | 'OPERATING' | 'OTHER';
  isSystem?: boolean;
}

const typeColors = {
  COGS: 'bg-orange-500',
  OPERATING: 'bg-blue-500',
  OTHER: 'bg-gray-400',
};

export function CategoryBadge({
  categoryName,
  categoryType,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isSystem = false,
}: CategoryBadgeProps) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${typeColors[categoryType]}`}
      />
      <span className="text-sm text-gray-800">{categoryName}</span>
    </div>
  );
}
