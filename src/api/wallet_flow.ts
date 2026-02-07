import { logger } from "../server/utils/logger";

const walletGatewayUrl =
	process.env.WALLET_GATEWAY_URL || "http://localhost:25960";

const buildGatewayUrl = (req: Request, path: string) => {
	const url = new URL(path, walletGatewayUrl);
	const incoming = new URL(req.url);
	if (incoming.search) {
		url.search = incoming.search;
	}
	return url;
};

const proxyRequest = async (
	req: Request,
	path: string,
	init?: RequestInit,
) => {
	try {
		const url = buildGatewayUrl(req, path);
		const res = await fetch(url, {
			headers: {
				Accept: "application/json",
				...(init?.headers ?? {}),
			},
			...init,
		});
		const contentType = res.headers.get("content-type") || "application/json";
		const body = await res.text();
		return new Response(body, {
			status: res.status,
			headers: { "Content-Type": contentType },
		});
	} catch (err) {
		logger.error({ err, path }, "Wallet gateway request failed");
		return new Response(
			JSON.stringify({ error: "Wallet gateway unavailable" }),
			{ status: 502, headers: { "Content-Type": "application/json" } },
		);
	}
};

export const getWalletFlowRoutes = () => ({
	"/api/wallet-flow/health": {
		async GET(req: Request) {
			return proxyRequest(req, "/health");
		},
	},

	"/api/wallet-flow/wallets": {
		async GET(req: Request) {
			return proxyRequest(req, "/wallets");
		},
		async POST(req: Request) {
			const body = await req.json();
			return proxyRequest(req, "/wallets", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
		},
	},

	"/api/wallet-flow/institutional/wallets": {
		async GET(req: Request) {
			return proxyRequest(req, "/institutional/wallets");
		},
		async POST(req: Request) {
			const body = await req.json();
			return proxyRequest(req, "/institutional/wallets", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
		},
	},

	"/api/wallet-flow/wallets/virtual-owned": {
		async POST(req: Request) {
			const body = await req.json();
			return proxyRequest(req, "/virtualOwned/wallets/create", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
		},
	},

	"/api/wallet-flow/wallets/:chain/:idOrAddress/balance": {
		async GET(req: Request) {
			const url = new URL(req.url);
			const parts = url.pathname.split("/").filter(Boolean);
			const walletIndex = parts.indexOf("wallets");
			const chain = walletIndex >= 0 ? parts[walletIndex + 1] : undefined;
			const idOrAddress = walletIndex >= 0 ? parts[walletIndex + 2] : undefined;
			if (!chain || !idOrAddress) {
				return new Response(
					JSON.stringify({ error: "chain and idOrAddress required" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}
			const path = `/wallets/${encodeURIComponent(chain)}/${encodeURIComponent(
				idOrAddress,
			)}/balance`;
			return proxyRequest(req, path);
		},
	},

	"/api/wallet-flow/transactions/incoming": {
		async GET(req: Request) {
			return proxyRequest(req, "/transactions/incoming");
		},
	},

	"/api/wallet-flow/virtual-owned/transactions/incoming": {
		async GET(req: Request) {
			return proxyRequest(req, "/virtualOwned/transactions/incoming");
		},
	},

	"/api/wallet-flow/transactions": {
		async POST(req: Request) {
			const body = await req.json();
			return proxyRequest(req, "/transactions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
		},
	},

	"/api/wallet-flow/transactions/refinance": {
		async POST(req: Request) {
			const body = await req.json();
			return proxyRequest(req, "/transactions/refinance", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
		},
	},

	"/api/wallet-flow/transactions/refinanceTransfer": {
		async POST(req: Request) {
			const body = await req.json();
			return proxyRequest(req, "/transactions/refinanceTransfer", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
		},
	},

	"/api/wallet-flow/transactions/:chain/:txnId": {
		async GET(req: Request) {
			const url = new URL(req.url);
			const parts = url.pathname.split("/");
			const txnId = parts.pop();
			const chain = parts.pop();
			if (!chain || !txnId) {
				return new Response(
					JSON.stringify({ error: "chain and txnId required" }),
					{ status: 400, headers: { "Content-Type": "application/json" } },
				);
			}
			const path = `/transactions/${encodeURIComponent(
				chain,
			)}/${encodeURIComponent(txnId)}`;
			return proxyRequest(req, path);
		},
	},
});
