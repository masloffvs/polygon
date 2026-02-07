import { configManager } from "../server/services/config_manager";

export const getConfigRoutes = () => ({
	"/api/config": {
		async GET(req: Request) {
			const url = new URL(req.url);
			const format = url.searchParams.get("format");

			try {
				if (format === "json") {
					const config = configManager.getConfig();
					return Response.json(config);
				}

				const yamlStr = await configManager.getRawYaml();
				return new Response(yamlStr, {
					headers: { "Content-Type": "text/yaml" },
				});
			} catch (_err) {
				return new Response("Failed to load config", { status: 500 });
			}
		},
		async POST(req: Request) {
			try {
				const _contentType = req.headers.get("Content-Type") || "";
				const body = await req.text();

				// If JSON content type, we might want to parse it to ensure it's valid JSON before passing to update
				// But configManager.update handles string (as YAML) or object.
				// If we send JSON string, yaml.load(jsonString) works.

				await configManager.update(body);
				return Response.json({ success: true });
			} catch (err: any) {
				return Response.json(
					{ success: false, error: err.message },
					{ status: 400 },
				);
			}
		},
	},
});
