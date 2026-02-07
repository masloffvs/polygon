import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
	CWBreadcrumb,
	CWNavBar,
	CWSidebar,
	type NavItem,
} from "../components/cryptowatch/Navigation";
import "../components/cryptowatch/theme.css";

const meta = {
	title: "Cryptowatch/Navigation",
	component: CWNavBar,
	parameters: {
		layout: "fullscreen",
		backgrounds: {
			default: "dark",
			values: [{ name: "dark", value: "#0d0d0e" }],
		},
	},
	tags: ["autodocs"],
} satisfies Meta<typeof CWNavBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const navItems: NavItem[] = [
	{ id: "home", label: "Home" },
	{ id: "charts", label: "Charts" },
	{ id: "assets", label: "Assets" },
	{ id: "exchanges", label: "Exchanges" },
	{ id: "markets", label: "Markets" },
	{ id: "correlations", label: "Correlations" },
	{ id: "desktop", label: "Desktop", isNew: true },
	{ id: "pricing", label: "Pricing" },
];

export const TopNavBar: Story = {
	args: {
		logo: (
			<>
				<span className="text-xl">⬡</span>
				<span>Cryptowatch</span>
			</>
		),
		items: navItems,
		activeItem: "charts",
		rightContent: (
			<div className="flex items-center gap-4">
				<button className="text-sm text-[#8a8a8a] hover:text-[#e8e8e8]">
					EN ▾
				</button>
				<button className="px-3 py-1 bg-[#1a1a1d] text-[#e8e8e8] text-sm rounded">
					Portfolio
				</button>
				<button className="text-sm text-[#ffc107]">250.00 ▾</button>
			</div>
		),
	},
};

const sidebarItems: NavItem[] = [
	{ id: "btc", label: "BTC - Bitcoin", icon: "₿" },
	{ id: "eth", label: "ETH - Ethereum", icon: "Ξ" },
	{ id: "dai", label: "DAI - Multi-Collateral DAI", icon: "◈" },
	{ id: "oxt", label: "OXT - Orchid", icon: "❀" },
	{ id: "paxg", label: "PAXG - PAX Gold", icon: "▣" },
	{ id: "rvn", label: "RVN - Ravencoin", icon: "◆" },
	{ id: "xlm", label: "XLM - Stellar", icon: "✦" },
	{ id: "ltc", label: "LTC - Litecoin", icon: "Ł" },
	{ id: "xrp", label: "XRP", icon: "✕" },
	{ id: "bch", label: "BCH - Bitcoin Cash", icon: "₿" },
	{ id: "link", label: "LINK - ChainLink", icon: "⬡" },
];

export const Sidebar: Story = {
	render: () => {
		const SidebarExample = () => {
			const [active, setActive] = useState("btc");
			return (
				<div className="h-96">
					<CWSidebar
						items={sidebarItems}
						activeItem={active}
						onItemClick={(item) => setActive(item.id)}
						footer={
							<div className="text-xs text-[#5a5a5a] p-2">
								<div>Clear Filters</div>
							</div>
						}
					/>
				</div>
			);
		};
		return <SidebarExample />;
	},
};

export const CollapsedSidebar: Story = {
	render: () => (
		<div className="h-96">
			<CWSidebar items={sidebarItems.slice(0, 6)} activeItem="btc" collapsed />
		</div>
	),
};

export const Breadcrumb: Story = {
	render: () => (
		<div className="p-4">
			<CWBreadcrumb
				items={[
					{ label: "Home", onClick: () => console.log("Home") },
					{ label: "Exchanges", onClick: () => console.log("Exchanges") },
					{ label: "Binance" },
				]}
			/>
		</div>
	),
};

export const FullLayout: Story = {
	render: () => (
		<div className="flex flex-col h-screen bg-[#0d0d0e]">
			<CWNavBar
				logo={
					<>
						<span className="text-xl">⬡</span>
						<span>Cryptowatch</span>
					</>
				}
				items={navItems.slice(0, 6)}
				activeItem="correlations"
				rightContent={
					<div className="flex items-center gap-3">
						<button className="px-3 py-1 text-sm text-[#8a8a8a]">
							Portfolio
						</button>
					</div>
				}
			/>
			<div className="flex flex-1 overflow-hidden">
				<CWSidebar items={sidebarItems.slice(0, 8)} activeItem="btc" />
				<main className="flex-1 p-4 overflow-auto">
					<CWBreadcrumb
						items={[{ label: "Correlations" }, { label: "BTC Analysis" }]}
					/>
					<div className="mt-4 p-4 bg-[#131315] border border-[#2a2a2d] rounded h-64 flex items-center justify-center text-[#5a5a5a]">
						Content Area
					</div>
				</main>
			</div>
		</div>
	),
};
