import type { ReactNode } from "react";

export type BaseToolProps = {
	children: ReactNode;
	title: string;
	include?: ReactNode;
	isLoading?: boolean;
};

export default function BaseTool({
	children,
	title,
	include,
	isLoading,
}: BaseToolProps) {
	return (
		<div className="w-full min-h-screen">
			<div className="p-4 text-white min-h-full mb-8 overflow-y-auto">
				{include}
				{title && (
					<h1 className="text-[28px] font-semibold yellowtail-regular h-10">
						{title}
					</h1>
				)}
				{isLoading ? (
					<div className="mt-4 flex justify-center">
						<div className="animate-spin h-8 w-8 border-4 border-dark-500 border-t-blue-500 rounded-full"></div>
					</div>
				) : (
					<div className="mt-4 pb-8">{children}</div>
				)}
			</div>
		</div>
	);
}
