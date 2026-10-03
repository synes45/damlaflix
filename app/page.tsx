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

interface WatchlistItem {
  id: string;
  title: string;
  url: string;
  thumbnail?: string | null;
}

interface HistoryItem {
  id: string;
  title: string;
  url: string;
  thumbnail?: string | null;
  at: number;
  by: string;
}

interface ChatMessage {
  id: string;
  from: string;
  text: string;
  at: number;
  system?: boolean;
}

interface PeerStatus {
  from: string;
  url: string;
  time: number;
  playing: boolean;
  ready: boolean;
  bufferingMs: number;
  receivedAt: number;
}

interface PeerInfo {
  seen: boolean;
  online: boolean;
  diff: number | null; // peerTime - myTime (saniye)
  buffering: boolean;
  ready: boolean;
  sameVideo: boolean;
  myTime: number | null; // kendi saniyem
  peerTime: number | null; // karşı tarafın saniyesi
}

const LOCAL_STORAGE_KEY = "damlaflix_watchlist";
const HISTORY_KEY_PREFIX = "damlaflix_history_";
const PROFILE_SESSION_KEY = "damlaflix_profile";
const CHANNEL_NAME = "damlaflix-room";

const PROFILES = ["Efe", "Damla"] as const;
type ProfileName = (typeof PROFILES)[number];

const AVATAR_STYLES: Record<ProfileName, string> = {
  Efe: "bg-sky-900 border-sky-800",
  Damla: "bg-rose-900 border-rose-800",
};

const LOCATIVE: Record<string, string> = { Efe: "Efe'de", Damla: "Damla'da" };
const GENITIVE: Record<string, string> = { Efe: "Efe'nin", Damla: "Damla'nın" };

const HEARTBEAT_MS = 3000;
const OFFLINE_AFTER_S = 10;
const LAG_THRESHOLD_S = 3;

const getYouTubeId = (url: string) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

const mediaKey = (url: string) => (url ? getYouTubeId(url) || url : "");

const fmtTime = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? h + ":" : ""}${mm}:${String(sec).padStart(2, "0")}`;
};

const fetchVideoMetaData = async (url: string) => {
  const ytId = getYouTubeId(url);

  if (ytId) {
    const thumbnail = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
    try {
      const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${ytId}`);
      const data = await res.json();
      return {
        title: data.title || "YouTube Videosu",
        thumbnail,
      };
    } catch {
      return { title: "YouTube Videosu", thumbnail };
    }
  } else {
    let name = url.split("/").pop() || "Video";
    try {
      name = decodeURIComponent(name);
    } catch {}
    const cleanName = name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

    return {
      title: cleanName || "Video",
      thumbnail: null,
    };
  }
};

// YouTube IFrame API'yi tek sefer yükler; birden fazla çağrı güvenlidir.
let ytApiPromise: Promise<void> | null = null;
const loadYouTubeApi = (): Promise<void> => {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (!ytApiPromise) {
    ytApiPromise = new Promise<void>((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prev) prev();
        resolve();
      };
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    });
  }
  return ytApiPromise;
};

const WATCHLIST_REMOVED_KEY = "damlaflix_watchlist_removed";

const persistWatchlist = (list: WatchlistItem[]) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch (error) {
    console.error("Watchlist kaydedilemedi:", error);
  }
};

