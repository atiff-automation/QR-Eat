'use client';

import { useState } from 'react';
import { X, Copy, Check, Eye, EyeOff } from 'lucide-react';

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffName: string;
  staffEmail: string;
  temporaryPassword: string;
}

export function PasswordResetModal({ 
  isOpen, 
  onClose, 
  staffName, 
  staffEmail, 
  temporaryPassword 
}: PasswordResetModalProps) {
  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy password:', error);
      // Fallback: select the text
      const passwordElement = document.getElementById('temp-password');
      if (passwordElement) {
        passwordElement.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Password Reset Successful
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4">
          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <Check className="h-5 w-5 text-green-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">
                  Password reset successfully!
                </h3>
                <p className="mt-1 text-sm text-green-700">
                  New temporary password has been generated for <strong>{staffName}</strong>.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Staff Member
            </label>
            <div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
              {staffName} ({staffEmail})
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Temporary Password
            </label>
            <div className="flex items-center space-x-2">
              <div className="flex-1 relative">
                <input
                  id="temp-password"
                  type={showPassword ? 'text' : 'password'}
                  value={temporaryPassword}
                  readOnly
                  className="w-full p-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <button
                onClick={handleCopy}
                className={`px-3 py-2 border border-gray-300 rounded-md text-sm font-medium transition-colors ${
                  copied 
                    ? 'bg-green-100 text-green-700 border-green-300' 
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 inline mr-1" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 inline mr-1" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <div className="text-sm text-yellow-800">
              <strong>Next Steps:</strong>
              <ul className="mt-1 list-disc list-inside space-y-1">
                <li>Share this temporary password with {staffName}</li>
                <li>They must change it when they log in</li>
                <li>The password is only temporary and expires after first use</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white text-sm font-medium rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}