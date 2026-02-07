export const getGeneralRoutes = () => ({
	"/api/hello": {
		async GET() {
			return Response.json({ message: "Hello from API" });
		},
	},
});
