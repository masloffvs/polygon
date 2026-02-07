import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	CWOrderBook,
	type OrderBookEntry,
} from "../components/cryptowatch/OrderBook";
import "../components/cryptowatch/theme.css";

const meta = {
	title: "Cryptowatch/OrderBook",
	component: CWOrderBook,
	parameters: {
		layout: "centered",
		backgrounds: {
			default: "dark",
			values: [{ name: "dark", value: "#0d0d0e" }],
		},
	},
	tags: ["autodocs"],
} satisfies Meta<typeof CWOrderBook>;

export default meta;
type Story = StoryObj<typeof meta>;

// Generate sample order book data
const generateAsks = (): OrderBookEntry[] => {
	let total = 0;
	return Array.from({ length: 15 }, (_, i) => {
		const price = 27000 + i * 5 + Math.random() * 3;
		const amount = Math.random() * 2 + 0.1;
		total += amount;
		return { price, amount, total };
	}).sort((a, b) => a.price - b.price);
};

const generateBids = (): OrderBookEntry[] => {
	let total = 0;
	return Array.from({ length: 15 }, (_, i) => {
		const price = 26995 - i * 5 - Math.random() * 3;
		const amount = Math.random() * 2 + 0.1;
		total += amount;
		return { price, amount, total };
	}).sort((a, b) => b.price - a.price);
};

const asks = generateAsks();
const bids = generateBids();

export const Default: Story = {
	args: {
		asks,
		bids,
		currentPrice: 26997.5,
		pricePrecision: 2,
		amountPrecision: 4,
		maxRows: 10,
	},
};

export const WithoutTotals: Story = {
	args: {
		asks,
		bids,
		currentPrice: 26997.5,
		showTotals: false,
		maxRows: 8,
	},
};

export const CompactView: Story = {
	args: {
		asks,
		bids,
		currentPrice: 26997.5,
		maxRows: 5,
		pricePrecision: 0,
		amountPrecision: 2,
	},
};

export const HighPrecision: Story = {
	args: {
		asks: asks.map((a) => ({ ...a, price: a.price / 1000 })),
		bids: bids.map((b) => ({ ...b, price: b.price / 1000 })),
		currentPrice: 26.9975,
		pricePrecision: 4,
		amountPrecision: 6,
		maxRows: 10,
	},
};

export const FullWidth: Story = {
	render: () => (
		<div className="w-96">
			<CWOrderBook
				asks={asks}
				bids={bids}
				currentPrice={26997.5}
				maxRows={12}
			/>
		</div>
	),
};
