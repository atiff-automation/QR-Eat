'use client';

import { WifiOff, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export function OfflineView() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                <WifiOff className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    Connection Lost
                </h1>
                <p className="text-gray-600 mb-6">
                    You&apos;re currently offline. You can still view cached data, but some
                    features are unavailable.
                </p>

                <div className="bg-blue-50 rounded-lg p-4 mb-6 text-left">
                    <h3 className="font-semibold text-gray-900 mb-2">
                        Available Offline:
                    </h3>
                    <ul className="text-sm text-gray-700 space-y-1">
                        <li>✓ View recent orders</li>
                        <li>✓ Browse menu items</li>
                        <li>✓ Check restaurant settings</li>
                    </ul>
                </div>

                <div className="space-y-3">
                    <button
                        onClick={() => window.location.reload()}
                        className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md transition w-full justify-center"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Retry Connection
                    </button>
                    <Link
                        href="/dashboard"
                        className="inline-block text-blue-600 hover:text-blue-700 text-sm"
                    >
                        Return to Dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
}
