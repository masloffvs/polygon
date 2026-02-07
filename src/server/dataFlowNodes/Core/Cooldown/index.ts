import { StatefulNode, type ProcessingContext } from "../../../dataflow/Node";
import type {
	DataPacket,
	ErrorPacket,
	NodeManifest,
} from "../../../dataflow/types";
import meta from "./schema.json";

interface CooldownState {
	lastTriggerTime: number | null;
	isOnCooldown: boolean;
}

export class CooldownNode extends StatefulNode {
	public readonly manifest = meta as NodeManifest;

	public async process(
		inputs: Record<string, DataPacket>,
		context: ProcessingContext,
	): Promise<Record<string, DataPacket> | ErrorPacket> {
		const inputPacket = inputs.input;
		const resetSignal = inputs.reset;

		if (!inputPacket) {
			return {
				code: "MISSING_INPUT",
				message: "Required input 'input' not found.",
				nodeId: this.id,
				traceId: context.traceId,
				timestamp: Date.now(),
				recoverable: false,
			};
		}

		const cooldownMs = this.config.cooldownMs || 5000;
		const now = Date.now();

		// Получаем текущее состояние
		let state: CooldownState = await this.getState("cooldown");
		if (!state) {
			state = {
				lastTriggerTime: null,
				isOnCooldown: false,
			};
		}

		// Обработка сигнала сброса
		if (resetSignal) {
			context.logger.info("Cooldown reset triggered", { nodeId: this.id });
			state.lastTriggerTime = null;
			state.isOnCooldown = false;
			await this.setState("cooldown", state);
		}

		// Проверяем, истек ли кулдаун
		if (state.lastTriggerTime && now - state.lastTriggerTime < cooldownMs) {
			// Кулдаун активен - перенаправляем в blocked output
			const remainingMs = cooldownMs - (now - state.lastTriggerTime);
			context.logger.info("Cooldown active, blocking data", {
				nodeId: this.id,
				remainingMs,
			});

			return {
				blocked: inputPacket.cloneWith(
					{
						...inputPacket.value,
						_cooldown: {
							active: true,
							remainingMs,
							totalMs: cooldownMs,
						},
					},
					this.id,
				),
			};
		}

		// Кулдаун неактивен - пропускаем данные и активируем кулдаун
		state.lastTriggerTime = now;
		state.isOnCooldown = true;
		await this.setState("cooldown", state);

		context.logger.info("Data passed through, cooldown activated", {
			nodeId: this.id,
			cooldownMs,
		});

		return {
			output: inputPacket.cloneWith(
				{
					...inputPacket.value,
					_cooldown: {
						active: false,
						activatedAt: now,
						durationMs: cooldownMs,
					},
				},
				this.id,
			),
		};
	}

	/**
	 * Метод для получения текущего статуса кулдауна (для UI)
	 */
	public async getCooldownStatus(): Promise<{
		isActive: boolean;
		remainingMs: number;
		totalMs: number;
	}> {
		const state: CooldownState = await this.getState("cooldown");
		const cooldownMs = this.config.cooldownMs || 5000;

		if (!state || !state.lastTriggerTime) {
			return {
				isActive: false,
				remainingMs: 0,
				totalMs: cooldownMs,
			};
		}

		const now = Date.now();
		const elapsed = now - state.lastTriggerTime;
		const remaining = Math.max(0, cooldownMs - elapsed);

		return {
			isActive: remaining > 0,
			remainingMs: remaining,
			totalMs: cooldownMs,
		};
	}

	/**
	 * Метод для ручного сброса кулдауна
	 */
	public async resetCooldown(): Promise<void> {
		await this.setState("cooldown", {
			lastTriggerTime: null,
			isOnCooldown: false,
		});
	}
}
