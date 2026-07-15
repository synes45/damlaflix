import { NextResponse } from "next/server";
import Pusher from "pusher";

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || "",
  key: process.env.NEXT_PUBLIC_PUSHER_KEY || "",
  secret: process.env.PUSHER_SECRET || "",
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "",
  useTLS: true,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { channel, event, data } = body;

    await pusher.trigger(channel, event, data);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Pusher Trigger Hatası:", error);
    return NextResponse.json(
      { error: "Pusher trigger failed", details: error.message || error },
      { status: 500 }
    );
  }
}