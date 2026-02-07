import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	CWTicker,
	CWTickerBar,
	type TickerItem,
} from "../components/cryptowatch/Ticker";
import "../components/cryptowatch/theme.css";

const meta = {
	title: "Cryptowatch/Ticker",
	component: CWTicker,
	parameters: {
		layout: "fullscreen",
		backgrounds: {
			default: "dark",
			values: [{ name: "dark", value: "#0d0d0e" }],
		},
	},
	tags: ["autodocs"],
} satisfies Meta<typeof CWTicker>;

export default meta;
type Story = StoryObj<typeof meta>;

const tickerItems: TickerItem[] = [
	{ symbol: "BTC/USD", price: 27022.5, change: 0.18 },
	{ symbol: "BTC/USD", price: 27018.0, change: 0.44 },
	{ symbol: "BTC/JPY", price: 2805080, change: 0.36 },
	{ symbol: "BTC/KRW", price: 29958000, change: 0.45 },
	{ symbol: "BTC/USD", price: 27021.5, change: 0.27 },
	{ symbol: "BTC/USD", price: 27000.0, change: 0.26 },
	{ symbol: "BTC/EUR", price: 22119.9, change: 1.02 },
	{ symbol: "ETH/USD", price: 1856.42, change: -1.23 },
	{ symbol: "BNB/USD", price: 312.45, change: 0.56 },
];

export const ScrollingTicker: Story = {
	args: {
		items: tickerItems,
		speed: 20,
	},
};

export const SlowTicker: Story = {
	args: {
		items: tickerItems,
		speed: 60,
	},
};

export const StaticTickerBar: Story = {
	render: () => <CWTickerBar items={tickerItems} />,
};

export const FullHeader: Story = {
	render: () => (
		<div className="bg-[#0d0d0e]">
			<CWTickerBar items={tickerItems} />
		</div>
	),
};
