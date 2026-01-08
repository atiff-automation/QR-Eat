/**
 * 404 Not Found Page for Receipts
 *
 * Displayed when receipt is not found or invalid
 */

import Link from 'next/link';
import { FileX } from 'lucide-react';

export default function ReceiptNotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <FileX className="w-20 h-20 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Receipt Not Found
          </h1>
          <p className="text-gray-600">
            The receipt you&apos;re looking for doesn&apos;t exist or may have
            been removed.
          </p>
        </div>

        <Link
          href="/"
          className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
        >
          Go to Homepage
        </Link>
      </div>
    </div>
  );
}
