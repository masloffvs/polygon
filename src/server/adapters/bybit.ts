import { z } from "zod";
import { BaseAdapter } from "./base";

// Bybit Order Book V5 Schema
// https://bybit-exchange.github.io/docs/v5/websocket/public/orderbook
// {
//     "topic": "orderbook.50.BTCUSDT",
//     "type": "snapshot", // "snapshot" or "delta"
//     "ts": 1672304484978,
//     "data": {
//         "s": "BTCUSDT",
//         "b": [ ["16628.00", "0.0125"] ],
//         "a": [ ["16628.50", "0.0768"] ],
//         "u": 234,
//         "seq": 66
//     },
//     "cts": 1672304240012
// }

const OrderBookEntry = z.tuple([
	z.string(), // Price
	z.string(), // Size
]);

const BybitDataSchema = z
	.object({
		s: z.string(), // Symbol
		b: z.array(OrderBookEntry), // Bids
		a: z.array(OrderBookEntry), // Asks
		u: z.number().optional(), // Update ID
		seq: z.number().optional(), // Cross sequence
	})
	.passthrough();

export const BybitBookSchema = z
	.object({
		topic: z.string(),
		type: z.enum(["snapshot", "delta"]),
		ts: z.number(),
		data: BybitDataSchema,
		cts: z.number().optional(),
	})
	.passthrough();

export type BybitBookEvent = z.infer<typeof BybitBookSchema>;

export class BybitAdapter extends BaseAdapter<BybitBookEvent> {
	name = "bybit-adapter";
	description = "Validates Bybit Order Book Data (orderbook.50)";
	schema = BybitBookSchema;
}
