import classNames from "classnames";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface DashboardCardWrapperProps {
	children: ReactNode;
	className?: string;
	delay?: number;
}

export const DashboardCardWrapper = ({
	children,
	className,
	delay = 0,
}: DashboardCardWrapperProps) => {
	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.98 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.4, delay }}
			className={classNames(
				"bg-dark-400/30 backdrop-blur-sm rounded-xl overflow-hidden h-full flex flex-col shadow-sm transition-colors",
				className,
			)}
		>
			{children}
		</motion.div>
	);
};
