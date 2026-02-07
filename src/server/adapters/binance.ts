import { z } from "zod";
import { BaseAdapter } from "./base";

// Binance Depth Stream Schema
// Event format:
// {
//   "e": "depthUpdate", // Event type
//   "E": 123456789,     // Event time
//   "s": "BNBBTC",      // Symbol
//   "U": 157,           // First update ID in event
//   "u": 160,           // Final update ID in event
//   "b": [              // Bids to be updated
//     [
//       "0.0024",       // Price level to be updated
//       "10"            // Quantity
//     ]
//   ],
//   "a": [              // Asks to be updated
//     [
//       "0.0026",       // Price level to be updated
//       "100"           // Quantity
//     ]
//   ]
// }

const OrderBookEntry = z.tuple([z.string(), z.string()]);

// Payload for Partial Depth Stream (snapshot)
const DepthPayloadSchema = z
	.object({
		lastUpdateId: z.number(),
		bids: z.array(OrderBookEntry),
		asks: z.array(OrderBookEntry),
	})
	.passthrough();

// Wrapper for Combined Streams
export const BinanceDepthSchema = z.object({
	stream: z.string(),
	data: DepthPayloadSchema,
});

export type BinanceDepthEvent = z.infer<typeof BinanceDepthSchema>;

export class BinanceAdapter extends BaseAdapter<BinanceDepthEvent> {
	name = "binance-adapter";
	description =
		"Validates Binance Partial Depth (depth20@100ms) from Combined Streams";
	schema = BinanceDepthSchema;

	// Optional: Custom normalization logic if we wanted to transform to a internal format here
	// But for now, just validation.
}
