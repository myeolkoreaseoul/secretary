"use client";
import { useState } from "react";
import { Youtube, Search, FileText, PlayCircle } from "lucide-react";

export default function YTPage() {
  const [activeTab, setActiveTab] = useState('digest');

  const tabs = [
    { id: 'digest', label: 'AI Digest' },
    { id: 'videos', label: 'Videos' },
  ];

  return (
    <div className="max-w-[800px] mx-auto space-y-5">
      <h1 className="text-[20px] font-bold text-grey-900 flex items-center gap-2">
        <Youtube className="text-red-500" size={22} /> YouTube
      </h1>

      {/* L2: Sub Tabs */}
      <div className="flex gap-0 border-b border-hairline">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-4 py-2.5 text-[14px] font-semibold transition-colors ${
              activeTab === tab.id ? "text-grey-900" : "text-grey-500 hover:text-grey-700"
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-[2px] bg-blue-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'digest' ? <DigestTab /> : <VideosTab />}
    </div>
  );
}

function DigestTab() {
  return (
    <div className="rounded-lg p-4 bg-bg-level1 border border-hairline space-y-5">
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <div className="flex gap-2">
          <button className="px-3 py-1.5 bg-blue-500/10 text-blue-500 rounded-lg text-[12px] font-semibold">Morning Brief</button>
          <button className="px-3 py-1.5 text-grey-500 hover:bg-bg-level2 rounded-lg text-[12px] font-semibold transition-colors">Evening Review</button>
        </div>
        <input type="date" className="bg-bg-base border border-hairline rounded-lg px-3 py-1.5 text-[12px] text-grey-700 outline-none" />
      </div>

      <div className="space-y-6">
        {[1,2,3].map(i => (
          <div key={i} className="flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-44 shrink-0 space-y-1.5">
              <div className="aspect-video bg-bg-level2 rounded-lg overflow-hidden relative">
                <div className="absolute inset-0 flex items-center justify-center text-grey-500"><PlayCircle size={28}/></div>
              </div>
              <p className="text-[12px] font-semibold text-grey-800 line-clamp-2">How to build a SaaS in 24 hours with Next.js 15</p>
              <p className="text-[11px] text-grey-500">Tech Channel &middot; 14 mins</p>
            </div>
            <div className="flex-1 bg-bg-base rounded-lg p-4 border border-hairline">
              <h4 className="text-[12px] font-semibold text-blue-500 mb-2">AI Summary</h4>
              <ul className="text-[13px] text-grey-700 space-y-1.5 list-disc pl-4">
                <li>Key takeaway one from the video explaining the core concept.</li>
                <li>Another important point discussed around 5:30.</li>
                <li>Actionable advice: use standard components to speed up dev.</li>
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VideosTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-bg-level1 border border-hairline focus-within:shadow-[0_0_0_2px_rgba(49,130,246,0.3)]">
        <Search size={16} className="text-grey-500" />
        <input placeholder="Search saved videos..." className="flex-1 bg-transparent text-[14px] text-grey-800 placeholder:text-grey-400 outline-none" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {[1,2,3,4,5,6,7,8].map(i => (
          <div key={i} className="group cursor-pointer space-y-2">
            <div className="aspect-video bg-bg-level2 rounded-lg overflow-hidden relative border border-hairline group-hover:border-grey-300 transition-colors">
              <div className="absolute inset-0 flex items-center justify-center text-grey-500 group-hover:text-grey-600 transition-colors"><PlayCircle size={32}/></div>
              <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-[10px] text-grey-800 px-1.5 py-0.5 rounded font-mono font-semibold">12:34</div>
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-grey-800 leading-tight group-hover:text-blue-500 transition-colors line-clamp-2">Understanding React Server Components Architecture</h3>
              <p className="text-[11px] text-grey-500 mt-0.5">WebDev Channel</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
