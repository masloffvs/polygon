// src/server/integrations/oklink/types.ts

export interface NFTTransfer {
	txhash: string;
	blockHash: string;
	blockHeight: number;
	blocktime: number;
	from: string;
	to: string;
	tokenContractAddress: string;
	tokenId: string;
	tokenIdLogo: string;
	logoUrl: string;
	symbol: string;
	isRiskStablecoin: boolean;
	isRiskToken: boolean;
	tokenType: string;
	value: number;
	realValue: number;
	fromTokenUrl: string;
	toTokenUrl: string;
	coinName: string;
	isFromRisk: boolean;
	isToRisk: boolean;
	methodId?: string;
	method?: string;
}

export interface OKLinkResponse {
	code: number;
	msg: string;
	detailMsg: string;
	data: {
		total: number;
		hits: NFTTransfer[];
	};
}
