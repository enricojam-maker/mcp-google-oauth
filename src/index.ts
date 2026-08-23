import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { GoogleHandler } from "./google-handler";

type Props = {
	name: string;
	email: string;
	accessToken: string;
} & Record<string, unknown>;

const GSC_BASE = "https://www.googleapis.com/webmasters/v3";

export class MyMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "Google Search Console",
		version: "1.1.0",
	});

	private text(value: string) {
		return { content: [{ type: "text" as const, text: value }] };
	}

	private async gscFetch(url: string, init?: RequestInit) {
		const response = await fetch(url, {
			...init,
			headers: {
				Authorization: `Bearer ${this.props.accessToken}`,
				...(init?.headers ?? {}),
			},
		});

		if (!response.ok) {
			const detail = await response.text();
			throw new Error(`Search Console ${response.status} — ${detail}`);
		}

		return response.json();
	}

	async init() {
		// Liste les propriétés Search Console accessibles
		this.server.tool(
			"list_search_console_sites",
			"Liste les propriétés Google Search Console accessibles par l'utilisateur.",
			{},
			async () => {
				try {
					const data: any = await this.gscFetch(`${GSC_BASE}/sites`);
					const sites = (data.siteEntry ?? []).map((s: any) => ({
						siteUrl: s.siteUrl,
						permissionLevel: s.permissionLevel,
					}));

					if (sites.length === 0) {
						return this.text(
							"Aucune propriété Search Console associée à ce compte Google.",
						);
					}

					return this.text(JSON.stringify(sites, null, 2));
				} catch (error) {
					return this.text(`Erreur : ${(error as Error).message}`);
				}
			},
		);

		// Analyse les performances Search Console
		this.server.tool(
			"search_console_performance",
			"Performances Google Search Console : clics, impressions, CTR et position moyenne.",
			{
				siteUrl: z
					.string()
					.describe(
						"URL exacte de la propriété, par exemple sc-domain:cyclesfayah.fr",
					),
				startDate: z.string().describe("Date de début au format YYYY-MM-DD"),
				endDate: z.string().describe("Date de fin au format YYYY-MM-DD"),
				dimensions: z
					.array(z.enum(["query", "page", "country", "device", "date"]))
					.optional()
					.describe("Dimensions à analyser. Par défaut : query"),
				rowLimit: z
					.number()
					.int()
					.min(1)
					.max(25000)
					.optional()
					.describe("Nombre de lignes. Par défaut : 1000"),
			},
			async ({ siteUrl, startDate, endDate, dimensions, rowLimit }) => {
				try {
					const data: any = await this.gscFetch(
						`${GSC_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								startDate,
								endDate,
								dimensions: dimensions ?? ["query"],
								rowLimit: rowLimit ?? 1000,
							}),
						},
					);

					const rows = data.rows ?? [];

					if (rows.length === 0) {
						return this.text(
							`Aucune donnée pour ${siteUrl} entre ${startDate} et ${endDate}.`,
						);
					}

					return this.text(JSON.stringify(rows, null, 2));
				} catch (error) {
					return this.text(`Erreur : ${(error as Error).message}`);
				}
			},
		);

		// Détail d'indexation d'une URL
		this.server.tool(
			"inspect_url",
			"Inspecte l'état d'indexation d'une URL précise dans Google.",
			{
				siteUrl: z
					.string()
					.describe("Propriété Search Console, ex: sc-domain:cyclesfayah.fr"),
				inspectionUrl: z
					.string()
					.describe("URL complète à inspecter, ex: https://cyclesfayah.fr/faq/"),
			},
			async ({ siteUrl, inspectionUrl }) => {
				try {
					const data: any = await this.gscFetch(
						"https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({
								siteUrl,
								inspectionUrl,
								languageCode: "fr",
							}),
						},
					);

					return this.text(JSON.stringify(data, null, 2));
				} catch (error) {
					return this.text(`Erreur : ${(error as Error).message}`);
				}
			},
		);
	}
}

export default new OAuthProvider({
	apiHandler: MyMCP.serve("/mcp") as any,
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GoogleHandler as any,
	tokenEndpoint: "/token",
});
