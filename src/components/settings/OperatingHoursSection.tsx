/**
 * Operating Hours Settings Section
 * Timezone and weekly schedule with accordion-style UI
 */

'use client';

import { useState, useEffect } from 'react';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { TIMEZONE_DISPLAY_NAME } from '@/lib/constants';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronRight,
  Trash2,
} from 'lucide-react';

interface TimeSlot {
  open: string;
  close: string;
}

interface DaySchedule {
  isOpen: boolean;
  slots: TimeSlot[];
}

interface OperatingHours {
  monday: DaySchedule;
  tuesday: DaySchedule;
  wednesday: DaySchedule;
  thursday: DaySchedule;
  friday: DaySchedule;
  saturday: DaySchedule;
  sunday: DaySchedule;
}

interface OperatingHoursData {
  operatingHours: OperatingHours;
}

interface OperatingHoursSectionProps {
  initialData: OperatingHoursData;
  onUpdate: () => void;
}

const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const DAY_LABELS: Record<(typeof DAYS)[number], string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

// Helper function to ensure operating hours data has the correct structure
const normalizeOperatingHours = (
  data: OperatingHoursData
): OperatingHoursData => {
  const defaultSchedule: DaySchedule = {
    isOpen: true,
    slots: [{ open: '09:00', close: '17:00' }],
  };

  const normalizedHours: OperatingHours = {
    monday: defaultSchedule,
    tuesday: defaultSchedule,
    wednesday: defaultSchedule,
    thursday: defaultSchedule,
    friday: defaultSchedule,
    saturday: defaultSchedule,
    sunday: { isOpen: false, slots: [] },
  };

  // If operatingHours exists, normalize it
  if (data.operatingHours) {
    DAYS.forEach((day) => {
      const dayData = data.operatingHours[day];

      // Handle frontend format: {isOpen, slots}
      if (
        dayData &&
        typeof dayData.isOpen === 'boolean' &&
        Array.isArray(dayData.slots)
      ) {
        normalizedHours[day] = dayData;
      }
      // Handle backend format: TimeSlot[] array
      else if (Array.isArray(dayData)) {
        normalizedHours[day] = {
          isOpen: dayData.length > 0, // If has slots, it's open
          slots: dayData,
        };
      }
    });
  }

  return {
    operatingHours: normalizedHours,
  };
};

// Helper to format time slots for display
const formatTimeSlots = (slots: TimeSlot[]): string => {
  if (slots.length === 0) return '';
  if (slots.length === 1) {
    return `${formatTime(slots[0].open)} - ${formatTime(slots[0].close)}`;
  }
  return `${slots.length} time slots`;
};

