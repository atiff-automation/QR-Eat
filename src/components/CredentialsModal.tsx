'use client';

import { useState } from 'react';
import { Copy, Check, Lock, Share2, Mail } from 'lucide-react';

interface CredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  credentials: {
    username: string;
    password: string;
  };
  staffName: string;
  staffEmail: string;
}

export default function CredentialsModal({
  isOpen,
  onClose,
  credentials,
  staffName,
  staffEmail,
}: CredentialsModalProps) {
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [sharing, setSharing] = useState(false);

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(credentials.password);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    } catch {
      // Silent fail
    }
  };

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(staffEmail);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      // Silent fail
    }
  };

  const handleShare = async () => {
    // WhatsApp-optimized format: clean, simple, mobile-friendly
    const shareText = `Hi ${staffName}! 👋

Your Tabtep account is ready!

*Login Details:*
📧 Email: ${staffEmail}
🔑 Password: ${credentials.password}

*Next Steps:*
1. Login at: ${window.location.origin}/login
2. You'll be asked to change your password
3. Start using the dashboard!

Welcome to the team! 🎉`;

    try {
      setSharing(true);

      // Check if Web Share API is available
      if (navigator.share) {
        await navigator.share({
          title: 'Tabtep Login Credentials',
          text: shareText,
        });
      } else {
        // Fallback: Copy to clipboard
        await navigator.clipboard.writeText(shareText);
        alert(
          'Credentials copied to clipboard! You can now paste and send them.'
        );
      }
    } catch (err) {
      // User cancelled or error occurred
      if (err instanceof Error && err.name !== 'AbortError') {
        // Fallback to clipboard
        try {
          await navigator.clipboard.writeText(shareText);
          alert('Credentials copied to clipboard!');
        } catch {
          alert('Unable to share. Please copy the credentials manually.');
        }
      }
    } finally {
      setSharing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl animate-scale-in overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <h3 className="font-bold text-gray-900">Staff Created</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
          >
            <div className="w-5 h-5 flex items-center justify-center">✕</div>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Staff Name */}
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">{staffName}</span> has
            been created successfully.
          </p>

          {/* Email Display */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Email</span>
              </div>
              <button
                onClick={handleCopyEmail}
                className="text-blue-600 hover:text-blue-800 transition-colors"
                title="Copy email"
              >
                {copiedEmail ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-base font-medium text-gray-900 break-all">
              {staffEmail}
            </p>
          </div>

          {/* Password Display */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  Password
                </span>
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
            <p className="text-xl font-mono font-bold text-gray-900 break-all">
              {credentials.password}
            </p>
          </div>

          {/* Simple Notice */}
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              Staff must change this password on first login.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleShare}
              disabled={sharing}
              className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <Share2 className="h-4 w-4" />
              {sharing ? 'Sharing...' : 'Share'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-all"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
