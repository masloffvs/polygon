import type { Meta, StoryObj } from "@storybook/react-vite";
import { CWBadge, CWVolumeBadge } from "../components/cryptowatch/Badge";
import "../components/cryptowatch/theme.css";

const meta = {
	title: "Cryptowatch/Badge",
	component: CWBadge,
	parameters: {
		layout: "centered",
		backgrounds: {
			default: "dark",
			values: [{ name: "dark", value: "#0d0d0e" }],
		},
	},
	tags: ["autodocs"],
} satisfies Meta<typeof CWBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Positive: Story = {
	args: {
		value: 5.67,
		isPercentage: true,
	},
};

export const Negative: Story = {
	args: {
		value: -3.21,
		isPercentage: true,
	},
};

export const Neutral: Story = {
	args: {
		value: 0,
		isPercentage: true,
		variant: "neutral",
	},
};

export const Sizes: Story = {
	render: () => (
		<div className="flex items-center gap-4">
			<CWBadge value={2.5} isPercentage size="sm" />
			<CWBadge value={2.5} isPercentage size="md" />
			<CWBadge value={2.5} isPercentage size="lg" />
		</div>
	),
};

export const VolumeBadges: Story = {
	render: () => (
		<div className="flex flex-col gap-2">
			<CWVolumeBadge value={1234567890} />
			<CWVolumeBadge value={56789000} />
			<CWVolumeBadge value={123456} />
			<CWVolumeBadge value={500} />
		</div>
	),
};

export const PriceChanges: Story = {
	render: () => (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-4 text-white">
				<span>BTC</span>
				<CWBadge value={4.52} isPercentage />
			</div>
			<div className="flex items-center gap-4 text-white">
				<span>ETH</span>
				<CWBadge value={-2.13} isPercentage />
			</div>
			<div className="flex items-center gap-4 text-white">
				<span>USDT</span>
				<CWBadge value={0.01} isPercentage />
			</div>
		</div>
	),
};
