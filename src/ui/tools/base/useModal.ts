import { useCallback, useState } from "react";

export interface ModalState<T = any> {
	isOpen: boolean;
	data: T | null;
}

export function useModal<T = any>(initialData: T | null = null) {
	const [isOpen, setIsOpen] = useState(false);
	const [data, setData] = useState<T | null>(initialData);

	const open = useCallback((modalData?: T) => {
		if (modalData !== undefined) {
			setData(modalData);
		}
		setIsOpen(true);
	}, []);

	const close = useCallback(() => {
		setIsOpen(false);
		// Optional: clear data on close? Often better to keep it for exit animations
		// setData(null);
	}, []);

	const toggle = useCallback(() => {
		setIsOpen((prev) => !prev);
	}, []);

	return {
		isOpen,
		data,
		open,
		close,
		toggle,
		setData,
	};
}
