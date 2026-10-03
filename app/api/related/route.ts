import { NextResponse } from "next/server";

// Resmi YouTube API anahtarı gerektirmeden, açık Piped/Invidious sunucularından
// "ilgili videolar" çekilir. Biri çalışmazsa diğeri denenir.
interface Rec {
  id: string;
  title: string;
  author: string;
  thumbnail: string;
}

const PIPED = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.private.coffee",
];
const INVIDIOUS = ["https://yewtu.be", "https://inv.nadeko.net", "https://invidious.nerdvpn.de"];

async function fetchJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function fromPiped(base: string, id: string): Promise<Rec[]> {
  const data = await fetchJson(`${base}/streams/${id}`);
  const list: Rec[] = (data.relatedStreams || [])
    .filter((s: any) => s.type === "stream" && typeof s.url === "string" && s.url.includes("v="))
    .map((s: any) => {
      const vid = s.url.split("v=")[1].split("&")[0];
      return {
        id: vid,
        title: s.title,
        author: s.uploaderName || "",
        thumbnail: `https://img.youtube.com/vi/${vid}/mqdefault.jpg`,
      };
    });
  if (!list.length) throw new Error("empty");
  return list;
}

async function fromInvidious(base: string, id: string): Promise<Rec[]> {
  const data = await fetchJson(`${base}/api/v1/videos/${id}?fields=recommendedVideos`);
  const list: Rec[] = (data.recommendedVideos || [])
    .filter((s: any) => s.videoId)
    .map((s: any) => ({
      id: s.videoId,
      title: s.title,
      author: s.author || "",
      thumbnail: `https://img.youtube.com/vi/${s.videoId}/mqdefault.jpg`,
    }));
  if (!list.length) throw new Error("empty");
  return list;
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[\w-]{11}$/.test(id)) {
    return NextResponse.json({ items: [] }, { status: 400 });
  }
  try {
    const items = await Promise.any([
      ...PIPED.map((b) => fromPiped(b, id)),
      ...INVIDIOUS.map((b) => fromInvidious(b, id)),
    ]);
    return NextResponse.json({ items: items.slice(0, 12) });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
