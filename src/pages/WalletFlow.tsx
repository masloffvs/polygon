import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Activity, CheckCircle, RefreshCcw, Wallet, Plus, TrendingUp, X } from "lucide-react";
import { withErrorBoundary } from "@/ui/components/ErrorBoundary";

// Lazy imports
const DashboardCardWrapper = lazy(() => import("@/ui/components").then(m => ({ default: m.DashboardCardWrapper })));
const NumericFont = lazy(() => import("@/ui/components").then(m => ({ default: m.NumericFont })));
const StatCard = lazy(() => import("@/ui/components").then(m => ({ default: m.StatCard })));
const CWButton = lazy(() => import("@/components/cryptowatch").then(m => ({ default: m.CWButton })));
const CWInput = lazy(() => import("@/components/cryptowatch").then(m => ({ default: m.CWInput })));
const CWSelect = lazy(() => import("@/components/cryptowatch").then(m => ({ default: m.CWSelect })));

type WalletEntry = {
	id: string;
	address: string;
	chain: string;
	label?: string;
	createdAt?: string;
	walletVirtualOwner?: string;
	meta?: Record<string, unknown>;
};

type WalletListResponse = {
	items: WalletEntry[];
	total: number;
	limit: number;
	offset: number;
};

type InstitutionalWalletListResponse = {
	items: WalletEntry[];
	total: number;
	limit: number;
	offset: number;
};

type IncomingTx = {
	id: string;
	chain: string;
	address: string;
	amount: string;
	asset: string;
	status: "pending" | "confirmed" | "failed" | "unknown";
	walletId?: string;
	walletVirtualOwner?: string;
	txHash?: string;
	from?: string;
	blockNumber?: number;
	timestamp?: string;
};

const SUPPORTED_CHAINS = [
	{ value: "solana", label: "Solana" },
	{ value: "eth", label: "Ethereum" },
	{ value: "base", label: "Base" },
	{ value: "polygon", label: "Polygon" },
	{ value: "trx", label: "TRX" },
	{ value: "xrp", label: "XRP" },
	{ value: "polkadot", label: "Polkadot" },
];

const chainLabel = (chain?: string) => {
	const match = SUPPORTED_CHAINS.find((item) => item.value === chain);
	return match?.label ?? (chain ? chain.toUpperCase() : "-");
};

const shorten = (value?: string, head = 6, tail = 4) => {
	if (!value) return "-";
	if (value.length <= head + tail) return value;
	return `${value.slice(0, head)}...${value.slice(-tail)}`;
};

const formatTimestamp = (value?: string) => {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
};

const getInstitutionalAssets = (wallet?: WalletEntry | null): string[] => {
	if (!wallet?.meta || typeof wallet.meta !== "object") return [];
	const assets = (wallet.meta as Record<string, unknown>).institutionalAssets;
	if (!Array.isArray(assets)) return [];
	return assets.filter(
		(asset): asset is string => typeof asset === "string" && asset.length > 0,
	);
};

const isInstitutionalWallet = (wallet?: WalletEntry | null) => {
	if (!wallet?.meta || typeof wallet.meta !== "object") return false;
	return (wallet.meta as Record<string, unknown>).institutional === true;
};

const fetcher = async (url: string) => {
	const res = await fetch(url);
	if (!res.ok) {
		const message = await res.text();
		throw new Error(message || "Request failed");
	}
	return res.json();
};

