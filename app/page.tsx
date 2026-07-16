"use client";

import React, { useEffect, useRef, useState } from "react";
import Pusher from "pusher-js";
import confetti from "canvas-confetti";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const isRemoteAction = useRef(false);

  const [connected, setConnected] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [isYouTube, setIsYouTube] = useState(false);

  const CHANNEL_NAME = "damlaflix-room";

  const getYouTubeId = (url: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  const ytVideoId = getYouTubeId(videoUrl);

  useEffect(() => {
    setIsYouTube(!!ytVideoId);
  }, [videoUrl, ytVideoId]);

  useEffect(() => {
    if (isYouTube && ytVideoId) {
      if (!window.YT) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        const firstScriptTag = document.getElementsByTagName("script")[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

        window.onYouTubeIframeAPIReady = () => {
          initYTPlayer(ytVideoId);
        };
      } else {
        initYTPlayer(ytVideoId);
      }
    }
  }, [isYouTube, videoUrl, ytVideoId]);

  const initYTPlayer = (videoId: string) => {
    if (ytPlayerRef.current) {
      ytPlayerRef.current.loadVideoById(videoId);
      return;
    }

    ytPlayerRef.current = new window.YT.Player("yt-player", {
      videoId: videoId,
      playerVars: {
        autoplay: 0,
        controls: 1,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onStateChange: handleYTStateChange,
      },
    });
  };

  const handleYTStateChange = (event: any) => {
    if (isRemoteAction.current) return;

    if (event.data === 1) {
      const currentTime = ytPlayerRef.current.getCurrentTime();
      sendSignal("play", { time: currentTime });
    } else if (event.data === 2) {
      const currentTime = ytPlayerRef.current.getCurrentTime();
      sendSignal("pause", { time: currentTime });
    }
  };

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
      isRemoteAction.current = true;
      if (isYouTube && ytPlayerRef.current) {
        ytPlayerRef.current.seekTo(data.time, true);
        ytPlayerRef.current.playVideo();
      } else if (videoRef.current) {
        videoRef.current.currentTime = data.time;
        videoRef.current.play().catch(() => {});
      }
      setTimeout(() => { isRemoteAction.current = false; }, 400);
    });

    channel.bind("pause", (data: { time: number }) => {
      isRemoteAction.current = true;
      if (isYouTube && ytPlayerRef.current) {
        ytPlayerRef.current.seekTo(data.time, true);
        ytPlayerRef.current.pauseVideo();
      } else if (videoRef.current) {
        videoRef.current.currentTime = data.time;
        videoRef.current.pause();
      }
      setTimeout(() => { isRemoteAction.current = false; }, 400);
    });

    channel.bind("seek", (data: { time: number }) => {
      isRemoteAction.current = true;
      if (isYouTube && ytPlayerRef.current) {
        ytPlayerRef.current.seekTo(data.time, true);
      } else if (videoRef.current) {
        videoRef.current.currentTime = data.time;
      }
      setTimeout(() => { isRemoteAction.current = false; }, 400);
    });

    channel.bind("change-video", (data: { url: string }) => {
      setVideoUrl(data.url);
    });

    channel.bind("popcorn", () => {
      triggerConfetti();
    });

    return () => {
      pusher.unsubscribe(CHANNEL_NAME);
    };
  }, [isYouTube]);

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

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    setVideoUrl(inputUrl);
    sendSignal("change-video", { url: inputUrl });
    setInputUrl("");
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
      {/* Arka Plan Koyu Kırmızı Glow Efekti */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-rose-950/20 rounded-full blur-[120px] pointer-events-none" />

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

      {/* Kontroller & Video Ekranı */}
      <div className="relative z-10 w-full max-w-5xl my-auto py-6 flex flex-col items-center gap-5">
        <form onSubmit={handleUrlSubmit} className="w-full flex gap-2">
          <input
            type="text"
            placeholder="YouTube linki veya MP4 URL yapıştır..."
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            className="flex-1 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 text-xs px-4 py-2.5 rounded-xl focus:outline-none focus:border-rose-900/60 text-zinc-200 placeholder-zinc-500 transition-colors"
          />
          <button
            type="submit"
            className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium px-4 py-2.5 rounded-xl transition-all cursor-pointer"
          >
            Aç
          </button>
        </form>

        <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-zinc-800/80 bg-zinc-950/80 backdrop-blur-sm shadow-2xl flex items-center justify-center">
          {!videoUrl ? (
            <div className="flex flex-col items-center gap-2 text-zinc-600">
              <span className="text-3xl">🎬</span>
              <p className="text-xs font-medium">video seç askm</p>
            </div>
          ) : isYouTube ? (
            <div id="yt-player" className="w-full h-full" />
          ) : (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              crossOrigin="anonymous"
              className="w-full h-full object-contain"
              onPlay={handlePlay}
              onPause={handlePause}
              onSeeked={handleSeeked}
            />
          )}
        </div>

        <button
          onClick={handlePopcornClick}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 hover:border-rose-950/80 text-zinc-200 font-medium rounded-full text-xs tracking-wide transition-all duration-200 active:scale-95 cursor-pointer backdrop-blur-md"
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