/* ------------------------------------------------------------------ */
/* Profil + PIN ekranı (Netflix tarzı)                                */
/* ------------------------------------------------------------------ */
function ProfileGate({ onUnlock }: { onUnlock: (name: ProfileName) => void }) {
  const [selected, setSelected] = useState<ProfileName | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selected) inputRef.current?.focus();
  }, [selected]);

  const submit = async (value: string, name: ProfileName) => {
    setChecking(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: name, pin: value }),
      });
      if (res.ok) {
        try {
          sessionStorage.setItem(PROFILE_SESSION_KEY, name);
        } catch {}
        onUnlock(name);
        return;
      }
    } catch {}
    setError(true);
    setPin("");
    setChecking(false);
    setTimeout(() => {
      setError(false);
      inputRef.current?.focus();
    }, 500);
  };

  const handleChange = (raw: string) => {
    if (checking || !selected) return;
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    setPin(digits);
    if (digits.length === 4) submit(digits, selected);
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100 p-4 sm:p-8 font-sans select-none overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-rose-950/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-10">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-white">DAMLAFLIX</h1>
          <span className="text-rose-500 text-sm">❤️</span>
        </div>

        {!selected ? (
          <>
            <h2 className="text-2xl font-semibold text-zinc-200">Kim izliyor?</h2>
            <div className="flex items-center gap-6 sm:gap-10">
              {PROFILES.map((name) => (
                <button
                  key={name}
                  onClick={() => setSelected(name)}
                  className="group flex flex-col items-center gap-3 cursor-pointer"
                >
                  <div
                    className={`w-24 h-24 sm:w-32 sm:h-32 rounded-2xl border flex items-center justify-center text-4xl font-bold text-white transition-all duration-200 group-hover:scale-105 group-hover:border-zinc-300 ${AVATAR_STYLES[name]}`}
                  >
                    {name[0]}
                  </div>
                  <span className="text-sm text-zinc-500 group-hover:text-zinc-100 transition-colors">
                    {name}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3">
              <div
                className={`w-16 h-16 rounded-2xl border flex items-center justify-center text-2xl font-bold text-white ${AVATAR_STYLES[selected]}`}
              >
                {selected[0]}
              </div>
              <h2 className="text-lg font-semibold text-zinc-200">{selected} için PIN gir</h2>
            </div>

            <div
              className={`relative flex gap-3 ${error ? "animate-pin-shake" : ""}`}
              onClick={() => inputRef.current?.focus()}
            >
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-12 h-14 sm:w-14 sm:h-16 rounded-xl border bg-zinc-900/80 backdrop-blur-md flex items-center justify-center text-2xl text-white transition-colors ${
                    error
                      ? "border-rose-600"
                      : i === pin.length
                        ? "border-rose-900/80"
                        : "border-zinc-800"
                  }`}
                >
                  {pin[i] ? "•" : ""}
                </div>
              ))}
              <input
                ref={inputRef}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pin}
                onChange={(e) => handleChange(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                aria-label="PIN"
              />
            </div>

            <p className={`text-xs h-4 ${error ? "text-rose-500" : "text-transparent"}`}>
              Yanlış PIN, tekrar dene
            </p>

            <button
              onClick={() => {
                setSelected(null);
                setPin("");
                setError(false);
              }}
              className="text-xs font-medium text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 px-4 py-2 rounded-full border border-zinc-800 transition-colors cursor-pointer"
            >
              ← Profil değiştir
            </button>
          </>
        )}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Ana uygulama                                                       */
/* ------------------------------------------------------------------ */
export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytHostRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement>(null);

  // Eş zamanlı izleme motoru durumu (render'dan bağımsız)
  const suppressUntil = useRef(0);
  const intentPlaying = useRef(false);
  const pendingRef = useRef<{ time: number; playing: boolean } | null>(null);
  const readyKeyRef = useRef("");
  const urlRef = useRef("");
  const profileRef = useRef<ProfileName | null>(null);
  const socketIdRef = useRef<string | null>(null);
  const peerRef = useRef<PeerStatus | null>(null);
  const bufferingStartRef = useRef(0);
  const ytLastRef = useRef({ t: 0, at: 0 });
  const historyRef = useRef<HistoryItem[]>([]);
  const panelOpenRef = useRef(false);
  const infoKeyRef = useRef("");
  const latest = useRef<any>({});
  const watchlistRef = useRef<WatchlistItem[]>([]);
  const removedRef = useRef<Set<string>>(new Set());

  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState<ProfileName | null>(null);

  const [connected, setConnected] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [videoError, setVideoError] = useState(false);

  // Watchlist State'leri
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [isWatchlistOpen, setIsWatchlistOpen] = useState(false);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

  // Geçmiş
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Önerilen videolar
  const [isRecsOpen, setIsRecsOpen] = useState(false);
  const [recs, setRecs] = useState<{ id: string; title: string; author: string; thumbnail: string }[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);

  // Yönetim paneli + chat
  const [panelOpen, setPanelOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [unread, setUnread] = useState(0);

  // Senkron durumu
  const [peerInfo, setPeerInfo] = useState<PeerInfo>({
    seen: false,
    online: false,
    diff: null,
    buffering: false,
    ready: true,
    sameVideo: true,
    myTime: null,
    peerTime: null,
  });
  const [warning, setWarning] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [actionToast, setActionToast] = useState<{ id: number; text: string } | null>(null);
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chatToast, setChatToast] = useState<{ id: string; from: string; text: string } | null>(null);
  const chatToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ytVideoId = getYouTubeId(videoUrl);
  const isYouTube = !!ytVideoId;
  const peerName = profile === "Efe" ? "Damla" : "Efe";

  /* ---------------- Oturum / profil ---------------- */
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(PROFILE_SESSION_KEY);
      if (saved === "Efe" || saved === "Damla") {
        profileRef.current = saved;
        setProfile(saved);
      }
    } catch {}
    setAuthChecked(true);
  }, []);

  const handleUnlock = (name: ProfileName) => {
    profileRef.current = name;
    setProfile(name);
  };

  const handleSwitchProfile = () => {
    try {
      sessionStorage.removeItem(PROFILE_SESSION_KEY);
    } catch {}
    profileRef.current = null;
    urlRef.current = "";
    peerRef.current = null;
    pendingRef.current = null;
    intentPlaying.current = false;
    setVideoUrl("");
    setMessages([]);
    setUnread(0);
    setPanelOpen(false);
    panelOpenRef.current = false;
    setWarning(null);
    setProfile(null);
  };

  /* ---------------- Yerel veriler ---------------- */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const list: WatchlistItem[] = JSON.parse(saved);
        watchlistRef.current = list;
        setWatchlist(list);
      }
      const rem = localStorage.getItem(WATCHLIST_REMOVED_KEY);
      if (rem) removedRef.current = new Set<string>(JSON.parse(rem));
    } catch (error) {
      console.error("Watchlist okunamadı:", error);
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    try {
      const saved = localStorage.getItem(HISTORY_KEY_PREFIX + profile);
      const list: HistoryItem[] = saved ? JSON.parse(saved) : [];
      historyRef.current = list;
      setHistory(list);
    } catch {
      historyRef.current = [];
      setHistory([]);
    }
  }, [profile]);

  /* İzlenecekler: işlem tabanlı (ekle/sil) + birleştirme. Tüm listeyi
     üzerine yazmak yerine kayıtlar tek tek eşitlenir, silinenler
     (removed) ayrıca tutulur; böylece eski bir liste yenisini ezemez. */
  const commitWatchlist = (list: WatchlistItem[]) => {
    watchlistRef.current = list;
    setWatchlist(list);
    persistWatchlist(list);
  };

  const persistRemoved = () => {
    try {
      localStorage.setItem(WATCHLIST_REMOVED_KEY, JSON.stringify([...removedRef.current]));
    } catch {}
  };

  const mergeWatchlist = (list: WatchlistItem[], removed: string[]) => {
    removed.forEach((id) => removedRef.current.add(id));
    const map = new Map<string, WatchlistItem>();
    [...watchlistRef.current, ...list].forEach((i) => {
      if (!removedRef.current.has(i.id) && !map.has(i.id)) map.set(i.id, i);
    });
    const next = [...map.values()].sort((a, b) => parseInt(a.id) - parseInt(b.id));
    commitWatchlist(next);
    persistRemoved();
  };

  const sendWatchlistState = () => {
    sendSignal("wl-state", {
      list: watchlistRef.current,
      removed: [...removedRef.current],
    });
  };

  const recordHistory = async (url: string, by: string) => {
    if (!url || !profileRef.current) return;
    const key = HISTORY_KEY_PREFIX + profileRef.current;
    const meta = await fetchVideoMetaData(url);
    const item: HistoryItem = {
      id: Date.now().toString(),
      title: meta.title,
      url,
      thumbnail: meta.thumbnail,
      at: Date.now(),
      by,
    };
    const next = [item, ...historyRef.current.filter((h) => h.url !== url)].slice(0, 50);
    historyRef.current = next;
    setHistory(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  };

  const clearHistory = () => {
    if (!profile) return;
    historyRef.current = [];
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY_PREFIX + profile);
    } catch {}
  };

  /* ---------------- Oynatıcı soyutlaması ---------------- */
  const suppress = (ms = 1500) => {
    suppressUntil.current = Date.now() + ms;
  };
  const isSuppressed = () => Date.now() < suppressUntil.current;

  const isReady = () =>
    readyKeyRef.current !== "" && readyKeyRef.current === mediaKey(urlRef.current);

  const getTime = (): number => {
    if (getYouTubeId(urlRef.current)) {
      try {
        return ytPlayerRef.current?.getCurrentTime?.() ?? 0;
      } catch {
        return 0;
      }
    }
    return videoRef.current?.currentTime ?? 0;
  };

  const sendSignal = async (event: string, data: any = {}) => {
    try {
      await fetch("/api/pusher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: CHANNEL_NAME,
          event,
          data: { ...data, from: profileRef.current },
          socketId: socketIdRef.current,
        }),
      });
    } catch (error) {
      console.error("Sinyal gönderilemedi:", error);
    }
  };

  const sendStatus = () => {
    if (!profileRef.current) return;
    const url = urlRef.current;
    sendSignal("status", {
      url,
      time: url && isReady() ? getTime() : 0,
      playing: !!url && isReady() && intentPlaying.current,
      ready: !url || isReady(),
      bufferingMs: bufferingStartRef.current ? Date.now() - bufferingStartRef.current : 0,
    });
  };

  const applyState = (time: number, playing: boolean) => {
    const url = urlRef.current;
    if (!url) return;
    if (!isReady()) {
      pendingRef.current = { time, playing };
      intentPlaying.current = playing;
      return;
    }
    suppress();
    const cur = getTime();
    const needSeek = Math.abs(cur - time) > 0.7;
    try {
      if (getYouTubeId(url)) {
        const p = ytPlayerRef.current;
        if (!p) return;
        if (!playing) p.pauseVideo();
        if (needSeek) p.seekTo(time, true);
        if (playing) p.playVideo();
        ytLastRef.current = { t: needSeek ? time : cur, at: Date.now() };
      } else {
        const v = videoRef.current;
        if (!v) return;
        if (!playing) v.pause();
        if (needSeek) v.currentTime = time;
        if (playing) v.play().catch(() => {});
      }
    } catch (error) {
      console.error("Oynatıcı komutu uygulanamadı:", error);
    }
    intentPlaying.current = playing;
  };

  const markReady = (key: string) => {
    readyKeyRef.current = key;
    setVideoError(false);
    const pending = pendingRef.current;
    if (pending && key === mediaKey(urlRef.current)) {
      pendingRef.current = null;
      applyState(pending.time, pending.playing);
    }
    sendStatus();
  };

  const startBuffering = () => {
    if (bufferingStartRef.current) return;
    bufferingStartRef.current = Date.now();
    setTimeout(() => {
      if (bufferingStartRef.current) sendStatus();
    }, 1500);
  };

  const stopBuffering = () => {
    if (!bufferingStartRef.current) return;
    const lasted = Date.now() - bufferingStartRef.current;
    bufferingStartRef.current = 0;
    if (lasted > 1500) sendStatus();
  };

  const changeUrl = (url: string) => {
    urlRef.current = url;
    pendingRef.current = null;
    intentPlaying.current = false;
    bufferingStartRef.current = 0;
    setVideoError(false);
    setVideoUrl(url);
  };

  /* Kullanıcının yaptığı aksiyonlar */
  const onLocalPlay = () => {
    if (isSuppressed() || intentPlaying.current) return;
    intentPlaying.current = true;
    sendSignal("play", { time: getTime() });
  };

  const onLocalPause = () => {
    if (isSuppressed() || !intentPlaying.current) return;
    intentPlaying.current = false;
    sendSignal("pause", { time: getTime() });
  };

  const onLocalSeek = () => {
    if (isSuppressed()) return;
    sendSignal("seek", { time: getTime() });
  };

  const showAction = (text: string) => {
    setActionToast({ id: Date.now() + Math.random(), text });
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    actionTimerRef.current = setTimeout(() => setActionToast(null), 3500);
  };

  const showChatToast = (data: { id: string; from: string; text: string }) => {
    setChatToast(data);
    if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current);
    chatToastTimerRef.current = setTimeout(() => setChatToast(null), 6500);
  };

  const handleReply = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setPanelOpen(true);
    panelOpenRef.current = true;
    setUnread(0);
    setChatToast(null);
    if (chatToastTimerRef.current) clearTimeout(chatToastTimerRef.current);
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 150);
  };

  const addSystem = (text: string) => {
    setMessages((prev) =>
      [...prev, { id: `s${Date.now()}${Math.random()}`, from: "", text, at: Date.now(), system: true }].slice(-200)
    );
  };

  const peerTimeNow = (p: PeerStatus) => {
    const age = (Date.now() - p.receivedAt) / 1000;
    return p.time + (p.playing && p.bufferingMs === 0 ? age : 0);
  };

  /* Panel işlemleri */
  const handleSyncAll = () => {
    const url = urlRef.current;
    if (!url) {
      addSystem("Önce bir video aç.");
      return;
    }
    let t = getTime();
    const p = peerRef.current;
    if (p && p.url === url && (Date.now() - p.receivedAt) / 1000 < OFFLINE_AFTER_S) {
      t = Math.min(t, peerTimeNow(p));
    }
    const playing = intentPlaying.current;
    applyState(t, playing);
    sendSignal("sync", { url, time: t, playing });
    addSystem(`⚡ Eş zamanlı hale getirildi (${fmtTime(t)})`);
  };

  const handleJumpToPeer = () => {
    const p = peerRef.current;
    if (!p || !p.url) return;
    if (p.url !== urlRef.current) {
      changeUrl(p.url);
      pendingRef.current = { time: peerTimeNow(p), playing: p.playing };
      intentPlaying.current = p.playing;
      recordHistory(p.url, p.from);
    } else {
      applyState(peerTimeNow(p), p.playing);
    }
    addSystem(`${GENITIVE[peerName]} saniyesine gidildi.`);
  };

  const handleReload = () => {
    if (!urlRef.current) return;
    pendingRef.current = { time: getTime(), playing: intentPlaying.current };
    readyKeyRef.current = "";
    setVideoError(false);
    setReloadKey((k) => k + 1);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || !profileRef.current) return;
    const msg: ChatMessage = {
      id: `${Date.now()}${Math.random()}`,
      from: profileRef.current,
      text,
      at: Date.now(),
    };
    setMessages((prev) => [...prev, msg].slice(-200));
    sendSignal("chat", { id: msg.id, text, at: msg.at });
    setChatInput("");
  };

  const togglePanel = () => {
    const next = !panelOpen;
    setPanelOpen(next);
    panelOpenRef.current = next;
    if (next) setUnread(0);
  };

  const toggleFullscreen = () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
  };

  /* Her render'da en güncel fonksiyonları event handler'lara sun */
  useEffect(() => {
    latest.current = {
      applyState,
      markReady,
      sendStatus,
      mergeWatchlist,
      sendWatchlistState,
      sendSignal,
      onLocalPlay,
      onLocalPause,
      onLocalSeek,
      startBuffering,
      stopBuffering,
      changeUrl,
      recordHistory,
      addSystem,
      showAction,
      showChatToast,
      getTime,
    };
  });

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, panelOpen]);

  /* ---------------- YouTube oynatıcı ---------------- */
  useEffect(() => {
    if (!ytVideoId) return;
    let cancelled = false;
    let player: any = null;
    const host = ytHostRef.current;

    loadYouTubeApi().then(() => {
      if (cancelled || !ytHostRef.current) return;
      const el = document.createElement("div");
      ytHostRef.current.innerHTML = "";
      ytHostRef.current.appendChild(el);

      player = new window.YT.Player(el, {
        width: "100%",
        height: "100%",
        videoId: ytVideoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          fs: 0, // tam ekran bizim butonumuzdan (uyarı kutusu görünsün diye)
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            ytPlayerRef.current = player;
            ytLastRef.current = { t: 0, at: Date.now() };
            latest.current.markReady(ytVideoId);
          },
          onStateChange: (event: any) => {
            if (cancelled) return;
            const s = event.data;
            if (s === 3) latest.current.startBuffering();
            else if (s === 1 || s === 2 || s === 5 || s === 0) latest.current.stopBuffering();

            if (s === 1) {
              ytLastRef.current = { t: player.getCurrentTime(), at: Date.now() };
              latest.current.onLocalPlay();
            } else if (s === 2) {
              latest.current.onLocalPause();
            }
          },
          onError: () => {
            if (cancelled) return;
            readyKeyRef.current = "";
            setVideoError(true);
            latest.current.sendStatus();
          },
        },
      });
      ytPlayerRef.current = player;
    });

    return () => {
      cancelled = true;
      readyKeyRef.current = "";
      try {
        player?.destroy();
      } catch {}
      ytPlayerRef.current = null;
      if (host) host.innerHTML = "";
    };
  }, [ytVideoId, reloadKey]);

  // Ambilight: mp4 karelerini küçük canvas'a çiz (blur CSS ile yapılıyor)
  useEffect(() => {
    if (!videoUrl || isYouTube) return;
    const id = setInterval(() => {
      const canvas = glowCanvasRef.current;
      const v = videoRef.current;
      if (!canvas || !v || v.readyState < 2) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      try {
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      } catch {}
    }, 150);
    return () => clearInterval(id);
  }, [videoUrl, isYouTube, reloadKey]);

  // mp4 için hazır durumu sıfırlama (url/reload değişince)
  useEffect(() => {
    return () => {
      readyKeyRef.current = "";
    };
  }, [videoUrl, reloadKey]);

  // YouTube'da atlama (seek) tespiti
  useEffect(() => {
    if (!profile) return;
    const id = setInterval(() => {
      if (!getYouTubeId(urlRef.current) || !isReady()) return;
      const p = ytPlayerRef.current;
      if (!p || !p.getCurrentTime) return;
      let cur = 0;
      let state = -1;
      try {
        cur = p.getCurrentTime();
        state = p.getPlayerState();
      } catch {
        return;
      }
      const last = ytLastRef.current;
      const expected = last.t + (state === 1 ? (Date.now() - last.at) / 1000 : 0);
      ytLastRef.current = { t: cur, at: Date.now() };
      if (Math.abs(cur - expected) > 1.5 && !isSuppressed()) {
        latest.current.onLocalSeek();
      }
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  /* ---------------- Pusher (tek abonelik) ---------------- */
  useEffect(() => {
    if (!profile) return;
    const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!pusherKey || !pusherCluster) return;

    const pusher = new Pusher(pusherKey, { cluster: pusherCluster });
    const channel = pusher.subscribe(CHANNEL_NAME);
    const me = profile;

    pusher.connection.bind("connected", () => {
      socketIdRef.current = pusher.connection.socket_id;
      setConnected(true);
    });
    pusher.connection.bind("disconnected", () => setConnected(false));

    channel.bind("pusher:subscription_succeeded", () => {
      latest.current.sendSignal("hello", {});
      latest.current.sendStatus();
      latest.current.sendWatchlistState();
    });

    channel.bind("hello", (d: { from: string }) => {
      if (d.from === me) return;
      latest.current.sendStatus();
      latest.current.sendWatchlistState();
    });

    channel.bind("status", (d: Omit<PeerStatus, "receivedAt">) => {
      if (d.from === me) return;
      peerRef.current = { ...d, receivedAt: Date.now() };
      // Geç katılan: karşı taraf bir videodaysa ona katıl
      if (!urlRef.current && d.url) {
        const l = latest.current;
        l.changeUrl(d.url);
        pendingRef.current = { time: d.time + (d.playing ? 0.5 : 0), playing: d.playing };
        intentPlaying.current = d.playing;
        l.recordHistory(d.url, d.from);
      }
    });

    channel.bind("play", (d: { time: number; from: string }) => {
      if (d.from === me) return;
      latest.current.showAction(`▶️ ${d.from} videoyu başlattı · ${fmtTime(d.time)}`);
      latest.current.applyState(d.time + 0.3, true);
    });

    channel.bind("pause", (d: { time: number; from: string }) => {
      if (d.from === me) return;
      latest.current.showAction(`⏸️ ${d.from} videoyu durdurdu · ${fmtTime(d.time)}`);
      latest.current.applyState(d.time, false);
    });

    channel.bind("seek", (d: { time: number; from: string }) => {
      if (d.from === me) return;
      const delta = d.time - latest.current.getTime();
      const dir = delta > 0 ? "ileri" : "geri";
      latest.current.showAction(
        `${delta > 0 ? "⏩" : "⏪"} ${d.from} videoyu ${dir} sardı · ${fmtTime(d.time)}`
      );
      latest.current.applyState(d.time, intentPlaying.current);
    });

    channel.bind("change-video", (d: { url: string; from: string }) => {
      if (d.from === me) return;
      const l = latest.current;
      l.showAction(`🎬 ${d.from} yeni bir video açtı`);
      l.changeUrl(d.url);
      l.recordHistory(d.url, d.from);
    });

    channel.bind("sync", (d: { url: string; time: number; playing: boolean; from: string }) => {
      if (d.from === me) return;
      const l = latest.current;
      l.showAction(`⚡ ${d.from} eş zamanlı hale getirdi · ${fmtTime(d.time)}`);
      if (d.url !== urlRef.current) {
        l.changeUrl(d.url);
        pendingRef.current = { time: d.time, playing: d.playing };
        intentPlaying.current = d.playing;
        l.recordHistory(d.url, d.from);
      } else {
        l.applyState(d.time, d.playing);
      }
      l.addSystem(`⚡ ${d.from} eş zamanlı hale getirdi (${fmtTime(d.time)})`);
    });

    channel.bind("chat", (d: { id: string; text: string; at: number; from: string }) => {
      if (d.from === me) return;
      setMessages((prev) =>
        prev.some((m) => m.id === d.id) ? prev : [...prev, { id: d.id, from: d.from, text: d.text, at: d.at }].slice(-200)
      );
      if (!panelOpenRef.current) setUnread((u) => u + 1);
      latest.current.showChatToast({ id: d.id, from: d.from, text: d.text });
    });

    channel.bind("popcorn", (d: { from: string }) => {
      if (d.from === me) return;
      triggerConfetti();
    });

    channel.bind("wl-add", (d: { item: WatchlistItem; from: string }) => {
      if (d.from === me) return;
      latest.current.mergeWatchlist([d.item], []);
    });

    channel.bind("wl-remove", (d: { id: string; from: string }) => {
      if (d.from === me) return;
      latest.current.mergeWatchlist([], [d.id]);
    });

    channel.bind("wl-state", (d: { list: WatchlistItem[]; removed: string[]; from: string }) => {
      if (d.from === me) return;
      latest.current.mergeWatchlist(d.list || [], d.removed || []);
    });


    const heartbeat = setInterval(() => latest.current.sendStatus(), HEARTBEAT_MS);

    return () => {
      clearInterval(heartbeat);
      channel.unbind_all();
      pusher.unsubscribe(CHANNEL_NAME);
      pusher.disconnect();
      socketIdRef.current = null;
      setConnected(false);
    };
  }, [profile]);

  /* ---------------- Geride kalma / yüklenmedi tespiti ---------------- */
  useEffect(() => {
    if (!profile) return;
    const other = profile === "Efe" ? "Damla" : "Efe";
    const id = setInterval(() => {
      const p = peerRef.current;
      let info: PeerInfo;
      let warn: string | null = null;

      const myUrlNow = urlRef.current;
      const myTime = myUrlNow && isReady() ? Math.floor(getTime()) : null;

      if (!p) {
        info = { seen: false, online: false, diff: null, buffering: false, ready: true, sameVideo: true, myTime, peerTime: null };
      } else {
        const age = (Date.now() - p.receivedAt) / 1000;
        const online = age <= OFFLINE_AFTER_S;
        const myUrl = urlRef.current;
        const sameVideo = !myUrl || p.url === myUrl;
        const buffering = p.bufferingMs / 1000 + age >= 2 && p.bufferingMs > 0;
        let diff: number | null = null;
        if (online && myUrl && sameVideo && p.ready && isReady()) {
          diff = peerTimeNow(p) - getTime();
        }
        const peerTime = online && p.url && p.ready ? Math.floor(peerTimeNow(p)) : null;
        info = { seen: true, online, diff, buffering, ready: p.ready, sameVideo, myTime, peerTime };


        if (!online) {
          warn = `${other} bağlantıda değil`;
        } else if (myUrl && !p.url) {
          warn = `${LOCATIVE[other]} video henüz yüklenmedi`;
        } else if (myUrl && !sameVideo) {
          warn = `${other} farklı bir videoda`;
        } else if (buffering) {
          warn = `${LOCATIVE[other]} video yükleniyor…`;
        } else if (myUrl && !p.ready) {
          warn = `${LOCATIVE[other]} video yüklenmedi`;
        } else if (diff !== null && Math.abs(diff) > LAG_THRESHOLD_S) {
          const secs = Math.round(Math.abs(diff));
          warn = diff < 0 ? `${other} ${secs} sn geride` : `${profile} ${secs} sn geride`;
        }
      }

      const key = JSON.stringify([info, warn]);
      if (key !== infoKeyRef.current) {
        infoKeyRef.current = key;
        setPeerInfo(info);
        setWarning(warn);
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  /* ---------------- Aksiyonlar ---------------- */
  const triggerConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.85 },
      colors: ["#f1c40f", "#e67e22", "#e74c3c", "#ffffff"],
    });
  };

  const handlePopcornClick = () => {
    triggerConfetti();
    sendSignal("popcorn", {});
  };

  const handleChangeVideo = (url: string) => {
    const clean = url.trim();
    if (!clean) return;
    changeUrl(clean);
    sendSignal("change-video", { url: clean });
    recordHistory(clean, profileRef.current || "");
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    handleChangeVideo(inputUrl);
    setInputUrl("");
  };

  const addToWatchlist = (item: { title: string; url: string; thumbnail?: string | null }) => {
    if (watchlistRef.current.some((i) => i.url === item.url)) return;
    const newItem: WatchlistItem = {
      id: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
      title: item.title,
      url: item.url,
      thumbnail: item.thumbnail ?? null,
    };
    commitWatchlist([...watchlistRef.current, newItem]);
    sendSignal("wl-add", { item: newItem });
  };

  const handleAddWatchlist = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = newUrl.trim();
    if (!url) return;

    setIsLoadingMetadata(true);
    const meta = await fetchVideoMetaData(url);
    addToWatchlist({ title: meta.title, url, thumbnail: meta.thumbnail });

    setNewUrl("");
    setIsLoadingMetadata(false);
  };

  const handleRemoveWatchlist = (id: string) => {
    removedRef.current.add(id);
    persistRemoved();
    commitWatchlist(watchlistRef.current.filter((item) => item.id !== id));
    sendSignal("wl-remove", { id });
  };

  const handlePlayFromWatchlist = (url: string) => {
    handleChangeVideo(url);
  };
  const openRecommendations = async () => {
    const id = getYouTubeId(urlRef.current);
    if (!id) return;
    setIsRecsOpen(true);
    setRecsLoading(true);
    setRecs([]);
    try {
      const res = await fetch(`/api/related?id=${id}`);
      const data = await res.json();
      setRecs(data.items || []);
    } catch {
      setRecs([]);
    }
    setRecsLoading(false);
  };


  if (!authChecked) return null;
  if (!profile) return <ProfileGate onUnlock={handleUnlock} />;

  const peerOnline = peerInfo.online;

  return (
    <main className="relative flex h-dvh flex-col items-center justify-between bg-zinc-950 text-zinc-100 px-4 py-2 sm:px-8 sm:py-3 font-sans select-none overflow-hidden">

      {/* Arka Plan Koyu Kırmızı Glow Efekti */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-rose-950/20 rounded-full blur-[120px] pointer-events-none" />

      {/* Üst Bar */}
      <header className="relative z-10 w-full max-w-6xl flex items-center justify-between py-3 border-b border-zinc-900">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-white">
            DAMLAFLIX
          </h1>
          <span className="text-rose-500 text-sm">❤️</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 rounded-full border border-zinc-800 transition-colors cursor-pointer"
          >
            <span>🕘</span>
            <span>Geçmiş</span>
          </button>

          <button
            onClick={() => setIsWatchlistOpen(!isWatchlistOpen)}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 rounded-full border border-zinc-800 transition-colors cursor-pointer"
          >
            <span>📜</span>
            <span>İzlenecekler</span>
            {watchlist.length > 0 && (
              <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {watchlist.length}
              </span>
            )}
          </button>

          <button
            onClick={handleSwitchProfile}
            title="Profil değiştir"
            className="flex items-center gap-2 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 pl-1.5 pr-3 py-1 rounded-full border border-zinc-800 transition-colors cursor-pointer"
          >
            <span
              className={`w-5 h-5 rounded-md border flex items-center justify-center text-[10px] font-bold text-white ${AVATAR_STYLES[profile]}`}
            >
              {profile[0]}
            </span>
            <span>{profile}</span>
          </button>
        </div>
      </header>

      {/* Kontroller & Video Ekranı */}
      <div className="relative z-10 w-full max-w-6xl flex-1 min-h-0 py-4 flex flex-col">
        <div className="w-full h-full min-h-0 flex flex-col gap-4">
        <form onSubmit={handleUrlSubmit} className="w-full flex gap-2 shrink-0">


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

        <div className="relative isolate w-full flex-1 min-h-0">
          {/* Ambilight: videonun renklerini yansıtan bulanık arka ışık */}
          {videoUrl && (
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-4 -z-10 opacity-60 blur-3xl saturate-150 transition-opacity duration-700"
            >
              {isYouTube ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={ytVideoId}
                  src={`https://img.youtube.com/vi/${ytVideoId}/mqdefault.jpg`}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <canvas ref={glowCanvasRef} width={48} height={27} className="w-full h-full" />
              )}
            </div>
          )}

        <div
          ref={shellRef}
          className="video-shell group relative w-full h-full rounded-xl overflow-hidden border border-zinc-800/80 bg-zinc-950/80 backdrop-blur-sm shadow-2xl flex items-center justify-center"
        >
          {!videoUrl ? (
            <div className="flex flex-col items-center gap-2 text-zinc-600">
              <span className="text-3xl">🎬</span>
              <p className="text-xs font-medium">aşkm video seç</p>
            </div>
          ) : isYouTube ? (
            <div ref={ytHostRef} className="w-full h-full" />
          ) : (
            <video
              key={`${videoUrl}-${reloadKey}`}
              ref={videoRef}
              src={videoUrl}
              controls
              controlsList="nofullscreen"
              playsInline
              className="w-full h-full object-contain"
              onLoadedMetadata={() => markReady(mediaKey(videoUrl))}
              onPlay={onLocalPlay}
              onPause={onLocalPause}
              onSeeked={onLocalSeek}
              onWaiting={startBuffering}
              onPlaying={stopBuffering}
              onCanPlay={stopBuffering}
              onError={() => {
                readyKeyRef.current = "";
                setVideoError(true);
                sendStatus();
              }}
            />
          )}

          {videoUrl && videoError && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-zinc-950/80 text-zinc-400">
              <span className="text-2xl">⚠️</span>
              <p className="text-xs font-medium">Video yüklenemedi</p>
              <button
                onClick={handleReload}
                className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                Yeniden dene
              </button>
            </div>
          )}

          {/* Bildirimler: Mesaj ve Eylem bildirimleri */}
          <div className="absolute bottom-14 left-3 z-20 flex flex-col gap-2 max-w-[85%] sm:max-w-md pointer-events-none">
            {chatToast && (
              <div
                key={chatToast.id}
                className="pointer-events-auto flex items-center gap-2.5 bg-zinc-950/95 border border-rose-900/80 text-zinc-100 text-xs p-2.5 rounded-2xl backdrop-blur-md shadow-2xl animate-pulse-once"
              >
                <div className="w-7 h-7 rounded-full bg-rose-600/30 border border-rose-500/50 flex items-center justify-center font-bold text-xs text-rose-300 shrink-0">
                  {chatToast.from[0]}
                </div>
                <div className="flex flex-col min-w-0 pr-1 select-text">
                  <span className="text-[10px] font-bold text-rose-400 leading-tight">
                    {chatToast.from}
                  </span>
                  <span className="text-xs text-zinc-200 line-clamp-2 break-words">
                    {chatToast.text}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                  <button
                    onClick={handleReply}
                    className="bg-rose-900 hover:bg-rose-800 text-white text-[11px] font-medium px-3 py-1.5 rounded-xl transition-all active:scale-95 cursor-pointer shadow flex items-center gap-1"
                  >
                    <span>Cevapla</span>
                    <span>💬</span>
                  </button>
                  <button
                    onClick={() => setChatToast(null)}
                    className="text-zinc-500 hover:text-zinc-300 text-xs p-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Kapat"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {actionToast && (
              <div
                key={actionToast.id}
                className="self-start pointer-events-auto flex items-center gap-2 bg-zinc-900/90 border border-zinc-700/80 text-zinc-100 text-xs font-medium px-4 py-2 rounded-full backdrop-blur-md shadow-lg animate-pulse-once"
              >
                {actionToast.text}
              </div>
            )}
          </div>

          {/* Uyarı kutusu: tam ekranda da görünür (tam ekran bu kabuğa uygulanır) */}
          {warning && (
            <div className="absolute top-0 inset-x-0 z-20 flex justify-center p-3 pr-14 pointer-events-none">
              <div className="flex items-center gap-2 bg-amber-950/90 border border-amber-800/80 text-amber-200 text-xs font-medium px-4 py-2 rounded-full backdrop-blur-md shadow-lg">
                <span>⚠️</span>
                <span>{warning}</span>
              </div>
            </div>
          )}

          {videoUrl && (
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Tam ekrandan çık" : "Tam ekran"}
              className="absolute top-3 right-3 z-30 w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 text-sm backdrop-blur-md opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
            >
              {isFullscreen ? "🗗" : "⛶"}
            </button>
          )}
        </div>
        </div>

        <div className="flex items-center justify-center gap-3 shrink-0">
          <button
            onClick={handlePopcornClick}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900/80 hover:bg-zinc-800/90 border border-zinc-800 hover:border-rose-950/80 text-zinc-200 font-medium rounded-full text-xs tracking-wide transition-all duration-200 active:scale-95 cursor-pointer backdrop-blur-md"
          >
            <span className="text-base">🍿</span>
            <span>Mısır Patlat</span>
          </button>

          <button
            onClick={openRecommendations}
            disabled={!isYouTube}
            title={isYouTube ? "Önerilen videolar" : "Önce bir YouTube videosu aç"}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900/80 hover:bg-zinc-800/90 disabled:opacity-40 disabled:hover:bg-zinc-900/80 border border-zinc-800 hover:border-rose-950/80 text-zinc-200 font-medium rounded-full text-xs tracking-wide transition-all duration-200 active:scale-95 cursor-pointer backdrop-blur-md"
          >
            <span className="text-base">✨</span>
            <span>Önerilenler</span>
          </button>
        </div>
        </div>
      </div>

      {/* Gizli Yönetim Paneli (sağ kenar) */}
      <button
        onClick={togglePanel}
        title="Yönetim paneli"
        className={`fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-1 bg-zinc-900/90 hover:bg-zinc-800 border border-r-0 border-zinc-800 rounded-l-xl px-2 py-3 text-xs text-zinc-300 backdrop-blur-md transition-all cursor-pointer ${
          panelOpen ? "opacity-0 pointer-events-none" : unread > 0 ? "opacity-100" : "opacity-30 hover:opacity-100"
        }`}
      >
        <span>💬</span>
        {unread > 0 && (
          <span className="bg-rose-600 text-white text-[10px] px-1.5 rounded-full font-bold">{unread}</span>
        )}
      </button>

      <aside
        className={`fixed top-0 right-0 z-[60] h-full w-80 max-w-[90vw] bg-zinc-950/95 backdrop-blur-xl border-l border-zinc-800 shadow-2xl flex flex-col transition-transform duration-300 ${
          panelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>🎛️</span> Yönetim
          </h3>
          <button
            onClick={togglePanel}
            className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-zinc-800 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Kimler bağlı */}
        <div className="px-4 py-3 border-b border-zinc-800 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-zinc-300">
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500" : "bg-zinc-600"}`} />
              {profile} (sen)
            </span>
            <span className="flex items-center gap-2">
              {peerInfo.myTime !== null && (
                <span className="font-mono text-zinc-300 tabular-nums">⏱ {fmtTime(peerInfo.myTime)}</span>
              )}
              <span className="text-zinc-600">{connected ? "bağlı" : "bağlanıyor…"}</span>
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-zinc-300">
              <span className={`w-2 h-2 rounded-full ${peerOnline ? "bg-emerald-500" : "bg-zinc-600"}`} />
              {peerName}
            </span>
            <span className="flex items-center gap-2">
              {peerInfo.peerTime !== null && (
                <span className="font-mono text-zinc-300 tabular-nums">⏱ {fmtTime(peerInfo.peerTime)}</span>
              )}
              <span className={warning ? "text-amber-400" : "text-zinc-600"}>
                {!peerInfo.seen
                  ? "henüz gelmedi"
                  : !peerOnline
                    ? "bağlantı yok"
                    : peerInfo.buffering
                      ? "yükleniyor"
                      : !peerInfo.sameVideo
                        ? "farklı videoda"
                        : peerInfo.diff === null
                          ? "çevrimiçi"
                          : Math.abs(peerInfo.diff) <= LAG_THRESHOLD_S
                            ? "senkron ✓"
                            : peerInfo.diff < 0
                              ? `${Math.round(-peerInfo.diff)} sn geride`
                              : `${Math.round(peerInfo.diff)} sn ileride`}
              </span>
            </span>
          </div>
        </div>

        {/* İşlevsel butonlar */}
        <div className="px-4 py-3 border-b border-zinc-800 grid grid-cols-1 gap-2">
          <button
            onClick={handleSyncAll}
            className="bg-rose-900 hover:bg-rose-800 text-white text-xs font-medium px-3 py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer"
          >
            ⚡ Eş zamanlı hale getir
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleJumpToPeer}
              disabled={!peerInfo.seen || !peerOnline}
              className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-zinc-900 border border-zinc-800 text-zinc-200 text-[11px] font-medium px-2 py-2 rounded-xl transition-all cursor-pointer"
            >
              ⏩ {GENITIVE[peerName]} yerine git
            </button>
            <button
              onClick={handleReload}
              disabled={!videoUrl}
              className="bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-zinc-900 border border-zinc-800 text-zinc-200 text-[11px] font-medium px-2 py-2 rounded-xl transition-all cursor-pointer"
            >
              🔄 Videoyu yenile
            </button>
          </div>
        </div>

        {/* Chat */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-2 custom-scrollbar">
          {messages.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-8">Henüz mesaj yok.</p>
          ) : (
            messages.map((m) =>
              m.system ? (
                <p key={m.id} className="text-[10px] text-zinc-500 text-center py-1">
                  {m.text}
                </p>
              ) : (
                <div key={m.id} className={`flex flex-col ${m.from === profile ? "items-end" : "items-start"}`}>
                  <span className="text-[10px] text-zinc-600 px-1">{m.from === profile ? "Sen" : m.from}</span>
                  <div
                    className={`max-w-[85%] text-xs px-3 py-2 rounded-2xl break-words select-text ${
                      m.from === profile
                        ? "bg-rose-950/80 border border-rose-900/60 text-rose-50"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-200"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              )
            )
          )}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleSendChat} className="flex gap-2 p-3 border-t border-zinc-800">
          <input
            ref={chatInputRef}
            type="text"
            placeholder="Mesaj yaz..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            className="flex-1 min-w-0 bg-zinc-900/80 border border-zinc-800 text-xs px-3 py-2.5 rounded-xl focus:outline-none focus:border-rose-900/60 text-zinc-200 placeholder-zinc-500 transition-colors"
          />
          <button
            type="submit"
            className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium px-3 py-2.5 rounded-xl transition-all cursor-pointer"
          >
            Gönder
          </button>
        </form>
      </aside>

      {/* İzlenecekler Modal / Panel */}
      {isWatchlistOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>📜</span> Daha Sonra İzlenecekler Listesi
              </h3>
              <button
                onClick={() => setIsWatchlistOpen(false)}
                className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-zinc-800 transition-colors"
              >
                ✕ Kapat
              </button>
            </div>

            {/* Sadece Link Alan Form */}
            <form onSubmit={handleAddWatchlist} className="flex gap-2">
              <input
                type="text"
                placeholder="YouTube linki veya Video URL yapıştır..."
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-800 text-xs px-3 py-2.5 rounded-xl focus:outline-none focus:border-rose-900 text-zinc-200 placeholder-zinc-600"
              />
              <button
                type="submit"
                disabled={isLoadingMetadata}
                className="bg-rose-900 hover:bg-rose-850 disabled:bg-zinc-800 text-white text-xs font-medium px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isLoadingMetadata ? "Ekleniyor..." : "Ekle"}
              </button>
            </form>

            {/* Video Listesi */}
            <div className="max-h-72 overflow-y-auto flex flex-col gap-2.5 pr-1 custom-scrollbar">
              {watchlist.length === 0 ? (
                <p className="text-xs text-zinc-600 text-center py-8">
                  Henüz listeye film eklenmedi.
                </p>
              ) : (
                watchlist.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between bg-zinc-950 border border-zinc-800/80 p-2 rounded-xl hover:border-zinc-700 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="w-16 h-10 object-cover rounded-lg border border-zinc-800 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-10 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center text-zinc-600 text-lg flex-shrink-0">
                          🎬
                        </div>
                      )}

                      <div className="flex flex-col gap-0.5 overflow-hidden">
                        <span className="text-xs font-semibold text-zinc-200 truncate">
                          {item.title}
                        </span>
                        <span className="text-[10px] text-zinc-500 truncate">
                          {item.url}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => {
                          handlePlayFromWatchlist(item.url);
                          setIsWatchlistOpen(false);
                        }}
                        className="bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-900 text-[11px] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        Oynat ▶
                      </button>
                      <button
                        onClick={() => handleRemoveWatchlist(item.id)}
                        className="bg-zinc-900 hover:bg-rose-950/60 text-zinc-500 hover:text-rose-400 text-xs p-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Önerilen Videolar Modal */}
      {isRecsOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>✨</span> Önerilen Videolar
              </h3>
              <button
                onClick={() => setIsRecsOpen(false)}
                className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-zinc-800 transition-colors cursor-pointer"
              >
                ✕ Kapat
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto flex flex-col gap-2.5 pr-1 custom-scrollbar">
              {recsLoading ? (
                <p className="text-xs text-zinc-600 text-center py-8">Yükleniyor...</p>
              ) : recs.length === 0 ? (
                <p className="text-xs text-zinc-600 text-center py-8">
                  Şu an öneri getirilemedi, biraz sonra tekrar dene.
                </p>
              ) : (
                recs.map((r) => {
                  const url = `https://www.youtube.com/watch?v=${r.id}`;
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between bg-zinc-950 border border-zinc-800/80 p-2 rounded-xl hover:border-zinc-700 transition-colors gap-3"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <img
                          src={r.thumbnail}
                          alt={r.title}
                          className="w-16 h-10 object-cover rounded-lg border border-zinc-800 flex-shrink-0"
                        />
                        <div className="flex flex-col gap-0.5 overflow-hidden">
                          <span className="text-xs font-semibold text-zinc-200 truncate">{r.title}</span>
                          <span className="text-[10px] text-zinc-500 truncate">{r.author}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => {
                            handleChangeVideo(url);
                            setIsRecsOpen(false);
                          }}
                          className="bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-900 text-[11px] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          Oynat ▶
                        </button>
                        <button
                          onClick={() => addToWatchlist({ title: r.title, url, thumbnail: r.thumbnail })}
                          title="İzlenecekler'e ekle"
                          className="bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white text-xs p-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          📜
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* İzleme Geçmişi Modal */}

      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>🕘</span> İzleme Geçmişi
              </h3>
              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <button
                    onClick={clearHistory}
                    className="text-zinc-500 hover:text-rose-400 text-xs px-2 py-1 rounded-lg bg-zinc-800 transition-colors cursor-pointer"
                  >
                    Temizle
                  </button>
                )}
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-zinc-800 transition-colors cursor-pointer"
                >
                  ✕ Kapat
                </button>
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto flex flex-col gap-2.5 pr-1 custom-scrollbar">
              {history.length === 0 ? (
                <p className="text-xs text-zinc-600 text-center py-8">
                  Henüz izlenen video yok.
                </p>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between bg-zinc-950 border border-zinc-800/80 p-2 rounded-xl hover:border-zinc-700 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="w-16 h-10 object-cover rounded-lg border border-zinc-800 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-10 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center text-zinc-600 text-lg flex-shrink-0">
                          🎬
                        </div>
                      )}

                      <div className="flex flex-col gap-0.5 overflow-hidden">
                        <span className="text-xs font-semibold text-zinc-200 truncate">
                          {item.title}
                        </span>
                        <span className="text-[10px] text-zinc-500 truncate">
                          {new Date(item.at).toLocaleString("tr-TR", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {item.by ? ` · ${item.by}` : ""}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        handleChangeVideo(item.url);
                        setIsHistoryOpen(false);
                      }}
                      className="flex-shrink-0 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-900 text-[11px] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      Oynat ▶
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alt Bilgi */}
      <footer className="relative z-10 w-full max-w-6xl text-center py-3 text-xs text-zinc-600 border-t border-zinc-900">
        damla eşşşeğiyle kaçak film izleyebilmek için | efe ❤️ damla
      </footer>
    </main>
  );
}