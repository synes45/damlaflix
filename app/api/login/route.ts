import { NextResponse } from "next/server";

// PIN kontrolü sunucuda yapılır, PIN'ler tarayıcıya gönderilmez.
const PINS: Record<string, string> = {
  Efe: "2610",
  Damla: "1603",
};

export async function POST(req: Request) {
  try {
    const { profile, pin } = await req.json();
    const ok =
      typeof profile === "string" &&
      typeof pin === "string" &&
      PINS[profile] !== undefined &&
      PINS[profile] === pin;

    if (!ok) {
      return NextResponse.json({ success: false }, { status: 401 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
