import { useCallback, useState } from "react";

export function useAsyncAction<T = any>() {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const execute = useCallback(async (action: () => Promise<T>) => {
		setIsLoading(true);
		setError(null);
		try {
			const result = await action();
			return { success: true, data: result };
		} catch (err) {
			console.error(err);
			const errorObj = err instanceof Error ? err : new Error(String(err));
			setError(errorObj);
			return { success: false, error: errorObj };
		} finally {
			setIsLoading(false);
		}
	}, []);

	const clearError = useCallback(() => setError(null), []);

	return {
		isLoading,
		error,
		execute,
		clearError,
	};
}
