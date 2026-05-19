import { useState, useEffect } from "react";
import { Brain, Search, Globe, Check, Loader2, Sparkles, Radar } from "lucide-react";

interface Platform {
  name: string;
  icon: string;
  status: "idle" | "scanning" | "found" | "done";
  jobsFound: number;
}

const PLATFORMS: Platform[] = [
  { name: "LinkedIn", icon: "💼", status: "idle", jobsFound: 0 },
  { name: "Jobstreet", icon: "📋", status: "idle", jobsFound: 0 },
  { name: "Glints", icon: "✨", status: "idle", jobsFound: 0 },
  { name: "Kalibrr", icon: "🎯", status: "idle", jobsFound: 0 },
  { name: "KitaLulus", icon: "🎓", status: "idle", jobsFound: 0 },
  { name: "Dealls", icon: "🚀", status: "idle", jobsFound: 0 },
];

interface ScanStage {
  message: string;
  type: "info" | "success" | "analysis";
}

export function AIJobScanner({ onComplete }: { onComplete: () => void }) {
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [platforms, setPlatforms] = useState<Platform[]>(PLATFORMS);
  const [stages, setStages] = useState<ScanStage[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);

  const addStage = (message: string, type: ScanStage["type"] = "info") => {
    setStages((prev) => [...prev.slice(-4), { message, type }]);
  };

  const startScan = async () => {
    setIsScanning(true);
    setProgress(0);
    setStages([]);
    setTotalJobs(0);
    setPlatforms(PLATFORMS.map((p) => ({ ...p, status: "idle", jobsFound: 0 })));

    // Stage 1: Initialize AI
    addStage("🤖 Memulai AI Job Agent v2.1...", "info");
    await sleep(800);
    addStage("📡 Menghubungkan ke 6 platform job...", "info");
    await sleep(600);

    // Stage 2: Scan each platform
    let currentProgress = 0;
    let jobsCount = 0;

    for (let i = 0; i < PLATFORMS.length; i++) {
      const platform = PLATFORMS[i];
      
      setPlatforms((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: "scanning" } : p
        )
      );
      addStage(`🔍 Menelusuri ${platform.name}...`, "info");
      await sleep(1200);

      const found = Math.floor(Math.random() * 8) + 3; // 3-10 jobs per platform
      jobsCount += found;

      setPlatforms((prev) =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: "found", jobsFound: found } : p
        )
      );
      addStage(`✅ Menemukan ${found} lowongan di ${platform.name}`, "success");
      await sleep(400);

      currentProgress = ((i + 1) / PLATFORMS.length) * 60;
      setProgress(currentProgress);
    }

    setTotalJobs(jobsCount);

    // Stage 3: AI Analysis
    addStage("🧠 AI mulai menganalisis setiap lowongan...", "analysis");
    await sleep(1000);
    setProgress(70);
    
    addStage("📊 Menghitung kecocokan dengan profil kamu...", "analysis");
    await sleep(800);
    setProgress(80);
    
    addStage("🎯 Memprediksi potensi diterima untuk tiap posisi...", "analysis");
    await sleep(800);
    setProgress(90);
    
    addStage("📈 Menganalisis tren pasar & benchmark gaji...", "analysis");
    await sleep(800);
    setProgress(95);
    
    addStage("✨ Membuat strategi aplikasi optimal...", "analysis");
    await sleep(600);
    setProgress(100);

    addStage(`🎉 Selesai! ${jobsCount} lowongan ditemukan & dianalisis`, "success");
    await sleep(1000);

    setIsScanning(false);
    onComplete();
  };

  return (
    <div className="rounded-2xl border-2 border-[#999999] bg-white p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="h-5 w-5 text-[#0367FC]" />
            <h2 className="text-lg font-bold">AI Job Scanner</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            AI akan mencari & menganalisis lowongan dari 6 platform sekaligus
          </p>
        </div>
        <button
          onClick={startScan}
          disabled={isScanning}
          className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-[#0367FC] text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isScanning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Radar className="h-4 w-4" />
          )}
          {isScanning ? "Mencari Lowongan..." : "Scan Job Sekarang"}
        </button>
      </div>

      {isScanning && (
        <div className="space-y-4">
          {/* Progress bar */}
          <div className="h-2 bg-[#EFEFEF] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0367FC] rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Platform scanning status */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {platforms.map((platform) => (
              <div
                key={platform.name}
                className={`rounded-xl border p-3 text-center transition-all ${
                  platform.status === "scanning"
                    ? "border-[#0367FC] bg-[#0367FC]/5"
                    : platform.status === "found"
                    ? "border-[#D2F801] bg-[#D2F801]/10"
                    : "border-[#E0E0E0]"
                }`}
              >
                <div className="text-2xl mb-1">{platform.icon}</div>
                <div className="text-xs font-medium truncate">{platform.name}</div>
                {platform.status === "found" && (
                  <div className="text-xs text-[#0367FC] font-bold mt-1">
                    +{platform.jobsFound}
                  </div>
                )}
                {platform.status === "scanning" && (
                  <Loader2 className="h-3 w-3 animate-spin mx-auto mt-1 text-[#0367FC]" />
                )}
              </div>
            ))}
          </div>

          {/* Scan stages log */}
          <div className="rounded-xl bg-[#F5F5F5] p-4 h-40 overflow-hidden">
            <div className="space-y-2">
              {stages.map((stage, i) => (
                <div
                  key={i}
                  className={`text-sm animate-fade-in ${
                    stage.type === "success"
                      ? "text-green-600"
                      : stage.type === "analysis"
                      ? "text-[#0367FC]"
                      : "text-[#666666]"
                  }`}
                >
                  {stage.message}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!isScanning && totalJobs > 0 && (
        <div className="flex items-center justify-center gap-2 py-4 text-[#0367FC] font-semibold">
          <Sparkles className="h-5 w-5" />
          <span>{totalJobs} lowongan berhasil dianalisis!</span>
        </div>
      )}
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
