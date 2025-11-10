import { NextResponse } from "next/server";
import { env } from "@/lib/env";

interface OpenSeaNftItem {
	identifier: string;
	collection?: string;
	contract: string;
}

interface OpenSeaResponse {
	next?: string | null;
	nfts: OpenSeaNftItem[];
}

const SLUG1 = "animata";
const SLUG2 = "regent-animata-ii";

export async function GET(req: Request) {
	try {
		const { searchParams } = new URL(req.url);
		const address = searchParams.get("address")?.toLowerCase();
		const collection = searchParams.get("collection")?.toLowerCase() ?? null;
		if (!address) {
			return NextResponse.json({ error: "Missing address" }, { status: 400 });
		}
		if (!env.OPENSEA_API_KEY) {
			return NextResponse.json({ error: "Server missing OPENSEA_API_KEY" }, { status: 500 });
		}

		const headers: HeadersInit = {
			"accept": "application/json",
			"x-api-key": env.OPENSEA_API_KEY,
		};

		async function fetchAllForCollection(slug: string): Promise<number[]> {
			const tokenIds: number[] = [];
			let cursor: string | null | undefined = null;
			let safety = 0;
			do {
				const url = new URL(`https://api.opensea.io/api/v2/chain/base/account/${address}/nfts`);
				url.searchParams.set("collection", slug);
				url.searchParams.set("limit", "100");
				if (cursor) url.searchParams.set("next", cursor);
				const res = await fetch(url.toString(), { headers, cache: "no-store" });
				if (!res.ok) {
					const text = await res.text();
					throw new Error(`OpenSea error ${res.status}: ${text}`);
				}
				const data = (await res.json()) as OpenSeaResponse;
				for (const n of data.nfts) {
					// Only accept exact collection slug matches if provided by API
					if (!n.collection || n.collection.toLowerCase() === slug.toLowerCase()) {
						const idNum = Number(n.identifier);
						if (Number.isFinite(idNum)) tokenIds.push(idNum);
					}
				}
				cursor = data.next ?? null;
				safety++;
			} while (cursor && safety < 10); // paginate defensively
			return tokenIds.sort((a, b) => a - b);
		}

		let c1: number[] = [];
		let c2: number[] = [];
		if (collection === SLUG1) {
			c1 = await fetchAllForCollection(SLUG1);
		} else if (collection === SLUG2) {
			c2 = await fetchAllForCollection(SLUG2);
		} else {
			[c1, c2] = await Promise.all([
				fetchAllForCollection(SLUG1),
				fetchAllForCollection(SLUG2),
			]);
		}

		return NextResponse.json({
			address,
			animata1: c1,
			animata2: c2,
		});
	} catch (err: unknown) {
		return NextResponse.json(
			{ error: (err as Error)?.message ?? "unknown error" },
			{ status: 500 },
		);
	}
}


