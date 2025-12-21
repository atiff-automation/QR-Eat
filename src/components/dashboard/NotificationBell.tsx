'use client';

import { useState } from 'react';
import { Bell, Key } from 'lucide-react';
import { PasswordResetModal } from './PasswordResetModal';
import {
  useNotifications,
  useMarkNotificationAsRead,
  useResetStaffPassword,
} from '@/lib/hooks/queries/useNotifications';

export function NotificationBell() {
  // TanStack Query hooks (replaces manual state management)
  const { notifications } = useNotifications();
  const { mutate: markAsRead } = useMarkNotificationAsRead();
  const { mutate: resetPassword, isPending: isResetting } =
    useResetStaffPassword();

  // Local UI state
  const [showDropdown, setShowDropdown] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordResetData, setPasswordResetData] = useState<{
    staffName: string;
    staffEmail: string;
    temporaryPassword: string;
  } | null>(null);

  const handleMarkAsRead = (notificationId: string) => {
    markAsRead(notificationId);
  };

  const handlePasswordReset = (staffId: string, notificationId: string) => {
    resetPassword(
      { staffId, notificationId },
      {
        onSuccess: (data) => {
          if (data.temporaryPassword) {
            setPasswordResetData({
              staffName: data.staffName,
              staffEmail: data.staffEmail,
              temporaryPassword: data.temporaryPassword,
            });
            setShowPasswordModal(true);
            setShowDropdown(false);
          } else {
            alert(
              `Password reset for ${data.staffName}. Check dashboard for details.`
            );
          }
        },
        onError: (error) => {
          alert(error.message || 'Failed to reset password. Please try again.');
        },
      }
    );
  };

  // Calculate actual unread count (excluding completed)
  const actualUnreadCount = notifications.filter(
    (n) => !n.isRead && !(n.metadata as Record<string, unknown>)?.completed
  ).length;

  const getNotificationIcon = (
    type: string,
    metadata?: Record<string, unknown>
  ) => {
    if (metadata?.action === 'password_reset_request') {
      if (metadata?.completed) {
        return <Key className="h-4 w-4 text-green-500" />;
      }
      return <Key className="h-4 w-4 text-orange-500" />;
    }
    return <Bell className="h-4 w-4 text-blue-500" />;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 text-gray-600 hover:text-gray-800 focus:outline-none"
      >
        <Bell className="h-6 w-6" />
        {actualUnreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {actualUnreadCount > 9 ? '9+' : actualUnreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg border border-gray-200 z-50">
          <div className="py-2">
            <div className="px-4 py-2 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">
                Notifications
              </h3>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-500 text-center">
                  No notifications
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`px-4 py-3 border-b border-gray-100 ${
                      !notification.isRead &&
                      !(notification.metadata as Record<string, unknown>)
                        ?.completed
                        ? 'bg-blue-50'
                        : (notification.metadata as Record<string, unknown>)
                              ?.completed
                          ? 'bg-green-50'
                          : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      {getNotificationIcon(
                        notification.type,
                        notification.metadata
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {notification.title}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(notification.createdAt).toLocaleString()}
                        </p>

                        {notification.metadata?.action ===
                          'password_reset_request' && (
                          <div className="mt-2 flex space-x-2">
                            {notification.metadata?.completed ? (
                              <div className="flex items-center space-x-2">
                                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs rounded">
                                  ✓ Password Reset Completed
                                </span>
                                <span className="text-xs text-gray-500">
                                  {new Date(
                                    notification.metadata.completedAt
                                  ).toLocaleString()}
                                </span>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() =>
                                    handlePasswordReset(
                                      notification.metadata.staffId,
                                      notification.id
                                    )
                                  }
                                  disabled={isResetting}
                                  className="px-3 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 disabled:opacity-50"
                                >
                                  {isResetting
                                    ? 'Resetting...'
                                    : 'Reset Password'}
                                </button>
                                <button
                                  onClick={() =>
                                    handleMarkAsRead(notification.id)
                                  }
                                  className="px-3 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400"
                                >
                                  Mark Read
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {!notification.isRead &&
                        !(notification.metadata as Record<string, unknown>)
                          ?.completed && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {notifications.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-200">
                <button
                  onClick={() => setShowDropdown(false)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {passwordResetData && (
        <PasswordResetModal
          isOpen={showPasswordModal}
          onClose={() => {
            setShowPasswordModal(false);
            setPasswordResetData(null);
          }}
          staffName={passwordResetData.staffName}
          staffEmail={passwordResetData.staffEmail}
          temporaryPassword={passwordResetData.temporaryPassword}
        />
      )}
    </div>
  );
}
