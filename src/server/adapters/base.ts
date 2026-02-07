import type { z } from "zod";

export interface DataAdapter<T = any> {
	name: string;
	description: string;
	schema: z.ZodSchema<T>;
	validate(data: unknown): T | null;
}

export abstract class BaseAdapter<T> implements DataAdapter<T> {
	abstract name: string;
	abstract description: string;
	abstract schema: z.ZodSchema<T>;

	public validate(data: unknown): T | null {
		const result = this.schema.safeParse(data);
		if (result.success) {
			return result.data;
		}
		return null;
	}
}
