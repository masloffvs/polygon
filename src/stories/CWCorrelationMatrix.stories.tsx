import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	type CorrelationData,
	CWCorrelationMatrix,
} from "../components/cryptowatch/CorrelationMatrix";
import "../components/cryptowatch/theme.css";

const meta = {
	title: "Cryptowatch/CorrelationMatrix",
	component: CWCorrelationMatrix,
	parameters: {
		layout: "centered",
		backgrounds: {
			default: "dark",
			values: [{ name: "dark", value: "#0d0d0e" }],
		},
	},
	tags: ["autodocs"],
} satisfies Meta<typeof CWCorrelationMatrix>;

export default meta;
type Story = StoryObj<typeof meta>;

// Sample correlation data matching the Cryptowatch screenshot
const correlationData: CorrelationData = {
	assets: ["BTC", "ETH", "DAI", "XLM", "RVN", "OXT", "PAXG"],
	values: [
		[1, 0.8, -0.18, 0.27, 0.51, 0.3, 0.33],
		[0.8, 1, -0.11, 0.43, 0.55, 0.29, 0.33],
		[-0.18, -0.11, 1, -0.06, -0.26, -0.13, -0.16],
		[0.27, 0.43, -0.06, 1, 0.42, 0.32, -0.02],
		[0.51, 0.55, -0.26, 0.42, 1, 0.41, 0.32],
		[0.3, 0.29, -0.13, 0.32, 0.41, 1, 0.17],
		[0.33, 0.33, -0.16, -0.02, 0.32, 0.17, 1],
	],
};

export const Default: Story = {
	args: {
		data: correlationData,
	},
};

export const LargeMatrix: Story = {
	args: {
		data: {
			assets: [
				"BTC",
				"ETH",
				"DAI",
				"XLM",
				"RVN",
				"OXT",
				"PAXG",
				"LINK",
				"ZEC",
				"DASH",
			],
			values: [
				[1, 0.8, -0.18, 0.27, 0.51, 0.3, 0.33, 0.74, 0.65, -0.54],
				[0.8, 1, -0.11, 0.43, 0.55, 0.29, 0.33, 0.82, 0.71, -0.42],
				[-0.18, -0.11, 1, -0.06, -0.26, -0.13, -0.16, -0.08, -0.15, 0.21],
				[0.27, 0.43, -0.06, 1, 0.42, 0.32, -0.02, 0.38, 0.45, -0.31],
				[0.51, 0.55, -0.26, 0.42, 1, 0.41, 0.32, 0.48, 0.52, -0.38],
				[0.3, 0.29, -0.13, 0.32, 0.41, 1, 0.17, 0.25, 0.33, -0.22],
				[0.33, 0.33, -0.16, -0.02, 0.32, 0.17, 1, 0.28, 0.19, -0.15],
				[0.74, 0.82, -0.08, 0.38, 0.48, 0.25, 0.28, 1, 0.68, -0.45],
				[0.65, 0.71, -0.15, 0.45, 0.52, 0.33, 0.19, 0.68, 1, -0.51],
				[-0.54, -0.42, 0.21, -0.31, -0.38, -0.22, -0.15, -0.45, -0.51, 1],
			],
		},
		cellSize: 40,
	},
};

export const SmallCells: Story = {
	args: {
		data: correlationData,
		cellSize: 36,
		showValues: true,
		precision: 1,
	},
};

export const WithClickHandler: Story = {
	args: {
		data: correlationData,
		onCellClick: (row, col, value) => {
			alert(`Clicked: ${row} × ${col} = ${value?.toFixed(2)}`);
		},
	},
};

export const FullPage: Story = {
	render: () => (
		<div className="bg-[#0d0d0e] p-6 rounded min-w-[600px]">
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center gap-4">
					<span className="text-sm text-[#8a8a8a]">Price Data:</span>
					<span className="text-sm text-[#e8e8e8]">✓ Detrended (1st Δ)</span>
				</div>
				<div className="flex gap-2">
					<button className="px-3 py-1 bg-[#1a1a1d] text-[#8a8a8a] text-sm rounded">
						24H
					</button>
					<button className="px-3 py-1 bg-[#1a1a1d] text-[#8a8a8a] text-sm rounded">
						7D
					</button>
					<button className="px-3 py-1 bg-[#1a1a1d] text-[#8a8a8a] text-sm rounded">
						30D
					</button>
					<button className="px-3 py-1 bg-[#2196f3] text-white text-sm rounded">
						1Y
					</button>
				</div>
			</div>

			<CWCorrelationMatrix data={correlationData} cellSize={52} />

			<div className="mt-6 p-4 bg-[#131315] rounded text-sm">
				<p className="text-[#e8e8e8] mb-2">
					<strong>Correlation:</strong> Positively correlated variables tend to
					move together, negatively correlated variables move inversely to each
					other, and uncorrelated variables move independently of each other.
				</p>
				<div className="flex gap-8 mt-4 text-xs">
					<div className="flex items-center gap-2">
						<div className="w-8 h-4 bg-[rgba(0,200,83,0.7)] rounded" />
						<span className="text-[#8a8a8a]">Positive correlation</span>
					</div>
					<div className="flex items-center gap-2">
						<div className="w-8 h-4 bg-[rgba(255,61,61,0.7)] rounded" />
						<span className="text-[#8a8a8a]">Negative correlation</span>
					</div>
				</div>
			</div>
		</div>
	),
};
