'use client';

import { useState, useEffect } from 'react';
import { Bell, X, Key, Users } from 'lucide-react';
import { PasswordResetModal } from './PasswordResetModal';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  metadata?: any;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordResetData, setPasswordResetData] = useState<{
    staffName: string;
    staffEmail: string;
    temporaryPassword: string;
  } | null>(null);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications');
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: true })
      });
      
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
      );
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handlePasswordReset = async (staffId: string, notificationId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/owner/staff/${staffId}/reset-password`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Update the specific notification in state instead of refetching all
        setNotifications(prev => prev.map(notification => {
          if (notification.id === notificationId) {
            return {
              ...notification,
              isRead: true,
              metadata: {
                ...(notification.metadata as any),
                completed: true,
                completedAt: new Date().toISOString()
              }
            };
          }
          return notification;
        }));
        
        // Show password reset modal with new password
        if (data.temporaryPassword) {
          setPasswordResetData({
            staffName: data.staffName,
            staffEmail: data.staffEmail,
            temporaryPassword: data.temporaryPassword
          });
          setShowPasswordModal(true);
          setShowDropdown(false); // Close the notification dropdown
        } else {
          alert(`Password reset for ${data.staffName}. Check dashboard for details.`);
        }
      } else {
        const error = await response.json();
        alert(`Failed to reset password: ${error.error}`);
      }
    } catch (error) {
      console.error('Failed to reset password:', error);
      alert('Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const unreadCount = notifications.filter(n => 
    !n.isRead && !(n.metadata as any)?.completed
  ).length;

  const getNotificationIcon = (type: string, metadata?: any) => {
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
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg border border-gray-200 z-50">
          <div className="py-2">
            <div className="px-4 py-2 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">Notifications</h3>
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
                      !notification.isRead && !(notification.metadata as any)?.completed 
                        ? 'bg-blue-50' 
                        : (notification.metadata as any)?.completed 
                          ? 'bg-green-50' 
                          : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      {getNotificationIcon(notification.type, notification.metadata)}
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
                        
                        {notification.metadata?.action === 'password_reset_request' && (
                          <div className="mt-2 flex space-x-2">
                            {notification.metadata?.completed ? (
                              <div className="flex items-center space-x-2">
                                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs rounded">
                                  ✓ Password Reset Completed
                                </span>
                                <span className="text-xs text-gray-500">
                                  {new Date(notification.metadata.completedAt).toLocaleString()}
                                </span>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => handlePasswordReset(
                                    notification.metadata.staffId,
                                    notification.id
                                  )}
                                  disabled={loading}
                                  className="px-3 py-1 bg-orange-600 text-white text-xs rounded hover:bg-orange-700 disabled:opacity-50"
                                >
                                  {loading ? 'Resetting...' : 'Reset Password'}
                                </button>
                                <button
                                  onClick={() => markAsRead(notification.id)}
                                  className="px-3 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400"
                                >
                                  Mark Read
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {!notification.isRead && !(notification.metadata as any)?.completed && (
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