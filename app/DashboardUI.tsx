"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface InventoryItem {
  id: string;
  repo: string;
  packageName: string;
  currentVersion: string;
  targetVersion: string | null;
}

export interface PullRequestUpdate {
  id: string;
  repo: string;
  title: string;
  body: string;
  prNumber: number;
  htmlUrl: string;
  isDraft: boolean;
}

const CORE_FRAMEWORKS = ["next", "go", "flutter", "react"];

// Helper: Extract data for the Actionable Updates table
function parsePRData(title: string, body: string) {
  const changeMatch = body.match(/\|\s*\[([^\]]+)\].*?\|\s*\[?`([^`]+)`\s*(?:→|&rarr;)\s*`([^`]+)`\]?/);
  const ageBadge = body.match(/!\[age\]\((https:\/\/developer\.mend\.io[^)]+)\)/)?.[1];
  const confidenceBadge = body.match(/!\[confidence\]\((https:\/\/developer\.mend\.io[^)]+)\)/)?.[1];
  const versionTransitions = body.match(/`[^`]+`\s*(?:→|&rarr;)\s*`[^`]+`/g);
  const isBatched = (versionTransitions?.length || 0) > 1;

  return {
    packageName: changeMatch ? changeMatch[1] : title,
    currentVersion: changeMatch && !isBatched ? changeMatch[2] : null,
    newVersion: changeMatch && !isBatched ? changeMatch[3] : null,
    isBatched,
    ageBadge,
    confidenceBadge
  };
}

