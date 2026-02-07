import { useCallback, useEffect, useRef, useState } from "react";

interface UsePollingOptions {
	enabled?: boolean;
	immediate?: boolean;
}

export function usePolling<T>(
	fetcher: () => Promise<T>,
	intervalMs: number,
	options: UsePollingOptions = { enabled: true, immediate: true },
) {
	const [data, setData] = useState<T | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const timerRef = useRef<Timer | null>(null);

	const fetchData = useCallback(async () => {
		setIsLoading(true);
		try {
			const result = await fetcher();
			setData(result);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
		} finally {
			setIsLoading(false);
		}
	}, [fetcher]);

	const stop = useCallback(() => {
		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const start = useCallback(() => {
		stop(); // Clear existing
		if (options.immediate) {
			fetchData();
		}
		timerRef.current = setInterval(fetchData, intervalMs);
	}, [fetchData, intervalMs, options.immediate, stop]);

	useEffect(() => {
		if (options.enabled) {
			start();
		} else {
			stop();
		}
		return () => stop();
	}, [options.enabled, start, stop]);

	return {
		data,
		isLoading,
		error,
		refetch: fetchData,
		start,
		stop,
	};
}
