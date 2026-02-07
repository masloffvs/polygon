import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	CWWatchlist,
	CWWatchlistItem,
	type WatchlistAsset,
} from "../components/cryptowatch/Watchlist";
import "../components/cryptowatch/theme.css";

const meta = {
	title: "Cryptowatch/Watchlist",
	component: CWWatchlist,
	parameters: {
		layout: "centered",
		backgrounds: {
			default: "dark",
			values: [{ name: "dark", value: "#0d0d0e" }],
		},
	},
	tags: ["autodocs"],
} satisfies Meta<typeof CWWatchlist>;

export default meta;
type Story = StoryObj<typeof meta>;

const watchlistAssets: WatchlistAsset[] = [
	{
		symbol: "BTCUSDT",
		name: "Binance",
		exchange: "Binance",
		price: 26980.88,
		change: 0.27,
		volume: 90340000,
	},
	{
		symbol: "BTCUSD",
		name: "Bitfinex",
		exchange: "Bitfinex",
		price: 26978.0,
		change: 0.59,
		volume: 8560000,
	},
	{
		symbol: "BTCJPY",
		name: "bitFlyer",
		exchange: "bitFlyer",
		price: 2798488,
		change: 0.39,
		volume: 8395000,
		currency: "¥",
	},
	{
		symbol: "BTCKRW",
		name: "Bithumb",
		exchange: "Bithumb",
		price: 29897000,
		change: 0.49,
		volume: 7798000,
		currency: "₩",
	},
	{
		symbol: "BTCUSD",
		name: "BitMEX Perp",
		exchange: "BitMEX",
		price: 26978.5,
		change: 0.35,
		volume: 2490000000,
	},
	{
		symbol: "BTCUSD",
		name: "Coinbase Pro",
		exchange: "Coinbase",
		price: 26977.79,
		change: 0.37,
		volume: 23770000,
	},
	{
		symbol: "BTCEUR",
		name: "Kraken",
		exchange: "Kraken",
		price: 22090.0,
		change: 2.05,
		volume: 6580000,
		currency: "€",
	},
];

export const Default: Story = {
	args: {
		assets: watchlistAssets,
		title: "Watchlist",
	},
};

export const WithSelection: Story = {
	args: {
		assets: watchlistAssets,
		selectedSymbol: "BTCUSDT",
		onAssetClick: (asset) => console.log("Clicked:", asset),
	},
};

export const SingleItem: Story = {
	render: () => (
		<div className="w-80">
			<CWWatchlistItem
				asset={watchlistAssets[0]!}
				onClick={() => console.log("clicked")}
			/>
		</div>
	),
};

export const SelectedItem: Story = {
	render: () => (
		<div className="w-80">
			<CWWatchlistItem asset={watchlistAssets[0]!} selected />
		</div>
	),
};

export const MultipleWatchlists: Story = {
	render: () => (
		<div className="flex gap-4">
			<CWWatchlist
				title="BTC Markets"
				assets={watchlistAssets.slice(0, 4)}
				className="w-72"
			/>
			<CWWatchlist
				title="Favorites"
				assets={watchlistAssets.slice(2, 6)}
				className="w-72"
			/>
		</div>
	),
};
