import type { DefaultDatatype } from "@/server/utils/dataview.helpers";
import { lazy, Suspense, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { withErrorBoundary } from "@/ui/components/ErrorBoundary";

// Dynamic import registry for dataviews
const dataviewImports: Record<
  string,
  () => Promise<{ default: React.ComponentType<DefaultDatatype> }>
> = {
  TestView: () => import("@/server/dataviews/TestView"),
  InterpolView: () => import("@/server/dataviews/InterpolView"),
  NewsView: () => import("@/server/dataviews/NewsView"),
  DayInLifeView: () => import("@/server/dataviews/DayInLifeView"),
  RichStringView: () => import("@/server/dataviews/RichStringView"),
};

function DataViewPageComponent() {
  const { viewId } = useParams<{ viewId: string }>();
  const [searchParams] = useSearchParams();

  // Parse args from URL
  const args = useMemo(() => {
    const argsParam = searchParams.get("args");
    if (!argsParam) return {};
    try {
      return JSON.parse(argsParam);
    } catch {
      console.warn("Failed to parse view args:", argsParam);
      return {};
    }
  }, [searchParams]);

  // Dynamically load the view component
  const ViewComponent = useMemo(() => {
    if (!viewId) return null;
    const importer = dataviewImports[viewId];
    if (!importer) return null;
    return lazy(importer);
  }, [viewId]);

  if (!viewId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-800">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">No View ID</h1>
          <p className="text-gray-500">Please provide a view ID in the URL</p>
        </div>
      </div>
    );
  }

  if (!ViewComponent) {
    return (
      <div className="flex-1 flex items-center justify-center bg-dark-800">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">View Not Found</h1>
          <p className="text-gray-500">DataView "{viewId}" is not registered</p>
          <p className="text-gray-600 text-sm mt-4">
            Available views: {Object.keys(dataviewImports).join(", ")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-dark-800 min-h-screen">
      {/* Content */}
      <main className="flex-1 p-6">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-64">
              <div className="animate-pulse text-gray-500">
                Loading {viewId}...
              </div>
            </div>
          }
        >
          <ViewComponent args={args} id={viewId} />
        </Suspense>
      </main>
    </div>
  );
}

export const DataViewPage = withErrorBoundary(DataViewPageComponent, {
  title: "Data View",
});
