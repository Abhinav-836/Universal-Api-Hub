import React from 'react';

/**
 * Loading placeholders shaped like the real pages, so the layout doesn't
 * jump when data arrives. Uses the .skeleton class from index.css.
 */
export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} />;
}

/** Stand-in for the Navbar while the session is being checked. */
export function NavbarSkeleton() {
  return (
    <div className="sticky top-0 z-50 border-b border-white/[0.06] bg-surface-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-32 h-4 hidden sm:block" />
        </div>
        <div className="hidden md:flex items-center gap-2">
          <Skeleton className="w-24 h-8 rounded-lg" />
          <Skeleton className="w-24 h-8 rounded-lg" />
        </div>
        <Skeleton className="w-9 h-9 rounded-full" />
      </div>
    </div>
  );
}

function PageHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between mb-8">
      <div className="space-y-2">
        <Skeleton className="w-40 h-7" />
        <Skeleton className="w-64 max-w-[60vw] h-4" />
      </div>
      <Skeleton className="w-10 h-10 rounded-xl" />
    </div>
  );
}

/** Body of the dashboard: stats, usage, charts, playground, keys. */
export function DashboardBodySkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card-glass rounded-2xl p-5 space-y-3">
            <Skeleton className="w-9 h-9 rounded-xl" />
            <Skeleton className="w-16 h-6" />
            <Skeleton className="w-24 h-3" />
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="card-glass rounded-2xl p-5 flex flex-col items-center">
          <Skeleton className="w-28 h-4 self-start mb-6" />
          <Skeleton className="w-36 h-36 rounded-full" />
        </div>
        <div className="card-glass rounded-2xl p-5 lg:col-span-2">
          <Skeleton className="w-32 h-4 mb-6" />
          <Skeleton className="w-full h-48" />
        </div>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="card-glass rounded-2xl p-5">
            <Skeleton className="w-32 h-4 mb-6" />
            <Skeleton className="w-full h-52" />
          </div>
        ))}
      </div>
      <div className="card-glass rounded-2xl p-5 space-y-3">
        <Skeleton className="w-28 h-4 mb-3" />
        <Skeleton className="w-full h-12" />
        <Skeleton className="w-full h-12" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Body of the API selection page: category title + card grid, twice. */
export function ApiGridSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading APIs">
      {[...Array(2)].map((_, s) => (
        <div key={s}>
          <Skeleton className="h-5 w-40 mb-4" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(4)].map((_, c) => (
              <div key={c} className="card-glass rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="w-3/4 h-4" />
                    <Skeleton className="w-1/2 h-3" />
                  </div>
                </div>
                <Skeleton className="w-full h-3" />
                <Skeleton className="w-5/6 h-3" />
                <Skeleton className="w-full h-9 rounded-xl mt-4" />
              </div>
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/**
 * Full page shown while the saved session is checked on first load
 * (can take a while when the free backend is waking up). Shaped like
 * the page the user is about to see.
 */
export function AppLoadingSkeleton({ page = 'dashboard' }) {
  return (
    <div className="min-h-screen bg-surface-950 relative z-10">
      <NavbarSkeleton />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeaderSkeleton />
        {page === 'apis' ? <ApiGridSkeleton /> : <DashboardBodySkeleton />}
      </div>
    </div>
  );
}
