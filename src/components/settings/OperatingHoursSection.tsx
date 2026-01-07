/**
 * Operating Hours Settings Section
 * Timezone and weekly schedule
 */

'use client';

import { useState } from 'react';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { AlertTriangle, CheckCircle, Clock, Plus, X } from 'lucide-react';

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
  timezone: string;
  operatingHours: OperatingHours;
}

interface OperatingHoursSectionProps {
  initialData: OperatingHoursData;
  onUpdate: () => void;
}

const TIMEZONES = [
  'Asia/Kuala_Lumpur',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Manila',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
];

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

export function OperatingHoursSection({
  initialData,
  onUpdate,
}: OperatingHoursSectionProps) {
  const [formData, setFormData] = useState<OperatingHoursData>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const hasChanges = JSON.stringify(formData) !== JSON.stringify(initialData);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    setIsLoading(true);

    try {
      await ApiClient.put('/settings/restaurant/hours', formData);
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
    setFormData((prev) => ({
      ...prev,
      operatingHours: {
        ...prev.operatingHours,
        [day]: {
          ...prev.operatingHours[day],
          isOpen: !prev.operatingHours[day].isOpen,
        },
      },
    }));
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
        <div>
          <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
            Timezone *
          </label>
          <select
            required
            value={formData.timezone}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, timezone: e.target.value }))
            }
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
            disabled={isLoading}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-semibold uppercase text-gray-500">
            Weekly Schedule
          </label>

          {DAYS.map((day) => (
            <div
              key={day}
              className="border border-gray-200 rounded-lg p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      formData.operatingHours[day].isOpen
                        ? 'bg-green-500'
                        : 'bg-gray-200'
                    }`}
                    disabled={isLoading}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        formData.operatingHours[day].isOpen
                          ? 'translate-x-5'
                          : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className="font-medium text-gray-900">
                    {DAY_LABELS[day]}
                  </span>
                </div>

                {formData.operatingHours[day].isOpen && (
                  <button
                    type="button"
                    onClick={() => addTimeSlot(day)}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1"
                    disabled={isLoading}
                  >
                    <Plus className="h-4 w-4" />
                    Add Slot
                  </button>
                )}
              </div>

              {formData.operatingHours[day].isOpen &&
                formData.operatingHours[day].slots.map((slot, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="time"
                      value={slot.open}
                      onChange={(e) =>
                        updateTimeSlot(day, index, 'open', e.target.value)
                      }
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
                      disabled={isLoading}
                    />
                    <span className="text-gray-500">-</span>
                    <input
                      type="time"
                      value={slot.close}
                      onChange={(e) =>
                        updateTimeSlot(day, index, 'close', e.target.value)
                      }
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-medium text-gray-900"
                      disabled={isLoading}
                    />
                    {formData.operatingHours[day].slots.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTimeSlot(day, index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        disabled={isLoading}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}

              {!formData.operatingHours[day].isOpen && (
                <p className="text-sm text-gray-500">Closed</p>
              )}
            </div>
          ))}
        </div>

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
