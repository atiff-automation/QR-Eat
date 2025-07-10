import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            QR Restaurant
            <span className="text-blue-600"> System</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Modern QR code ordering system for restaurants. Scan, order, and
            enjoy seamlessly.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link href="/login">
              <Button size="lg" className="w-full sm:w-auto">
                Staff Login
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                View Dashboard
              </Button>
            </Link>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-8 mb-12">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">
              Test QR Codes
            </h2>
            <p className="text-gray-600 mb-6">
              Scan these QR codes or click the links to test the customer menu
              experience:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  table: '1',
                  name: 'Window Table 1',
                  token:
                    'eyJ0YWJsZUlkIjoidGFibGUtMSIsInJlc3RhdXJhbnQiOiJtYXJpb3MtbG9jYWwiLCJ0aW1lc3RhbXAiOjE3NTIxNjAzNDA3OTF9',
                },
                {
                  table: '2',
                  name: 'Center Table 2',
                  token:
                    'eyJ0YWJsZUlkIjoidGFibGUtMiIsInJlc3RhdXJhbnQiOiJtYXJpb3MtbG9jYWwiLCJ0aW1lc3RhbXAiOjE3NTIxNjAzNDA3OTF9',
                },
                {
                  table: '3',
                  name: 'Booth 3',
                  token:
                    'eyJ0YWJsZUlkIjoidGFibGUtMyIsInJlc3RhdXJhbnQiOiJtYXJpb3MtbG9jYWwiLCJ0aW1lc3RhbXAiOjE3NTIxNjAzNDA3OTF9',
                },
                {
                  table: '4',
                  name: 'Patio Table 4',
                  token:
                    'eyJ0YWJsZUlkIjoidGFibGUtNCIsInJlc3RhdXJhbnQiOiJtYXJpb3MtbG9jYWwiLCJ0aW1lc3RhbXAiOjE3NTIxNjAzNDA3OTF9',
                },
              ].map((tableInfo) => (
                <Link
                  key={tableInfo.table}
                  href={`/qr/${tableInfo.token}`}
                  className="block p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all"
                >
                  <div className="text-lg font-medium text-gray-900">
                    Table {tableInfo.table}
                  </div>
                  <div className="text-sm text-gray-500">{tableInfo.name}</div>
                  <div className="mt-2 text-blue-600 text-sm">
                    Click to view menu →
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">
              Test Credentials
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-2">Manager</h3>
                <p className="text-sm text-gray-600">
                  Email: manager@marios-local.com
                  <br />
                  Password: password123
                </p>
              </div>
              <div className="p-4 bg-green-50 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-2">Server</h3>
                <p className="text-sm text-gray-600">
                  Email: server@marios-local.com
                  <br />
                  Password: password123
                </p>
              </div>
              <div className="p-4 bg-orange-50 rounded-lg">
                <h3 className="font-medium text-gray-900 mb-2">Kitchen</h3>
                <p className="text-sm text-gray-600">
                  Email: kitchen@marios-local.com
                  <br />
                  Password: password123
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
