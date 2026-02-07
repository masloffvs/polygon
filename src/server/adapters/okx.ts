import { z } from "zod";
import { BaseAdapter } from "./base";

// OKX Order Book Schema
// https://www.okx.com/docs-v5/en/#order-book-trading-market-data-ws-order-book-channel
// {
//   "arg": {
//     "channel": "books",
//     "instId": "BTC-USDT"
//   },
//   "action": "update", // or "snapshot"
//   "data": [
//     {
//       "asks": [ ["41006.8", "0.62768565", "0", "1"] ],
//       "bids": [ ["41006.3", "0.04018783", "0", "2"] ],
//       "ts": "1626945539268",
//       "checksum": -63234914
//     }
//   ]
// }

const OrderBookEntry = z.tuple([
	z.string(), // Price
	z.string(), // Size
	z.string(), // Deprecated / Force liquidation
	z.string(), // Number of orders
]);

const OKXDataEntry = z
	.object({
		asks: z.array(OrderBookEntry),
		bids: z.array(OrderBookEntry),
		ts: z.string(),
		checksum: z.number().optional(),
	})
	.passthrough();

export const OKXBookSchema = z.object({
	arg: z.object({
		channel: z.string(),
		instId: z.string(),
	}),
	action: z.enum(["snapshot", "update"]).optional(),
	data: z.array(OKXDataEntry),
});

export type OKXBookEvent = z.infer<typeof OKXBookSchema>;

export class OKXAdapter extends BaseAdapter<OKXBookEvent> {
	name = "okx-adapter";
	description = "Validates OKX Order Book Data (books channel)";
	schema = OKXBookSchema;
}
