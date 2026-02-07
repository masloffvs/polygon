import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	CWPriceCard,
	CWPriceDisplay,
} from "../components/cryptowatch/PriceDisplay";
import "../components/cryptowatch/theme.css";

const meta = {
	title: "Cryptowatch/PriceDisplay",
	component: CWPriceDisplay,
	parameters: {
		layout: "centered",
		backgrounds: {
			default: "dark",
			values: [{ name: "dark", value: "#0d0d0e" }],
		},
	},
	tags: ["autodocs"],
} satisfies Meta<typeof CWPriceDisplay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		price: 26982.86,
		currency: "USDT",
	},
};

export const WithChange: Story = {
	args: {
		price: 26982.86,
		change: 2.34,
		currency: "USDT",
		size: "lg",
	},
};

export const NegativeChange: Story = {
	args: {
		price: 1856.42,
		change: -3.21,
		currency: "USDT",
		size: "lg",
	},
};

export const Sizes: Story = {
	render: () => (
		<div className="flex flex-col gap-4">
			<CWPriceDisplay price={26982.86} change={2.34} size="sm" />
			<CWPriceDisplay price={26982.86} change={2.34} size="md" />
			<CWPriceDisplay price={26982.86} change={2.34} size="lg" />
			<CWPriceDisplay price={26982.86} change={2.34} size="xl" />
		</div>
	),
};

export const PriceCard: Story = {
	render: () => (
		<CWPriceCard
			symbol="BTC/USDT"
			name="Bitcoin"
			price={26982.86}
			change={2.34}
			high24h={28422.0}
			low24h={21815.0}
			volume24h={31190000000}
		/>
	),
};

export const PriceCardNegative: Story = {
	render: () => (
		<CWPriceCard
			symbol="ETH/USDT"
			name="Ethereum"
			price={1856.42}
			change={-3.21}
			high24h={1920.5}
			low24h={1798.2}
			volume24h={8765000000}
		/>
	),
};

export const PriceCardGrid: Story = {
	render: () => (
		<div className="grid grid-cols-3 gap-4">
			<CWPriceCard
				symbol="BTC"
				name="Bitcoin"
				price={26982.86}
				change={2.34}
				volume24h={31190000000}
			/>
			<CWPriceCard
				symbol="ETH"
				name="Ethereum"
				price={1856.42}
				change={-1.23}
				volume24h={8765000000}
			/>
			<CWPriceCard
				symbol="BNB"
				name="Binance Coin"
				price={312.45}
				change={0.56}
				volume24h={987000000}
			/>
			<CWPriceCard
				symbol="XRP"
				name="Ripple"
				price={0.5234}
				change={-3.45}
				volume24h={1234000000}
			/>
			<CWPriceCard
				symbol="ADA"
				name="Cardano"
				price={0.3876}
				change={1.87}
				volume24h={456000000}
			/>
			<CWPriceCard
				symbol="SOL"
				name="Solana"
				price={24.56}
				change={5.32}
				volume24h={789000000}
			/>
		</div>
	),
};
