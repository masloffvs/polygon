import type { Meta, StoryObj } from "@storybook/react-vite";
import { CWButton, CWButtonGroup } from "../components/cryptowatch/Button";
import "../components/cryptowatch/theme.css";

const meta = {
	title: "Cryptowatch/Button",
	component: CWButton,
	parameters: {
		layout: "centered",
		backgrounds: {
			default: "dark",
			values: [{ name: "dark", value: "#0d0d0e" }],
		},
	},
	tags: ["autodocs"],
} satisfies Meta<typeof CWButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
	args: {
		variant: "primary",
		children: "Primary Button",
	},
};

export const Secondary: Story = {
	args: {
		variant: "secondary",
		children: "Secondary Button",
	},
};

export const Success: Story = {
	args: {
		variant: "success",
		children: "Buy BTC",
	},
};

export const Danger: Story = {
	args: {
		variant: "danger",
		children: "Sell BTC",
	},
};

export const Ghost: Story = {
	args: {
		variant: "ghost",
		children: "Ghost Button",
	},
};

export const Sizes: Story = {
	render: () => (
		<div className="flex items-center gap-4">
			<CWButton size="sm">Small</CWButton>
			<CWButton size="md">Medium</CWButton>
			<CWButton size="lg">Large</CWButton>
		</div>
	),
};

export const ButtonGroup: Story = {
	render: () => (
		<CWButtonGroup>
			<CWButton variant="secondary" active>
				1H
			</CWButton>
			<CWButton variant="secondary">24H</CWButton>
			<CWButton variant="secondary">7D</CWButton>
			<CWButton variant="secondary">1M</CWButton>
			<CWButton variant="secondary">1Y</CWButton>
		</CWButtonGroup>
	),
};

export const TradeButtons: Story = {
	render: () => (
		<div className="flex gap-2">
			<CWButton variant="success" size="lg">
				Buy
			</CWButton>
			<CWButton variant="danger" size="lg">
				Sell
			</CWButton>
		</div>
	),
};