const formatTime = (time: string): string => {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:${minutes} ${ampm}`;
};

export function OperatingHoursSection({
  initialData,
  onUpdate,
}: OperatingHoursSectionProps) {
  const [formData, setFormData] = useState<OperatingHoursData>(
    normalizeOperatingHours(initialData)
  );
  const [expandedDay, setExpandedDay] = useState<(typeof DAYS)[number] | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Update formData when initialData changes (e.g., after save)
  useEffect(() => {
    setFormData(normalizeOperatingHours(initialData));
  }, [initialData]);

  const hasChanges =
    JSON.stringify(formData) !==
    JSON.stringify(normalizeOperatingHours(initialData));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    setIsLoading(true);

    try {
      // Transform data to match backend schema
      // Backend expects: { monday: TimeSlot[], tuesday: TimeSlot[], ... }
      // Frontend has: { monday: {isOpen, slots}, tuesday: {isOpen, slots}, ... }
      const transformedHours: Record<
        string,
        { open: string; close: string }[]
      > = {};

      DAYS.forEach((day) => {
        const daySchedule = formData.operatingHours[day];
        // Only include slots if day is open, otherwise send empty array
        transformedHours[day] = daySchedule.isOpen ? daySchedule.slots : [];
      });

      const payload = {
        operatingHours: transformedHours,
      };

      // Send only operating hours - backend sets timezone
      await ApiClient.put('/settings/restaurant/hours', payload);
      setSuccess('Operating hours updated successfully!');
      onUpdate();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Failed to update operating hours:', error);
      setError(
        error instanceof ApiClientError
          ? error.message
          : 'Failed to update settings. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const addTimeSlot = (day: (typeof DAYS)[number]) => {
    setFormData((prev) => ({
      ...prev,
      operatingHours: {
        ...prev.operatingHours,
        [day]: {
          ...prev.operatingHours[day],
          slots: [
            ...prev.operatingHours[day].slots,
            { open: '09:00', close: '17:00' },
          ],
        },
      },
    }));
  };

  const removeTimeSlot = (day: (typeof DAYS)[number], index: number) => {
    setFormData((prev) => ({
      ...prev,
      operatingHours: {
        ...prev.operatingHours,
        [day]: {
          ...prev.operatingHours[day],
          slots: prev.operatingHours[day].slots.filter((_, i) => i !== index),
        },
      },
    }));
  };

  const updateTimeSlot = (
    day: (typeof DAYS)[number],
    index: number,
    field: 'open' | 'close',
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      operatingHours: {
        ...prev.operatingHours,
        [day]: {
          ...prev.operatingHours[day],
          slots: prev.operatingHours[day].slots.map((slot, i) =>
            i === index ? { ...slot, [field]: value } : slot
          ),
        },
      },
    }));
  };

  const toggleDay = (day: (typeof DAYS)[number]) => {
    setFormData((prev) => {
      const currentDay = prev.operatingHours[day];
      const newIsOpen = !currentDay.isOpen;

      // If toggling ON and no slots exist, add a default slot
      const newSlots =
        newIsOpen && currentDay.slots.length === 0
          ? [{ open: '09:00', close: '17:00' }]
          : currentDay.slots;

      return {
        ...prev,
        operatingHours: {
          ...prev.operatingHours,
          [day]: {
            isOpen: newIsOpen,
            slots: newSlots,
          },
        },
      };
    });
  };

  const toggleExpanded = (day: (typeof DAYS)[number]) => {
    setExpandedDay(expandedDay === day ? null : day);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-5">
        <Clock className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-bold text-gray-900">Operating Hours</h2>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2 border border-red-100">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 text-green-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2 border border-green-100">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Read-only Timezone Display */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <label className="block text-xs font-medium text-blue-700 mb-1.5">
            Timezone (Read-only)
          </label>
          <div className="flex items-center gap-2">
            <span className="font-medium text-blue-900 text-base">
              {TIMEZONE_DISPLAY_NAME}
            </span>
            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
              Fixed for MVP
            </span>
          </div>
        </div>

        {/* Weekly Schedule - Accordion List */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {DAYS.map((day, index) => {
            const isExpanded = expandedDay === day;
            const daySchedule = formData.operatingHours[day];

            return (
              <div key={day}>
                {/* Day Row */}
                <div
                  className={`flex items-center gap-3 px-4 py-3 ${
                    index !== DAYS.length - 1 && !isExpanded
                      ? 'border-b border-gray-200'
                      : ''
                  }`}
                >
                  {/* Toggle Switch */}
                  <button
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      daySchedule.isOpen ? 'bg-blue-500' : 'bg-gray-300'
                    }`}
                    disabled={isLoading}
                  >
                    <span
                      className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        daySchedule.isOpen ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>

                  {/* Day Name */}
                  <span className="font-medium text-gray-900 flex-shrink-0">
                    {DAY_LABELS[day]}
                  </span>

                  {/* Hours Summary */}
                  <span className="flex-1 text-right text-gray-600 text-sm">
                    {daySchedule.isOpen
                      ? formatTimeSlots(daySchedule.slots)
                      : 'Closed'}
                  </span>

                  {/* Expand/Collapse Button */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(day)}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    disabled={isLoading}
                  >
                    <ChevronRight
                      className={`h-5 w-5 transition-transform duration-200 ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    />
                  </button>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div
                    className={`px-4 pb-4 pt-2 bg-gray-50 space-y-3 ${
                      index !== DAYS.length - 1
                        ? 'border-b border-gray-200'
                        : ''
                    }`}
                  >
                    {daySchedule.isOpen ? (
                      <>
                        {/* Time Slots */}
                        {daySchedule.slots.map((slot, slotIndex) => (
                          <div
                            key={slotIndex}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="time"
                              value={slot.open}
                              onChange={(e) =>
                                updateTimeSlot(
                                  day,
                                  slotIndex,
                                  'open',
                                  e.target.value
                                )
                              }
                              className="flex-1 px-3 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
                              disabled={isLoading}
                            />
                            <span className="text-gray-500 font-medium">-</span>
                            <input
                              type="time"
                              value={slot.close}
                              onChange={(e) =>
                                updateTimeSlot(
                                  day,
                                  slotIndex,
                                  'close',
                                  e.target.value
                                )
                              }
                              className="flex-1 px-3 py-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
                              disabled={isLoading}
                            />
                            {daySchedule.slots.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeTimeSlot(day, slotIndex)}
                                className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                disabled={isLoading}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ))}

                        {/* Add Break Button */}
                        <button
                          type="button"
                          onClick={() => addTimeSlot(day)}
                          className="w-full py-2.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-medium text-sm transition-colors"
                          disabled={isLoading}
                        >
                          + Add Break
                        </button>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500 text-center py-2">
                        This day is marked as closed
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Save Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading || !hasChanges}
            className="w-full md:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
