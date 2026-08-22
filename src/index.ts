import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { GoogleHandler } from "./google-handler";

type Props = {
	name: string;
	email: string;
	accessToken: string;
};

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "Google Search Console",
		version: "1.0.0",
	});

	async init() {
		// Liste les propriétés Search Console accessibles
		this.server.tool(
			"list_search_console_sites",
			"Liste les sites Google Search Console accessibles par l'utilisateur.",
			{},
			async () => {
				const response = await fetch(
					"https://www.googleapis.com/webmasters/v3/sites",
					{
						headers: {
							Authorization: `Bearer ${this.props.accessToken}`,
						},
					},
				);

				if (!response.ok) {
					return {
						content: [
							{
								type: "text",
								text: `Erreur Google Search Console: ${response.status} ${await response.text()}`,
							},
						],
					};
				}

				const data = await response.json();

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(data, null, 2),
						},
					],
				};
			},
		);

		// Analyse les performances Search Console
		this.server.tool(
			"search_console_performance",
			"Récupère les performances Google Search Console : clics, impressions, CTR et position.",
			{
				siteUrl: z.string().describe(
					"URL exacte de la propriété Search Console, par exemple sc-domain:cyclesfayah.fr",
				),
				startDate: z.string().describe("Date de début YYYY-MM-DD"),
				endDate: z.string().describe("Date de fin YYYY-MM-DD"),
				dimensions: z
					.array(z.enum(["query", "page", "country", "device", "date"]))
					.optional()
					.describe("Dimensions à analyser"),
				rowLimit: z.number().int().min(1).max(25000).optional(),
			},
			async ({ siteUrl, startDate, endDate, dimensions, rowLimit }) => {
				const response = await fetch(
					`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
						siteUrl,
					)}/searchAnalytics/query`,
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${this.props.accessToken}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							startDate,
							endDate,
							dimensions: dimensions ?? ["query"],
							rowLimit: rowLimit ?? 1000,
						}),
					},
				);

				if (!response.ok) {
					return {
						content: [
							{
								type: "text",
								text: `Erreur Google Search Console: ${response.status} ${await response.text()}`,
							},
						],
					};
				}

				const data = await response.json();

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(data, null, 2),
						},
					],
				};
			},
		);
	}
}

export default new OAuthProvider({
	apiHandler: MyMCP.serve("/mcp"),
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GoogleHandler as any,
	tokenEndpoint: "/token",
});
