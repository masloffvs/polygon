import classNames from "classnames";
import type React from "react";
import type { ReactNode } from "react";

interface NumericFontProps {
	children: ReactNode;
	className?: string;
	as?: React.ElementType;
}

export const NumericFont: React.FC<NumericFontProps> = ({
	children,
	className,
	as: Component = "span",
}) => {
	return (
		<Component
			className={classNames("font-numeric", className)}
			style={{ fontFamily: "var(--font-numeric)" }}
		>
			{children}
		</Component>
	);
};
