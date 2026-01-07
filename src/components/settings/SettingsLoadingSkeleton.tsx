/**
 * Settings Loading Skeleton
 * Loading state component for settings page
 */

export function SettingsLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      {/* Mobile tabs skeleton */}
      <div className="md:hidden px-5 pt-6 pb-2">
        <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-100">
          <div className="flex gap-2 overflow-x-auto">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className="h-8 w-24 bg-gray-100 rounded-lg animate-pulse flex-shrink-0"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Desktop layout skeleton */}
      <div className="hidden md:flex h-[calc(100vh-4rem)]">
        {/* Sidebar skeleton */}
        <div className="w-64 bg-white border-r border-gray-200 p-5">
          <div className="space-y-2">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className="h-10 bg-gray-100 rounded-lg animate-pulse"
              />
            ))}
          </div>
        </div>

        {/* Content skeleton */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-3xl">
            <div className="h-8 w-48 bg-gray-100 rounded-lg animate-pulse mb-6" />
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i}>
                  <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mb-2" />
                  <div className="h-10 bg-gray-50 rounded-lg animate-pulse" />
                </div>
              ))}
              <div className="h-10 w-32 bg-blue-100 rounded-lg animate-pulse mt-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile content skeleton */}
      <div className="md:hidden px-5 space-y-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i}>
              <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mb-2" />
              <div className="h-10 bg-gray-50 rounded-lg animate-pulse" />
            </div>
          ))}
          <div className="h-10 bg-blue-100 rounded-lg animate-pulse mt-6" />
        </div>
      </div>
    </div>
  );
}
