// app/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Pusher from "pusher-js";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isRemoteAction = useRef(false);

  const [connected, setConnected] = useState(false);

  const VIDEO_URL = "https://pub-3e8297cefada4171991f496f1efec7ad.r2.dev/Saplant%C4%B1%20-%20FullHDFilmizle.mp4";
  const CHANNEL_NAME = "damlaflix-room";

  useEffect(() => {
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channel = pusher.subscribe(CHANNEL_NAME);

    pusher.connection.bind("connected", () => {
      setConnected(true);
    });

    // Karşı taraftan gelen 'play' komutu
    channel.bind("play", (data: { time: number }) => {
      if (videoRef.current) {
        isRemoteAction.current = true;
        videoRef.current.currentTime = data.time;
        videoRef.current.play().catch(() => {});
      }
    });

    // Karşı taraftan gelen 'pause' komutu
    channel.bind("pause", (data: { time: number }) => {
      if (videoRef.current) {
        isRemoteAction.current = true;
        videoRef.current.currentTime = data.time;
        videoRef.current.pause();
      }
    });

    // Karşı taraftan gelen 'seek' komutu
    channel.bind("seek", (data: { time: number }) => {
      if (videoRef.current) {
        isRemoteAction.current = true;
        videoRef.current.currentTime = data.time;
      }
    });

    return () => {
      pusher.unsubscribe(CHANNEL_NAME);
    };
  }, []);

  const sendSignal = async (event: string, data: any) => {
    try {
      await fetch("/api/pusher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: CHANNEL_NAME,
          event,
          data,
        }),
      });
    } catch (error) {
      console.error("Sinyal gönderilemedi:", error);
    }
  };

  const handlePlay = () => {
    if (isRemoteAction.current) {
      isRemoteAction.current = false;
      return;
    }
    if (videoRef.current) {
      sendSignal("play", { time: videoRef.current.currentTime });
    }
  };

  const handlePause = () => {
    if (isRemoteAction.current) {
      isRemoteAction.current = false;
      return;
    }
    if (videoRef.current) {
      sendSignal("pause", { time: videoRef.current.currentTime });
    }
  };

  const handleSeeked = () => {
    if (isRemoteAction.current) {
      isRemoteAction.current = false;
      return;
    }
    if (videoRef.current) {
      sendSignal("seek", { time: videoRef.current.currentTime });
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between bg-black text-zinc-100 p-4 sm:p-8 font-sans select-none">
      {/* Üst Bar */}
      <header className="w-full max-w-5xl flex items-center justify-between py-4 border-b border-zinc-900">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-white">
            DAMLAFLIX
          </h1>
          <span className="text-rose-500 text-sm">❤️</span>
        </div>

        <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          <span>{connected ? "Senkronize" : "Bağlanıyor..."}</span>
        </div>
      </header>

      {/* Video Oynatıcı */}
      <div className="w-full max-w-5xl my-auto py-6 flex flex-col items-center">
        <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-zinc-900 bg-zinc-950 shadow-2xl">
          <video
            ref={videoRef}
            src={VIDEO_URL}
            controls
            className="w-full h-full object-contain"
            onPlay={handlePlay}
            onPause={handlePause}
            onSeeked={handleSeeked}
          />
        </div>
      </div>

      {/* Alt Bilgi */}
      <footer className="w-full max-w-5xl text-center py-4 text-xs text-zinc-600 border-t border-zinc-900">
        Watch Party
      </footer>
    </main>
  );
}