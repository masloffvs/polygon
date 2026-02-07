export interface UserInfo {
	address: string;
	name?: string;
	followerCount?: number;
}

export interface Position {
	conditionId: string;
	asset: string;
	title: string;
	size: number;
	price: number;
	value: number;
	symbol: string;
	outcomeIndex: number;
}

export interface Activity {
	id: string;
	type: "buy" | "sell" | "redeem" | "split" | "merge";
	asset: string;
	title: string;
	amount: number;
	price?: number;
	timestamp: number;
	txHash?: string;
}

export interface BaseEvent {
	user: string;
	userInfo: UserInfo;
	timestamp: Date;
}

export interface PositionStateEvent extends BaseEvent {
	type: "new" | "removed" | "update";
	newPositions?: Position[];
	removedPositions?: Position[];
	positions?: Position[]; // For update
}

export interface ErrorStateEvent extends BaseEvent {
	type: "error";
	error: Error;
}

export interface ActivityStateEvent extends BaseEvent {
	type: "activity";
	activities: Activity[];
}

export type PositionEvent =
	| PositionStateEvent
	| ErrorStateEvent
	| ActivityStateEvent;
