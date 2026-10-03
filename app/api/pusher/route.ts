import { NextResponse } from "next/server";
import Pusher from "pusher";

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
  useTLS: true,
});

export async function POST(req: Request) {
  try {
    const { channel, event, data, socketId } = await req.json();

    // socketId verilirse gönderen kişiye geri yansıma (echo) olmaz.
    await pusher.trigger(
      channel,
      event,
      data,
      socketId ? { socket_id: socketId } : undefined
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Pusher Hatası:", error);
    return NextResponse.json({ success: false, error }, { status: 500 });
  }
}