const WalletFlowComponent = () => {
	const [walletType, setWalletType] = useState<"standard" | "institutional">("standard");
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [createChain, setCreateChain] = useState("polygon");
	const [createLabel, setCreateLabel] = useState("");
	const [createAssets, setCreateAssets] = useState("");
	const [createStatus, setCreateStatus] = useState<"idle" | "saving" | "error">("idle");
	const [createError, setCreateError] = useState("");
	
	const { data: healthData, error: healthError } = useSWR(
		"/api/wallet-flow/health",
		fetcher,
		{ refreshInterval: 15000 },
	);

	const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);

	// Standard wallets
	const {
		data: standardWalletData,
		error: standardWalletError,
		mutate: refreshStandardWallets,
	} = useSWR<WalletListResponse>("/api/wallet-flow/wallets?limit=100", fetcher, {
		refreshInterval: 60000,
	});

	// Institutional wallets
	const {
		data: institutionalWalletData,
		error: institutionalWalletError,
		mutate: refreshInstitutionalWallets,
	} = useSWR<InstitutionalWalletListResponse>(
		"/api/wallet-flow/institutional/wallets?limit=100",
		fetcher,
		{
			refreshInterval: 60000,
		},
	);

	const walletData = walletType === "institutional" ? institutionalWalletData : standardWalletData;
	const walletError = walletType === "institutional" ? institutionalWalletError : standardWalletError;
	const refreshWallets = walletType === "institutional" ? refreshInstitutionalWallets : refreshStandardWallets;

	const walletItems = walletData?.items ?? [];

	useEffect(() => {
		if (walletItems.length === 0) {
			setSelectedWalletId(null);
			return;
		}
		const exists = selectedWalletId
			? walletItems.some((wallet) => wallet.id === selectedWalletId)
			: false;
		if (!selectedWalletId || !exists) {
			const firstWallet = walletItems[0];
			if (firstWallet) {
				setSelectedWalletId(firstWallet.id);
			}
		}
	}, [selectedWalletId, walletItems]);

	const selectedWallet = useMemo(
		() => walletItems.find((wallet) => wallet.id === selectedWalletId) ?? null,
		[walletItems, selectedWalletId],
	);

	const incomingUrl = selectedWallet
		? `/api/wallet-flow/transactions/incoming?walletId=${selectedWallet.id}&limit=50`
		: null;

	const { data: incomingData } = useSWR<IncomingTx[]>(incomingUrl, fetcher, {
		refreshInterval: 20000,
	});

	const incomingItems = useMemo(() => {
		if (!incomingData) return [];
		return [...incomingData].sort((a, b) => {
			const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
			const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
			return bTime - aTime;
		});
	}, [incomingData]);

	const incomingStats = useMemo(() => {
		const stats = {
			total: 0,
			confirmed: 0,
			pending: 0,
			failed: 0,
			unknown: 0,
			latest: "",
		};
		let latestTime = 0;
		for (const tx of incomingData ?? []) {
			stats.total += 1;
			stats[tx.status] += 1;
			if (tx.timestamp) {
				const time = new Date(tx.timestamp).getTime();
				if (!Number.isNaN(time) && time > latestTime) {
					latestTime = time;
					stats.latest = tx.timestamp;
				}
			}
		}
		return stats;
	}, [incomingData]);

	const gatewayStatus = healthError
		? "offline"
		: healthData?.status === "ok"
			? "online"
			: "unknown";

	const gatewayCardStatus =
		gatewayStatus === "online"
			? "success"
			: gatewayStatus === "offline"
				? "error"
				: "neutral";

	const selectedShort = selectedWallet
		? shorten(selectedWallet.address, 6, 4)
		: "None";
	const selectedChain = selectedWallet
		? chainLabel(selectedWallet.chain)
		: "No selection";

	const statCards = [
		{
			title: "GATEWAY",
			value: gatewayStatus.toUpperCase(),
			status: gatewayCardStatus,
			statusText: "Status",
			subtext: "Wallet Gateway",
			icon: <CheckCircle size={12} strokeWidth={2} />,
		},
		{
			title: "WALLETS",
			value: walletData?.total ?? 0,
			status: "info" as const,
			statusText: walletType === "institutional" ? "Institutional" : "Standard",
			subtext: walletType === "institutional" ? "Postgres" : "Registered",
			icon: <Wallet size={12} strokeWidth={2} />,
		},
		{
			title: "SELECTED",
			value: selectedShort,
			status: selectedWallet ? ("active" as const) : ("neutral" as const),
			statusText: selectedChain,
			subtext: selectedWallet?.label || "Pick a wallet",
			icon: <Wallet size={12} strokeWidth={2} />,
		},
		{
			title: "INCOMING",
			value: incomingStats.total,
			status: incomingStats.total > 0 ? ("active" as const) : ("neutral" as const),
			statusText: "Transactions",
			subtext: incomingStats.latest ? "Active" : "No activity",
			icon: <Activity size={12} strokeWidth={2} />,
		},
	];

	return (
		<Suspense fallback={<div className="flex items-center justify-center h-full"><div className="text-sm text-gray-500 animate-pulse">Loading...</div></div>}>
			<div className="flex flex-col h-full p-4 overflow-y-auto bg-dark-800">
				{/* Stats Grid */}
				<div className="grid grid-cols-4 gap-4 mb-6">
					{statCards.map((stat) => (
						<StatCard key={stat.title} {...stat} status={stat.status as any} />
					))}
				</div>

				{/* Main Content Grid */}
				<div className="grid grid-cols-12 gap-4">
					{/* Wallets List - Left Side */}
					<div className="col-span-12 lg:col-span-5">
						<DashboardCardWrapper className="h-[calc(100vh-240px)]">
							<div className="flex items-center justify-between p-4">
								<div className="flex items-center gap-3">
									<Wallet size={16} className="text-blue-400" />
									<div>
										<h3 className="text-sm uppercase tracking-wider text-gray-300">
											Wallet Directory
										</h3>
										<p className="text-xs text-gray-600 mt-0.5">
											{walletData?.total ?? 0} {walletType} wallets
										</p>
									</div>
								</div>
								<div className="flex gap-2">
									<CWButton
										variant="ghost"
										size="sm"
										onClick={() => refreshWallets()}
									>
										<RefreshCcw size={14} />
									</CWButton>
									<CWButton 
										variant="secondary" 
										size="sm"
										onClick={() => setShowCreateModal(true)}
									>
										<Plus size={14} className="mr-1" />
										New
									</CWButton>
								</div>
							</div>

							{/* Wallet Type Tabs */}
							<div className="flex gap-2 px-4 pb-4">
								<button
									onClick={() => setWalletType("standard")}
									className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
										walletType === "standard"
											? "bg-blue-500/20 text-blue-400"
											: "bg-dark-600/30 text-gray-500 hover:bg-dark-600/50"
									}`}
								>
									Standard
								</button>
								<button
									onClick={() => setWalletType("institutional")}
									className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
										walletType === "institutional"
											? "bg-purple-500/20 text-purple-400"
											: "bg-dark-600/30 text-gray-500 hover:bg-dark-600/50"
									}`}
								>
									Institutional
								</button>
							</div>

							<div className="overflow-y-auto h-[calc(100%-140px)] custom-scrollbar">
								{walletError ? (
									<div className="p-4 text-sm text-red-400">
										Failed to load wallets
									</div>
								) : walletItems.length === 0 ? (
									<div className="p-8 text-center text-gray-600">
										<Wallet size={32} className="mx-auto mb-3 opacity-30" />
										<p className="text-sm">No wallets found</p>
									</div>
								) : (
									<div className="p-2 space-y-2">
										{walletItems.map((wallet) => {
											const institutional = isInstitutionalWallet(wallet);
											const assets = getInstitutionalAssets(wallet);
											
											return (
												<button
													key={wallet.id}
													onClick={() => setSelectedWalletId(wallet.id)}
													className={`w-full text-left p-3 rounded-lg transition-all ${
														wallet.id === selectedWalletId
															? "bg-blue-500/10"
															: "bg-dark-600/30 hover:bg-dark-600/50"
													}`}
												>
													<div className="flex items-center justify-between mb-2">
														<div className="flex items-center gap-2">
															<span className="text-xs text-blue-400 uppercase">
																{chainLabel(wallet.chain)}
															</span>
															{institutional && (
																<span className="px-2 py-0.5 rounded text-[10px] uppercase bg-purple-500/10 text-purple-400">
																	INST
																</span>
															)}
														</div>
														<span className="text-xs text-gray-600">
															{wallet.createdAt
																? new Date(wallet.createdAt).toLocaleDateString()
																: "-"}
														</span>
													</div>
													<div className="text-sm text-gray-300 mb-1">
														{shorten(wallet.address, 10, 8)}
													</div>
													{wallet.label && (
														<div className="text-xs text-gray-500">
															{wallet.label}
														</div>
													)}
													{institutional && assets.length > 0 && (
														<div className="text-xs text-purple-400 mt-1">
															Assets: {assets.join(", ")}
														</div>
													)}
													{wallet.walletVirtualOwner && (
														<div className="text-xs text-gray-600 mt-1">
															Owner: {wallet.walletVirtualOwner}
														</div>
													)}
												</button>
											);
										})}
									</div>
								)}
							</div>
						</DashboardCardWrapper>
					</div>

					{/* Incoming Transactions - Right Side */}
					<div className="col-span-12 lg:col-span-7">
						<DashboardCardWrapper className="h-[calc(100vh-240px)]">
							<div className="flex items-center justify-between p-4">
								<div className="flex items-center gap-3">
									<TrendingUp size={16} className="text-green-400" />
									<div>
										<h3 className="text-sm uppercase tracking-wider text-gray-300">
											Incoming Transactions
										</h3>
										<p className="text-xs text-gray-600 mt-0.5">
											{selectedWallet
												? `${selectedWallet.label || shorten(selectedWallet.address, 8, 6)} (${chainLabel(selectedWallet.chain)})`
												: "Select a wallet to view transactions"}
										</p>
									</div>
								</div>
							</div>

							{/* Status Pills */}
							{incomingStats.total > 0 && (
								<div className="flex gap-2 px-4 pb-4">
									<div className="px-3 py-1.5 rounded-lg bg-green-500/10">
										<span className="text-xs text-green-400 font-mono">
											✓ {incomingStats.confirmed} Confirmed
										</span>
									</div>
									<div className="px-3 py-1.5 rounded-lg bg-yellow-500/10">
										<span className="text-xs text-yellow-400 font-mono">
											⏳ {incomingStats.pending} Pending
										</span>
									</div>
									{incomingStats.failed > 0 && (
										<div className="px-3 py-1.5 rounded-lg bg-red-500/10">
											<span className="text-xs text-red-400 font-mono">
												✗ {incomingStats.failed} Failed
											</span>
										</div>
									)}
								</div>
							)}

							<div className="overflow-y-auto h-[calc(100%-140px)] custom-scrollbar">
								{!selectedWallet ? (
									<div className="p-8 text-center text-gray-600">
										<Activity size={32} className="mx-auto mb-3 opacity-30" />
										<p className="text-sm">Select a wallet to view transactions</p>
									</div>
								) : incomingItems.length === 0 ? (
									<div className="p-8 text-center text-gray-600">
										<Activity size={32} className="mx-auto mb-3 opacity-30" />
										<p className="text-sm">No incoming transactions</p>
									</div>
								) : (
									<div className="p-2 space-y-2">
										{incomingItems.map((tx, index) => {
											const statusColor =
												tx.status === "confirmed"
													? "green"
													: tx.status === "pending"
														? "yellow"
														: tx.status === "failed"
															? "red"
															: "gray";
											
											const statusBg = 
												tx.status === "confirmed"
													? "bg-green-500/10 text-green-400"
													: tx.status === "pending"
														? "bg-yellow-500/10 text-yellow-400"
														: tx.status === "failed"
															? "bg-red-500/10 text-red-400"
															: "bg-gray-500/10 text-gray-400";
											
											return (
												<div
													key={tx.id || tx.txHash || `${tx.chain}-${index}`}
													className="p-3 rounded-lg bg-dark-600/30 hover:bg-dark-600/50 transition-all"
												>
													<div className="flex items-center justify-between mb-2">
														<div className="flex items-center gap-2">
															<span
																className={`px-2 py-0.5 rounded text-[10px] uppercase ${statusBg}`}
															>
																{tx.status}
															</span>
															<span className="text-xs text-gray-500 font-mono">
																{chainLabel(tx.chain)}
															</span>
														</div>
														<span className="text-xs text-gray-600">
															{formatTimestamp(tx.timestamp)}
														</span>
													</div>
													<NumericFont className="text-lg font-bold text-gray-200 mb-1">
														{tx.amount} {tx.asset}
													</NumericFont>
													<div className="text-xs text-gray-500 font-mono">
														To: {shorten(tx.address, 10, 8)}
													</div>
													{tx.from && (
														<div className="text-xs text-gray-600 mt-1">
															From: {shorten(tx.from, 10, 8)}
														</div>
													)}
													{tx.txHash && (
														<div className="text-xs text-gray-700 mt-1 truncate">
															Tx: {tx.txHash}
														</div>
													)}
												</div>
											);
										})}
									</div>
								)}
							</div>
						</DashboardCardWrapper>
					</div>
				</div>

				{/* Create Wallet Modal */}
				{showCreateModal && (
					<div
						className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
						onClick={() => setShowCreateModal(false)}
					>
						<div 
							onClick={(e) => e.stopPropagation()}
							className="w-full max-w-md"
						>
							<DashboardCardWrapper>
								<div className="flex items-center justify-between p-4">
									<div>
										<h3 className="text-sm uppercase tracking-wider text-gray-300">
											Create {walletType === "institutional" ? "Institutional" : "Standard"} Wallet
										</h3>
										<p className="text-xs text-gray-600 mt-0.5">
											Generate a new wallet address
										</p>
									</div>
									<CWButton 
										variant="ghost" 
										size="sm" 
										onClick={() => setShowCreateModal(false)}
									>
										<X size={14} />
									</CWButton>
								</div>

								<form onSubmit={async (e) => {
									e.preventDefault();
									setCreateStatus("saving");
									setCreateError("");
									
									try {
										const endpoint = walletType === "institutional" 
											? "/api/wallet-flow/institutional/wallets"
											: "/api/wallet-flow/wallets";
										
										const payload: any = {
											chain: createChain,
											label: createLabel || undefined,
										};
										
										if (walletType === "institutional" && createAssets) {
											const assets = createAssets
												.split(",")
												.map((a) => a.trim().toUpperCase())
												.filter((a) => a.length > 0);
											if (assets.length > 0) {
												payload.assets = assets;
											}
										}
										
										const res = await fetch(endpoint, {
											method: "POST",
											headers: { "Content-Type": "application/json" },
											body: JSON.stringify(payload),
										});
										
										if (!res.ok) {
											const message = await res.text();
											throw new Error(message || "Failed to create wallet");
										}
										
										const created = await res.json();
										setSelectedWalletId(created.id);
										refreshWallets();
										setShowCreateModal(false);
										setCreateLabel("");
										setCreateAssets("");
										setCreateStatus("idle");
									} catch (err) {
										setCreateError(err instanceof Error ? err.message : "Request failed");
										setCreateStatus("error");
									}
								}} className="p-4 space-y-4">
									<CWSelect
										label="Chain"
										value={createChain}
										onChange={(e) => setCreateChain(e.target.value)}
										options={SUPPORTED_CHAINS}
										selectSize="lg"
									/>
									
									<CWInput
										label="Label (optional)"
										value={createLabel}
										onChange={(e) => setCreateLabel(e.target.value)}
										placeholder="my-wallet"
										inputSize="lg"
									/>
									
									{walletType === "institutional" && (
										<CWInput
											label="Allowed Assets (optional)"
											value={createAssets}
											onChange={(e) => setCreateAssets(e.target.value)}
											placeholder="SOL, USDC, ETH"
											inputSize="lg"
										/>
									)}
									
									{createError && (
										<div className="text-sm text-red-400 bg-red-500/10 p-3 rounded-lg">
											{createError}
										</div>
									)}
									
									<div className="flex gap-2 pt-2">
										<CWButton
											type="button"
											variant="secondary"
											size="lg"
											onClick={() => setShowCreateModal(false)}
											className="flex-1"
										>
											Cancel
										</CWButton>
										<CWButton
											type="submit"
											variant="primary"
											size="lg"
											disabled={createStatus === "saving"}
											className="flex-1"
										>
											{createStatus === "saving" ? "Creating..." : "Create"}
										</CWButton>
									</div>
								</form>
							</DashboardCardWrapper>
						</div>
					</div>
				)}
			</div>
		</Suspense>
	);
};

export const WalletFlow = withErrorBoundary(WalletFlowComponent, {
	title: "Wallet Flow",
});

export default WalletFlow;
