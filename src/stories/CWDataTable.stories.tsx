import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	type Column,
	CWDataTable,
	CWExchangeTable,
	type Exchange,
} from "../components/cryptowatch/DataTable";
import "../components/cryptowatch/theme.css";

const meta = {
	title: "Cryptowatch/DataTable",
	component: CWDataTable,
	parameters: {
		layout: "padded",
		backgrounds: {
			default: "dark",
			values: [{ name: "dark", value: "#0d0d0e" }],
		},
	},
	tags: ["autodocs"],
} satisfies Meta<typeof CWDataTable>;

export default meta;
type Story = StoryObj<typeof meta>;

// Sample exchange data matching the Cryptowatch screenshot
const exchanges: Exchange[] = [
	{
		name: "Binance",
		icon: "◆",
		launchYear: 2017,
		location: "Malta",
		liveMarkets: 1156,
		liquidity: 408620000,
		volume24h: 31190000000,
	},
	{
		name: "Bitfinex",
		icon: "◇",
		launchYear: 2012,
		location: "Hong Kong",
		liveMarkets: 262,
		liquidity: 238440000,
		volume24h: 664880000,
	},
	{
		name: "FTX",
		icon: "◈",
		launchYear: 2019,
		location: "Antigua and Barbuda",
		liveMarkets: 501,
		liquidity: 185200000,
		volume24h: 3250000000,
	},
	{
		name: "Kraken",
		icon: "▲",
		launchYear: 2011,
		location: "United States",
		liveMarkets: 252,
		liquidity: 76420000,
		volume24h: 958180000,
	},
	{
		name: "BitMEX",
		icon: "◆",
		launchYear: 2014,
		location: "Seychelles",
		liveMarkets: 23,
		liquidity: 66400000,
		volume24h: 2770000000,
	},
	{
		name: "HitBTC",
		icon: "●",
		launchYear: 2013,
		location: "Hong Kong",
		liveMarkets: 818,
		liquidity: 60300000,
		volume24h: 1090000000,
	},
	{
		name: "Coinbase Pro",
		icon: "○",
		launchYear: 2012,
		location: "United States",
		liveMarkets: 159,
		liquidity: 54580000,
		volume24h: 1980000000,
	},
	{
		name: "Deribit",
		icon: "◐",
		launchYear: 2016,
		location: "Panama",
		liveMarkets: 10,
		liquidity: 42780000,
		volume24h: 1120000000,
	},
	{
		name: "Kraken Futures",
		icon: "▲",
		launchYear: 2014,
		location: "United Kingdom",
		liveMarkets: 22,
		liquidity: 42530000,
		volume24h: 485060000,
	},
	{
		name: "OKex",
		icon: "◆",
		launchYear: 2014,
		location: "Hong Kong",
		liveMarkets: 473,
		liquidity: 29910000,
		volume24h: 2610000000,
	},
];

export const ExchangeTable: Story = {
	render: () => (
		<div className="bg-[#0d0d0e] p-4 rounded">
			<div className="flex items-center justify-between mb-4">
				<div>
					<h2 className="text-xl font-semibold text-[#e8e8e8]">
						Supported Exchanges
					</h2>
					<p className="text-sm text-[#5a5a5a]">by Exchange Ascending</p>
				</div>
				<div className="flex gap-2">
					<button className="px-3 py-1 bg-[#2196f3] text-white text-sm rounded">
						$ USD
					</button>
					<button className="px-3 py-1 bg-[#1a1a1d] text-[#8a8a8a] text-sm rounded">
						₩ KRW
					</button>
					<button className="px-3 py-1 bg-[#1a1a1d] text-[#8a8a8a] text-sm rounded">
						€ EUR
					</button>
					<button className="px-3 py-1 bg-[#1a1a1d] text-[#8a8a8a] text-sm rounded">
						₿ BTC
					</button>
				</div>
			</div>
			<CWExchangeTable exchanges={exchanges} />
		</div>
	),
};

// Generic table example
interface CryptoAsset {
	symbol: string;
	name: string;
	price: number;
	change24h: number;
	volume24h: number;
	marketCap: number;
}

const cryptoAssets: CryptoAsset[] = [
	{
		symbol: "BTC",
		name: "Bitcoin",
		price: 26982.86,
		change24h: 2.34,
		volume24h: 15234000000,
		marketCap: 524000000000,
	},
	{
		symbol: "ETH",
		name: "Ethereum",
		price: 1856.42,
		change24h: -1.23,
		volume24h: 8765000000,
		marketCap: 223000000000,
	},
	{
		symbol: "BNB",
		name: "Binance Coin",
		price: 312.45,
		change24h: 0.56,
		volume24h: 987000000,
		marketCap: 48000000000,
	},
	{
		symbol: "XRP",
		name: "Ripple",
		price: 0.5234,
		change24h: -3.45,
		volume24h: 1234000000,
		marketCap: 27000000000,
	},
	{
		symbol: "ADA",
		name: "Cardano",
		price: 0.3876,
		change24h: 1.87,
		volume24h: 456000000,
		marketCap: 13500000000,
	},
];

const cryptoColumns: Column<CryptoAsset>[] = [
	{
		key: "symbol",
		header: "Symbol",
		render: (v) => <span className="text-[#ffc107] font-semibold">{v}</span>,
	},
	{ key: "name", header: "Name" },
	{
		key: "price",
		header: "Price",
		align: "right",
		render: (v) => <span className="font-mono">${v.toLocaleString()}</span>,
	},
	{
		key: "change24h",
		header: "24h Change",
		align: "right",
		render: (v) => (
			<span
				className={`font-mono ${v >= 0 ? "text-[#00c853]" : "text-[#ff3d3d]"}`}
			>
				{v >= 0 ? "+" : ""}
				{v.toFixed(2)}%
			</span>
		),
	},
	{
		key: "volume24h",
		header: "Volume",
		align: "right",
		render: (v) => (
			<span className="font-mono text-[#8a8a8a]">${(v / 1e9).toFixed(2)}B</span>
		),
	},
	{
		key: "marketCap",
		header: "Market Cap",
		align: "right",
		render: (v) => (
			<span className="font-mono text-[#8a8a8a]">${(v / 1e9).toFixed(2)}B</span>
		),
	},
];

export const CryptoAssetsTable: Story = {
	render: () => (
		<div className="bg-[#0d0d0e] p-4 rounded">
			<CWDataTable
				columns={cryptoColumns}
				data={cryptoAssets}
				keyField="symbol"
				showRowNumbers
			/>
		</div>
	),
};

export const CompactTable: Story = {
	render: () => (
		<div className="bg-[#0d0d0e] p-4 rounded w-96">
			<CWDataTable
				columns={cryptoColumns.slice(0, 3)}
				data={cryptoAssets}
				keyField="symbol"
				compact
				striped
			/>
		</div>
	),
};
