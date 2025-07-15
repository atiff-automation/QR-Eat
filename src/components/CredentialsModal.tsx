'use client';

import { useState } from 'react';
import { X, Copy, Check, AlertTriangle, User, Lock } from 'lucide-react';

interface CredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  credentials: {
    username: string;
    password: string;
  };
  staffName: string;
}

export default function CredentialsModal({ 
  isOpen, 
  onClose, 
  credentials, 
  staffName 
}: CredentialsModalProps) {
  const [copiedUsername, setCopiedUsername] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const handleCopyUsername = async () => {
    try {
      await navigator.clipboard.writeText(credentials.username);
      setCopiedUsername(true);
      setTimeout(() => setCopiedUsername(false), 2000);
    } catch (err) {
      // Silent fail for security - don't log clipboard errors
    }
  };

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(credentials.password);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    } catch (err) {
      // Silent fail for security - don't log clipboard errors
    }
  };

  const handleCopyBoth = async () => {
    try {
      const credentials_text = `Username: ${credentials.username}\nPassword: ${credentials.password}`;
      await navigator.clipboard.writeText(credentials_text);
      setCopiedUsername(true);
      setCopiedPassword(true);
      setTimeout(() => {
        setCopiedUsername(false);
        setCopiedPassword(false);
      }, 2000);
    } catch (err) {
      // Silent fail for security - don't log clipboard errors
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Staff Credentials Created
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">
            Staff member <span className="font-medium">{staffName}</span> has been created successfully.
          </p>
          <p className="text-sm text-gray-600">
            Please share these credentials securely with the staff member:
          </p>
        </div>

        {/* Security Warning */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium mb-1">Security Notice:</p>
              <ul className="text-xs space-y-1">
                <li>• Share these credentials securely with the staff member</li>
                <li>• Staff must change password on first login</li>
                <li>• Do not share credentials via unsecured channels</li>
                <li>• These credentials will not be shown again</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Credentials Display */}
        <div className="space-y-3 mb-6">
          {/* Username */}
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Username:</span>
              </div>
              <button
                onClick={handleCopyUsername}
                className="text-blue-600 hover:text-blue-800 transition-colors"
                title="Copy username"
              >
                {copiedUsername ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-lg font-mono font-bold text-gray-900 mt-1 break-all">
              {credentials.username}
            </p>
          </div>

          {/* Password */}
          <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Lock className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Password:</span>
              </div>
              <button
                onClick={handleCopyPassword}
                className="text-blue-600 hover:text-blue-800 transition-colors"
                title="Copy password"
              >
                {copiedPassword ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-lg font-mono font-bold text-gray-900 mt-1 break-all">
              {credentials.password}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <button
            onClick={handleCopyBoth}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium text-sm"
          >
            Copy Both Credentials
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 transition-colors font-medium text-sm"
          >
            Done
          </button>
        </div>

        {/* Additional Info */}
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-xs text-blue-800">
            <span className="font-medium">Next Steps:</span> The staff member should login using these credentials and will be prompted to create a new password before accessing the dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}