// Helper: Clean the Markdown for the Slide-Over Panel
function cleanMarkdownBody(body: string) {
  const parts = body.split(/(?:\n---[\s\n]*### Configuration)/);
  let cleanBody = parts[0] || body;
  cleanBody = cleanBody.replace(/<details>/gi, "");
  cleanBody = cleanBody.replace(/<\/details>/gi, "");
  cleanBody = cleanBody.replace(/<summary>.*?<\/summary>/gi, "");
  return cleanBody.trim() || "No release notes provided for this update.";
}

export default function DashboardUI({ inventory, actionablePRs }: { inventory: InventoryItem[], actionablePRs: PullRequestUpdate[] }) {
  const [activeTab, setActiveTab] = useState<'updates' | 'inventory'>('updates');
  const [selectedUpdate, setSelectedUpdate] = useState<PullRequestUpdate | null>(null);

  // Sort and Group Inventory Data
  const sortedInventory = [...inventory].sort((a, b) => {
    // 1. Force core frameworks to the absolute top
    const aIsCore = CORE_FRAMEWORKS.includes(a.packageName.toLowerCase());
    const bIsCore = CORE_FRAMEWORKS.includes(b.packageName.toLowerCase());
    if (aIsCore && !bIsCore) return -1;
    if (!aIsCore && bIsCore) return 1;

    // 2. Then sort by Actionable Updates
    const aHasUpdate = !!a.targetVersion;
    const bHasUpdate = !!b.targetVersion;
    if (aHasUpdate !== bHasUpdate) return aHasUpdate ? -1 : 1;

    // 3. Finally, sort alphabetically
    return a.packageName.localeCompare(b.packageName);
  });

  const groupedInventory = sortedInventory.reduce((acc, item) => {
    if (!acc[item.repo]) acc[item.repo] = [];
    acc[item.repo].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  // Group Actionable Updates
  const groupedPRs = actionablePRs.reduce((acc, pr) => {
    if (!acc[pr.repo]) acc[pr.repo] = [];
    acc[pr.repo].push(pr);
    return acc;
  }, {} as Record<string, PullRequestUpdate[]>);

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900 relative">
      <div className="max-w-[80rem] mx-auto">
        
        {/* Header & Tab Navigation */}
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Centralized Dependency Monitoring Dashboard PoC</h1>
            <p className="text-slate-500 mt-2">Manage project dependencies and track actionable updates</p>
          </div>
          
          <div className="flex bg-slate-200 p-1 rounded-lg shadow-inner self-start md:self-auto">
            <button
              onClick={() => setActiveTab('updates')}
              className={`px-6 py-2.5 rounded-md text-sm font-semibold transition-all ${
                activeTab === 'updates' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Actionable Updates
              {actionablePRs.length > 0 && (
                <span className="ml-2 bg-indigo-100 text-indigo-700 py-0.5 px-2 rounded-full text-xs">
                  {actionablePRs.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-6 py-2.5 rounded-md text-sm font-semibold transition-all ${
                activeTab === 'inventory' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              All Packages
            </button>
          </div>
        </header>

        {/* --- VIEW 1: ACTIONABLE UPDATES (PRs) --- */}
        {activeTab === 'updates' && (
          Object.keys(groupedPRs).length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
              <span className="text-3xl block mb-3">🎉</span>
              Inbox Zero! No pending updates across your infrastructure.
            </div>
          ) : (
            <div className="space-y-8 animate-fade-in">
              {Object.entries(groupedPRs).map(([repoName, repoUpdates]) => (
                <div key={`pr-${repoName}`} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-800 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-white tracking-wide">📦 {repoName}</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">Package</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">Version Change</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">Metrics</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/12">State</th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/6">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {repoUpdates.map((update) => {
                          const prData = parsePRData(update.title, update.body);
                          return (
                            <tr key={update.id} onClick={() => setSelectedUpdate(update)} className="hover:bg-indigo-50 transition-colors cursor-pointer group">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-800 font-mono">{prData.packageName}</span>
                                  {prData.isBatched && <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700 rounded border border-slate-300">Batched</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {prData.currentVersion && prData.newVersion ? (
                                  <div className="flex items-center gap-2 text-sm font-mono">
                                    <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-300">{prData.currentVersion}</span>
                                    <span className="text-slate-400">→</span>
                                    <span className="bg-blue-50 text-blue-700 font-bold px-2.5 py-1 rounded-md border border-blue-200">{prData.newVersion}</span>
                                  </div>
                                ) : (
                                  <span className="text-sm text-slate-400 italic">See changelog details</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex flex-col gap-2">
                                  {prData.ageBadge && <img src={prData.ageBadge} alt="Age Metric" className="h-5 w-auto object-contain object-left" />}
                                  {prData.confidenceBadge && <img src={prData.confidenceBadge} alt="Confidence Metric" className="h-5 w-auto object-contain object-left" />}
                                  {!prData.ageBadge && !prData.confidenceBadge && <span className="text-xs text-slate-400">No metrics available</span>}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2.5 py-1 inline-flex text-[10px] font-bold uppercase tracking-wide rounded-full ${update.isDraft ? "bg-slate-200 text-slate-700" : "bg-blue-100 text-blue-700"}`}>{update.isDraft ? "Draft" : "Open"}</span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-right">
                                <span className="text-sm text-indigo-600 font-medium group-hover:underline">Review &rarr;</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* --- VIEW 2: INVENTORY (All Packages) --- */}
        {activeTab === 'inventory' && (
          Object.keys(groupedInventory).length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
              No package inventory data discovered. Check your GitHub App permissions or Renovate config.
            </div>
          ) : (
            <div className="space-y-8 animate-fade-in">
              {Object.entries(groupedInventory).map(([repoName, repoItems]) => (
                <div key={`inv-${repoName}`} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-800 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-white tracking-wide">📦 {repoName}</h2>
                    <a
                      href={`https://github.com/hezkiawan/${repoName}/issues?q=is%3Aissue+is%3Aopen+Dependency+Dashboard`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 border border-slate-600 px-3 py-1.5 rounded-md transition-all flex items-center gap-2 shadow-sm"
                    >
                      <span>Manage on GitHub</span>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">Package</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">Current Version</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">New Version</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {repoItems.map((item) => {
                          const isCore = CORE_FRAMEWORKS.includes(item.packageName.toLowerCase());
                          const hasUpdate = !!item.targetVersion;

                          return (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium text-slate-800 font-mono">{item.packageName}</span>
                                  {isCore && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono bg-indigo-100 text-indigo-700 border border-indigo-200 rounded">
                                      Core
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <div className="font-mono text-slate-800 font-medium bg-slate-100 inline-block px-2.5 py-1 rounded-md border border-slate-300">
                                  {item.currentVersion}
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">
                                {hasUpdate ? (
                                  <div className="inline-block bg-blue-50 text-blue-700 font-bold font-mono px-2.5 py-1 rounded-md border border-blue-200">
                                    {item.targetVersion}
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-bold pl-4">--</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span
                                  className={`px-3 py-1 inline-flex text-xs font-bold uppercase tracking-wide rounded-full ${
                                    hasUpdate
                                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                                      : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                  }`}
                                >
                                  {hasUpdate ? "Update Available" : "Up to date"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* --- THE SLIDE-OVER PANEL (Only renders for Updates) --- */}
      {selectedUpdate && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setSelectedUpdate(null)}></div>
          
          <div className="relative w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col animate-slide-in-right">
            <div className="bg-slate-800 px-8 py-6 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-mono text-white font-semibold truncate pr-4">{selectedUpdate.title}</h3>
              <button onClick={() => setSelectedUpdate(null)} className="text-slate-400 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-8 overflow-y-auto grow bg-slate-50">
              <div className="max-w-none">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h3: ({node, ...props}) => <h3 className="text-lg font-bold text-slate-800 mt-8 mb-3 pb-2 border-b border-slate-200" {...props} />,
                    a: ({node, ...props}) => {
                      if (String(props.children).includes("Compare Source")) {
                        return (
                          <a {...props} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-mono font-medium rounded-md transition-colors mt-1 mb-5 shadow-sm">
                            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                            Compare Source Diff
                          </a>
                        );
                      }
                      return <a {...props} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 underline underline-offset-2 font-medium" />;
                    },
                    table: ({node, ...props}) => <div className="overflow-x-auto mb-8 border border-slate-200 rounded-lg shadow-sm"><table className="min-w-full divide-y divide-slate-200 m-0" {...props} /></div>,
                    thead: ({node, ...props}) => <thead className="bg-slate-100" {...props} />,
                    th: ({node, ...props}) => <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider m-0" {...props} />,
                    td: ({node, ...props}) => <td className="px-4 py-3 text-sm text-slate-700 border-t border-slate-100 m-0" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc pl-5 space-y-1.5 mb-6 text-slate-600" {...props} />,
                    li: ({node, ...props}) => <li className="text-sm leading-relaxed" {...props} />,
                    p: ({node, ...props}) => <p className="text-sm text-slate-700 mb-4 leading-relaxed" {...props} />,
                    code: ({node, inline, ...props}: any) => inline ? <code className="px-1.5 py-0.5 bg-slate-100 text-pink-600 rounded text-xs font-mono border border-slate-200" {...props} /> : <code {...props} />
                  }}
                >
                  {cleanMarkdownBody(selectedUpdate.body)}
                </ReactMarkdown>
              </div>
            </div>

            <div className="bg-white px-8 py-5 border-t border-slate-200 shrink-0 flex justify-end shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <a href={selectedUpdate.htmlUrl} target="_blank" rel="noopener noreferrer" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-md font-semibold tracking-wide transition-colors shadow-sm flex items-center gap-2">
                Review & Merge on GitHub
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}