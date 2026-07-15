"use client";

import { useEffect, useRef, useState } from "react";
import Pusher from "pusher-js";
import confetti from "canvas-confetti";

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isRemoteAction = useRef(false);

  const [connected, setConnected] = useState(false);

  const VIDEO_URL = "https://pub-3e8297cefada4171991f496f1efec7ad.r2.dev/Saplant%C4%B1%20-%20FullHDFilmizle.mp4";
  const CHANNEL_NAME = "damlaflix-room";

  useEffect(() => {
    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!pusherKey || !pusherCluster) return;

    const pusher = new Pusher(pusherKey, {
      cluster: pusherCluster,
    });

    const channel = pusher.subscribe(CHANNEL_NAME);

    pusher.connection.bind("connected", () => {
      setConnected(true);
    });

    channel.bind("play", (data: { time: number }) => {
      if (videoRef.current) {
        isRemoteAction.current = true;
        videoRef.current.currentTime = data.time;
        videoRef.current.play().catch(() => {});
        // Bayrağı işlem tamamlandıktan sonra indiriyoruz
        setTimeout(() => { isRemoteAction.current = false; }, 300);
      }
    });

    channel.bind("pause", (data: { time: number }) => {
      if (videoRef.current) {
        isRemoteAction.current = true;
        videoRef.current.currentTime = data.time;
        videoRef.current.pause();
        setTimeout(() => { isRemoteAction.current = false; }, 300);
      }
    });

    channel.bind("seek", (data: { time: number }) => {
      if (videoRef.current) {
        isRemoteAction.current = true;
        videoRef.current.currentTime = data.time;
        setTimeout(() => { isRemoteAction.current = false; }, 300);
      }
    });

    channel.bind("popcorn", () => {
      triggerConfetti();
    });

    return () => {
      pusher.unsubscribe(CHANNEL_NAME);
    };
  }, []);

  const triggerConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.85 },
      colors: ["#f1c40f", "#e67e22", "#e74c3c", "#ffffff"],
    });
  };

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

  const handlePopcornClick = () => {
    triggerConfetti();
    sendSignal("popcorn", {});
  };

  const handlePlay = () => {
    if (isRemoteAction.current) return;
    if (videoRef.current) {
      sendSignal("play", { time: videoRef.current.currentTime });
    }
  };

  const handlePause = () => {
    if (isRemoteAction.current) return;
    if (videoRef.current) {
      sendSignal("pause", { time: videoRef.current.currentTime });
    }
  };

  const handleSeeked = () => {
    if (isRemoteAction.current) return;
    if (videoRef.current) {
      sendSignal("seek", { time: videoRef.current.currentTime });
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-between bg-zinc-950 text-zinc-100 p-4 sm:p-8 font-sans select-none overflow-hidden">
      {/* Üst Bar */}
      <header className="relative z-10 w-full max-w-5xl flex items-center justify-between py-4 border-b border-zinc-900">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-white">
            DAMLAFLIX
          </h1>
          <span className="text-rose-500 text-sm">❤️</span>
        </div>

        <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 bg-zinc-900/60 px-3 py-1 rounded-full border border-zinc-800">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          <span>{connected ? "Senkronize" : "Bağlanıyor..."}</span>
        </div>
      </header>

      {/* Video Oynatıcı & Mısır Butonu */}
      <div className="relative z-10 w-full max-w-5xl my-auto py-6 flex flex-col items-center gap-5">
        <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-zinc-800/80 bg-black shadow-2xl">
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

        {/* Mısır Butonu */}
        <button
          onClick={handlePopcornClick}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-200 font-medium rounded-full text-xs tracking-wide transition-all duration-200 active:scale-95 cursor-pointer"
        >
          <span className="text-base">🍿</span>
          <span>Mısır Patlat</span>
        </button>
      </div>

      {/* Alt Bilgi */}
      <footer className="relative z-10 w-full max-w-5xl text-center py-4 text-xs text-zinc-600 border-t border-zinc-900">
        damla eşşşeğiyle kaçak film izleyebilmek için | efe ❤️ damla
      </footer>
    </main>
  );
}