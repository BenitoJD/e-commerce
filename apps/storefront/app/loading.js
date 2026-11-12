// Navigation skeleton: without this, moving between server-rendered pages shows nothing
// until the response arrives, which feels broken on a slow connection.
export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="h-8 w-64 bg-gray-200 rounded" />
      <div className="h-4 w-40 bg-gray-100 rounded mt-3" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border rounded-xl overflow-hidden">
            <div className="h-40 bg-gray-100" />
            <div className="p-3 space-y-2">
              <div className="h-3 w-3/4 bg-gray-200 rounded" />
              <div className="h-3 w-1/2 bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
