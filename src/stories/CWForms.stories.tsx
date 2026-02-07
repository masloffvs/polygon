import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import {
	CWInput,
	CWNumberInput,
	CWSearchInput,
} from "../components/cryptowatch/Input";
import { CWSelect, CWTabs } from "../components/cryptowatch/Select";
import "../components/cryptowatch/theme.css";

const meta = {
	title: "Cryptowatch/Forms",
	component: CWInput,
	parameters: {
		layout: "centered",
		backgrounds: {
			default: "dark",
			values: [{ name: "dark", value: "#0d0d0e" }],
		},
	},
	tags: ["autodocs"],
} satisfies Meta<typeof CWInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextInput: Story = {
	args: {
		placeholder: "Enter text...",
		label: "Label",
	},
};

export const InputWithError: Story = {
	args: {
		placeholder: "Enter amount",
		label: "Amount",
		error: "Insufficient balance",
		defaultValue: "10000",
	},
};

export const InputSizes: Story = {
	render: () => (
		<div className="flex flex-col gap-4 w-64">
			<CWInput placeholder="Small input" inputSize="sm" />
			<CWInput placeholder="Medium input" inputSize="md" />
			<CWInput placeholder="Large input" inputSize="lg" />
		</div>
	),
};

export const SearchInput: Story = {
	render: () => (
		<div className="w-64">
			<CWSearchInput placeholder="Search assets..." />
		</div>
	),
};

export const NumberInput: Story = {
	render: () => (
		<div className="w-48">
			<CWNumberInput
				label="Amount"
				placeholder="0.00"
				currency="BTC"
				step={0.001}
			/>
		</div>
	),
};

export const Select: Story = {
	render: () => (
		<div className="w-48">
			<CWSelect
				label="Exchange"
				placeholder="Select exchange"
				options={[
					{ value: "binance", label: "Binance" },
					{ value: "coinbase", label: "Coinbase" },
					{ value: "kraken", label: "Kraken" },
					{ value: "ftx", label: "FTX", disabled: true },
				]}
			/>
		</div>
	),
};

export const Tabs: Story = {
	render: () => {
		const TabsExample = () => {
			const [value, setValue] = useState("24h");
			return (
				<CWTabs
					options={[
						{ value: "1h", label: "1H" },
						{ value: "24h", label: "24H" },
						{ value: "7d", label: "7D" },
						{ value: "30d", label: "30D" },
						{ value: "1y", label: "1Y" },
					]}
					value={value}
					onChange={setValue}
				/>
			);
		};
		return <TabsExample />;
	},
};

export const TradeForm: Story = {
	render: () => (
		<div className="bg-[#131315] border border-[#2a2a2d] rounded p-4 w-80">
			<div className="flex mb-4">
				<button className="flex-1 py-2 bg-[#00c853] text-white font-medium rounded-l">
					Buy
				</button>
				<button className="flex-1 py-2 bg-[#1a1a1d] text-[#8a8a8a] font-medium rounded-r border-l border-[#2a2a2d]">
					Sell
				</button>
			</div>

			<div className="space-y-4">
				<CWSelect
					label="Order Type"
					options={[
						{ value: "limit", label: "Limit" },
						{ value: "market", label: "Market" },
						{ value: "stop", label: "Stop Limit" },
					]}
					defaultValue="limit"
				/>

				<CWNumberInput label="Price" placeholder="0.00" currency="USDT" />
				<CWNumberInput label="Amount" placeholder="0.00" currency="BTC" />
				<CWNumberInput label="Total" placeholder="0.00" currency="USDT" />

				<button className="w-full py-2.5 bg-[#00c853] hover:bg-[#00a844] text-white font-medium rounded transition-colors">
					Buy BTC
				</button>
			</div>
		</div>
	),
};
