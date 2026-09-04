"use client";

import {
  useState,
  useTransition,
  type ComponentPropsWithoutRef,
} from "react";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import PwaInstall from "./PwaInstall";
import { refreshActionableUpdates, refreshInventory } from "./actions";

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
  const changeMatch = body.match(
    /\|\s*\[([^\]]+)\].*?\|\s*\[?`([^`]+)`\s*(?:→|&rarr;)\s*`([^`]+)`\]?/,
  );
  const ageBadge = body.match(
    /!\[age\]\((https:\/\/developer\.mend\.io[^)]+)\)/,
  )?.[1];
  const confidenceBadge = body.match(
    /!\[confidence\]\((https:\/\/developer\.mend\.io[^)]+)\)/,
  )?.[1];
  const versionTransitions = body.match(/`[^`]+`\s*(?:→|&rarr;)\s*`[^`]+`/g);
  const isBatched = (versionTransitions?.length || 0) > 1;

  return {
    packageName: changeMatch ? changeMatch[1] : title,
    currentVersion: changeMatch && !isBatched ? changeMatch[2] : null,
    newVersion: changeMatch && !isBatched ? changeMatch[3] : null,
    isBatched,
    ageBadge,
    confidenceBadge,
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

// Helper: Strip react-markdown's internal `node` prop before spreading the rest onto a DOM element, without ever binding an unused `node` variable.
function omitNode<T extends { node?: unknown }>(props: T): Omit<T, "node"> {
  const rest: Record<string, unknown> = { ...props };
  delete rest.node;
  return rest as Omit<T, "node">;
}

// Helper: Turn a repo name into a DOM-safe id for scroll-to-repo anchors.
function repoElementId(repoName: string) {
  return `repo-${repoName.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

// Helper: Find the open Renovate PR (if any) that carries the real,
// lockfile-resolved version transition for an inventory item. The
// "Detected Dependencies" data only reflects the manifest-declared range,
// which often doesn't change for in-range/lockfile-only updates.
function findMatchingPR(
  item: InventoryItem,
  prs: PullRequestUpdate[],
): PullRequestUpdate | undefined {
  return prs.find(
    (pr) =>
      pr.repo === item.repo &&
      parsePRData(pr.title, pr.body).packageName.toLowerCase() ===
        item.packageName.toLowerCase(),
  );
}

// Shared react-markdown renderer, reused by both the PR changelog panel and
// the dependency detail panel.
const markdownComponents = {
  h3: (props: ComponentPropsWithoutRef<"h3"> & ExtraProps) => (
    <h3
      className="text-lg font-bold text-slate-800 mt-8 mb-3 pb-2 border-b border-slate-200"
      {...omitNode(props)}
    />
  ),
  a: (props: ComponentPropsWithoutRef<"a"> & ExtraProps) => {
    const rest = omitNode(props);
    if (String(rest.children).includes("Compare Source")) {
      return (
        <a
          {...rest}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-mono font-medium rounded-md transition-colors mt-1 mb-5 shadow-sm"
        >
          <svg
            className="w-3.5 h-3.5 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
          Compare Source Diff
        </a>
      );
    }
    return (
      <a
        {...rest}
        target="_blank"
        rel="noopener noreferrer"
        className="text-indigo-600 hover:text-indigo-800 underline underline-offset-2 font-medium"
      />
    );
  },
  table: (props: ComponentPropsWithoutRef<"table"> & ExtraProps) => (
    <div className="overflow-x-auto mb-8 border border-slate-200 rounded-lg shadow-sm">
      <table
        className="min-w-full divide-y divide-slate-200 m-0"
        {...omitNode(props)}
      />
    </div>
  ),
  thead: (props: ComponentPropsWithoutRef<"thead"> & ExtraProps) => (
    <thead className="bg-slate-100" {...omitNode(props)} />
  ),
  th: (props: ComponentPropsWithoutRef<"th"> & ExtraProps) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider m-0"
      {...omitNode(props)}
    />
  ),
  td: (props: ComponentPropsWithoutRef<"td"> & ExtraProps) => (
    <td
      className="px-4 py-3 text-sm text-slate-700 border-t border-slate-100 m-0"
      {...omitNode(props)}
    />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul"> & ExtraProps) => (
    <ul
      className="list-disc pl-5 space-y-1.5 mb-6 text-slate-600"
      {...omitNode(props)}
    />
  ),
  li: (props: ComponentPropsWithoutRef<"li"> & ExtraProps) => (
    <li className="text-sm leading-relaxed" {...omitNode(props)} />
  ),
  p: (props: ComponentPropsWithoutRef<"p"> & ExtraProps) => (
    <p
      className="text-sm text-slate-700 mb-4 leading-relaxed"
      {...omitNode(props)}
    />
  ),
  code: ({
    inline,
    ...rest
  }: ComponentPropsWithoutRef<"code"> & ExtraProps & { inline?: boolean }) =>
    inline ? (
      <code
        className="px-1.5 py-0.5 bg-slate-100 text-pink-600 rounded text-xs font-mono border border-slate-200"
        {...omitNode(rest)}
      />
    ) : (
      <code {...omitNode(rest)} />
    ),
};

// Floating widget to jump straight to a repo's section.
function RepoJumpNav({ repoNames }: { repoNames: string[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  if (repoNames.length <= 1) return null;

  const filtered = repoNames.filter((name) =>
    name.toLowerCase().includes(query.toLowerCase()),
  );

  const jumpTo = (repoName: string) => {
    document
      .getElementById(repoElementId(repoName))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setIsOpen(false);
    setQuery("");
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      )}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {isOpen && (
          <div className="w-72 max-w-[calc(100vw-3rem)] max-h-[60vh] flex flex-col bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-3 border-b border-slate-200 shrink-0">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Jump to Repo..."
                className="w-full px-3 py-2 text-sm bg-slate-100 rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-400">
                  No Matching Repos
                </p>
              ) : (
                filtered.map((repoName) => (
                  <button
                    key={repoName}
                    onClick={() => jumpTo(repoName)}
                    className="w-full text-left px-4 py-2.5 text-sm font-mono text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors truncate"
                  >
                    {repoName}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white pl-4 pr-5 py-3 rounded-full shadow-lg transition-all"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
          <span className="text-sm font-semibold">Jump to Repo</span>
          <span className="bg-indigo-500 text-xs font-bold px-2 py-0.5 rounded-full">
            {repoNames.length}
          </span>
        </button>
      </div>
    </>
  );
}

export default function DashboardUI({
  inventory: initialInventory,
  actionablePRs: initialActionablePRs,
}: {
  inventory: InventoryItem[];
  actionablePRs: PullRequestUpdate[];
}) {
  const [inventory, setInventory] = useState(initialInventory);
  const [actionablePRs, setActionablePRs] = useState(initialActionablePRs);
  const [isRefreshingUpdates, startUpdatesRefresh] = useTransition();
  const [isRefreshingInventory, startInventoryRefresh] = useTransition();
  const [activeTab, setActiveTab] = useState<"updates" | "inventory">(
    "updates",
  );
  const [selectedUpdate, setSelectedUpdate] =
    useState<PullRequestUpdate | null>(null);
  const [selectedInventoryItem, setSelectedInventoryItem] =
    useState<InventoryItem | null>(null);

  const handleRefreshUpdates = () => {
    startUpdatesRefresh(async () => {
      setActionablePRs(await refreshActionableUpdates());
    });
  };

  const handleRefreshInventory = () => {
    startInventoryRefresh(async () => {
      setInventory(await refreshInventory());
    });
  };

  // Sort and Group Inventory Data
  const sortedInventory = [...inventory].sort((a, b) =>
    a.packageName.localeCompare(b.packageName),
  );

  const groupedInventory = sortedInventory.reduce(
    (acc, item) => {
      if (!acc[item.repo]) acc[item.repo] = [];
      acc[item.repo].push(item);
      return acc;
    },
    {} as Record<string, InventoryItem[]>,
  );

  // Group Actionable Updates
  const groupedPRs = actionablePRs.reduce(
    (acc, pr) => {
      if (!acc[pr.repo]) acc[pr.repo] = [];
      acc[pr.repo].push(pr);
      return acc;
    },
    {} as Record<string, PullRequestUpdate[]>,
  );

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900 relative">
      <div className="max-w-7xl mx-auto">
        {/* Header & Tab Navigation */}
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Dependency Dashboard
            </h1>
            <p className="text-slate-500 mt-1">
              Manage Project Dependencies & Track Actionable Updates
            </p>
          </div>
          <PwaInstall />

          <div className="flex bg-slate-200 p-1 rounded-lg shadow-inner w-full sm:w-auto self-stretch sm:self-auto md:self-auto">
            <button
              onClick={() => setActiveTab("updates")}
              className={`flex-1 sm:flex-initial px-4 sm:px-6 py-2.5 rounded-md text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === "updates"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <span className="sm:hidden">Updates</span>
              <span className="hidden sm:inline">Actionable Updates</span>
              {actionablePRs.length > 0 && (
                <span className="ml-2 bg-indigo-100 text-indigo-700 py-0.5 px-2 rounded-full text-xs">
                  {actionablePRs.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("inventory")}
              className={`flex-1 sm:flex-initial px-4 sm:px-6 py-2.5 rounded-md text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === "inventory"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <span className="sm:hidden">Packages</span>
              <span className="hidden sm:inline">All Packages</span>
            </button>
          </div>
        </header>

        {/* --- DATA SOURCE DESCRIPTION --- */}
        <div className="mb-6 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-900">
          <svg
            className="w-5 h-5 shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          {activeTab === "updates" ? (
            <p key="updates-desc">
              <strong>Source:</strong>{" "}
              <span>
                Open pull requests created by Renovate for each repository. Each
                row shows the real, lockfile-resolved version change (e.g.{" "}
                <code className="font-mono bg-white/60 px-1 rounded">
                  1.11.21 → 1.11.23
                </code>
                ) taken directly from the PR — this is the version that actually
                gets installed once merged.
              </span>
            </p>
          ) : (
            <p key="inventory-desc">
              <strong>Source:</strong>{" "}
              <span>
                The version range declared in each repo&apos;s manifest (e.g.{" "}
                <code className="font-mono bg-white/60 px-1 rounded">
                  package.json
                </code>
                ), read from Renovate&apos;s &quot;Detected Dependencies&quot;
                list. A range like{" "}
                <code className="font-mono bg-white/60 px-1 rounded">
                  ^1.11.11
                </code>{" "}
                can already cover a newer release without needing to change —
                click a row to see the real pending version if an update PR
                exists.
              </span>
            </p>
          )}
          <button
            onClick={
              activeTab === "updates"
                ? handleRefreshUpdates
                : handleRefreshInventory
            }
            disabled={
              activeTab === "updates"
                ? isRefreshingUpdates
                : isRefreshingInventory
            }
            className="ml-auto shrink-0 flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 bg-white hover:bg-blue-100 border border-blue-200 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <svg
              className={`w-3.5 h-3.5 ${
                (
                  activeTab === "updates"
                    ? isRefreshingUpdates
                    : isRefreshingInventory
                )
                  ? "animate-spin"
                  : ""
              }`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <path d="M4 4v5h5M20 20v-5h-5" />
              <path d="M4.5 9A7.5 7.5 0 0119 7.5M19.5 15A7.5 7.5 0 015 16.5" />
            </svg>
            Refresh
          </button>
        </div>

        {/* --- VIEW 1: ACTIONABLE UPDATES (PRs) --- */}
        {activeTab === "updates" &&
          (Object.keys(groupedPRs).length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
              <span className="text-3xl block mb-3">🎉</span>
              No Pending Updates
            </div>
          ) : (
            <div className="space-y-8 animate-fade-in">
              {Object.entries(groupedPRs)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([repoName, repoUpdates]) => (
                  <div
                    key={`pr-${repoName}`}
                    id={repoElementId(repoName)}
                    className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden scroll-mt-6"
                  >
                    <div className="bg-slate-800 px-6 py-4 border-b border-slate-200 flex justify-between items-center gap-3">
                      <h2 className="text-lg font-semibold text-white tracking-wide truncate min-w-0">
                        📦 {repoName}
                      </h2>
                      <a
                        href={`https://github.com/PT-Helios-Informatika-Nusantara/${repoName}/issues?q=is%3Aissue+is%3Aopen+Dependency+Dashboard`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Manage on GitHub"
                        className="shrink-0 text-xs font-mono font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 border border-slate-600 px-3 py-1.5 rounded-md transition-all flex items-center gap-2 shadow-sm"
                      >
                        <span className="hidden sm:inline">
                          Manage on GitHub
                        </span>
                        <svg
                          className="w-3.5 h-3.5 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">
                              Package
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">
                              Version Change
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">
                              Metrics
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/12">
                              State
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/6">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {[...repoUpdates]
                            .sort((a, b) =>
                              parsePRData(
                                a.title,
                                a.body,
                              ).packageName.localeCompare(
                                parsePRData(b.title, b.body).packageName,
                              ),
                            )
                            .map((update) => {
                              const prData = parsePRData(
                                update.title,
                                update.body,
                              );
                              const isCore = CORE_FRAMEWORKS.includes(
                                prData.packageName.toLowerCase(),
                              );
                              return (
                                <tr
                                  key={update.id}
                                  onClick={() => setSelectedUpdate(update)}
                                  className="hover:bg-indigo-50 transition-colors cursor-pointer group"
                                >
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-slate-800 font-mono">
                                        {prData.packageName}
                                      </span>
                                      {isCore && (
                                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider font-mono bg-indigo-100 text-indigo-700 border border-indigo-200 rounded">
                                          Core
                                        </span>
                                      )}
                                      {prData.isBatched && (
                                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700 rounded border border-slate-300">
                                          Batched
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    {prData.currentVersion &&
                                    prData.newVersion ? (
                                      <div className="flex items-center gap-2 text-sm font-mono">
                                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-300">
                                          {prData.currentVersion}
                                        </span>
                                        <span className="text-slate-400">
                                          →
                                        </span>
                                        <span className="bg-blue-50 text-blue-700 font-bold px-2.5 py-1 rounded-md border border-blue-200">
                                          {prData.newVersion}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-sm text-slate-400 italic">
                                        See Changelog Details
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex flex-col gap-2">
                                      {prData.ageBadge && (
                                        // eslint-disable-next-line @next/next/no-img-element -- variable-width remote SVG badge; real intrinsic width is unknown ahead of render, so next/image's required static width/height would either misrepresent it or force a fixed box, defeating the auto width
                                        <img
                                          src={prData.ageBadge}
                                          alt="Age Metric"
                                          className="h-5 w-auto object-contain object-left"
                                        />
                                      )}
                                      {prData.confidenceBadge && (
                                        // eslint-disable-next-line @next/next/no-img-element -- variable-width remote SVG badge; real intrinsic width is unknown ahead of render, so next/image's required static width/height would either misrepresent it or force a fixed box, defeating the auto width
                                        <img
                                          src={prData.confidenceBadge}
                                          alt="Confidence Metric"
                                          className="h-5 w-auto object-contain object-left"
                                        />
                                      )}
                                      {!prData.ageBadge &&
                                        !prData.confidenceBadge && (
                                          <span className="text-xs text-slate-400">
                                            No Metrics Available
                                          </span>
                                        )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span
                                      className={`px-2.5 py-1 inline-flex text-[10px] font-bold uppercase tracking-wide rounded-full ${update.isDraft ? "bg-slate-200 text-slate-700" : "bg-blue-100 text-blue-700"}`}
                                    >
                                      {update.isDraft ? "Draft" : "Open"}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-right">
                                    <span className="text-sm text-indigo-600 font-medium group-hover:underline">
                                      Review &rarr;
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
          ))}

        {/* --- VIEW 2: INVENTORY (All Packages) --- */}
        {activeTab === "inventory" &&
          (Object.keys(groupedInventory).length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
              No Package Inventory Data Discovered. Check the GitHub App
              Permissions or Renovate Config.
            </div>
          ) : (
            <div className="space-y-8 animate-fade-in">
              {Object.entries(groupedInventory)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([repoName, repoItems]) => (
                  <div
                    key={`inv-${repoName}`}
                    id={repoElementId(repoName)}
                    className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden scroll-mt-6"
                  >
                    <div className="bg-slate-800 px-6 py-4 border-b border-slate-200 flex justify-between items-center gap-3">
                      <h2 className="text-lg font-semibold text-white tracking-wide truncate min-w-0">
                        📦 {repoName}
                      </h2>
                      <a
                        href={`https://github.com/PT-Helios-Informatika-Nusantara/${repoName}/issues?q=is%3Aissue+is%3Aopen+Dependency+Dashboard`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Manage on GitHub"
                        className="shrink-0 text-xs font-mono font-medium text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 border border-slate-600 px-3 py-1.5 rounded-md transition-all flex items-center gap-2 shadow-sm"
                      >
                        <span className="hidden sm:inline">
                          Manage on GitHub
                        </span>
                        <svg
                          className="w-3.5 h-3.5 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                      </a>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">
                              Package
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">
                              Current Version
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">
                              New Version
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-1/4">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {repoItems.map((item) => {
                            const isCore = CORE_FRAMEWORKS.includes(
                              item.packageName.toLowerCase(),
                            );
                            const hasUpdate = !!item.targetVersion;

                            return (
                              <tr
                                key={item.id}
                                onClick={() => setSelectedInventoryItem(item)}
                                className="hover:bg-slate-50 transition-colors cursor-pointer"
                              >
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-slate-800 font-mono">
                                      {item.packageName}
                                    </span>
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
                                    <span className="text-slate-300 font-bold pl-4">
                                      --
                                    </span>
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
                                    {hasUpdate
                                      ? "Update Available"
                                      : "Up to date"}
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
          ))}
      </div>

      <RepoJumpNav
        repoNames={Object.keys(
          activeTab === "updates" ? groupedPRs : groupedInventory,
        ).sort((a, b) => a.localeCompare(b))}
      />

      {/* --- THE SLIDE-OVER PANEL (Only Renders for Updates) --- */}
      {selectedUpdate && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedUpdate(null)}
          ></div>

          <div className="relative w-full max-w-3xl bg-white h-full shadow-2xl flex flex-col animate-slide-in-right">
            <div className="bg-slate-800 px-8 py-6 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-mono text-white font-semibold truncate pr-4">
                {selectedUpdate.title}
              </h3>
              <button
                onClick={() => setSelectedUpdate(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="p-8 overflow-y-auto grow bg-slate-50">
              <div className="max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {cleanMarkdownBody(selectedUpdate.body)}
                </ReactMarkdown>
              </div>
            </div>

            <div className="bg-white px-8 py-5 border-t border-slate-200 shrink-0 flex justify-end shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
              <a
                href={selectedUpdate.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-md font-semibold tracking-wide transition-colors shadow-sm flex items-center gap-2"
              >
                Review & Merge on GitHub
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* --- DEPENDENCY DETAIL PANEL (Inventory tab) --- */}
      {selectedInventoryItem &&
        (() => {
          const matchingPR = findMatchingPR(
            selectedInventoryItem,
            actionablePRs,
          );
          const prData = matchingPR
            ? parsePRData(matchingPR.title, matchingPR.body)
            : null;
          const isLockfileOnly =
            !!selectedInventoryItem.targetVersion &&
            selectedInventoryItem.currentVersion ===
              selectedInventoryItem.targetVersion;

          return (
            <div className="fixed inset-0 z-50 flex justify-end">
              <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
                onClick={() => setSelectedInventoryItem(null)}
              ></div>

              <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-slide-in-right">
                <div className="bg-slate-800 px-8 py-6 flex justify-between items-center shrink-0">
                  <div className="min-w-0">
                    <h3 className="text-xl font-mono text-white font-semibold truncate pr-4">
                      {selectedInventoryItem.packageName}
                    </h3>
                    <p className="text-sm text-slate-400 mt-1">
                      {selectedInventoryItem.repo}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedInventoryItem(null)}
                    className="text-slate-400 hover:text-white transition-colors shrink-0"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <div className="p-8 overflow-y-auto grow bg-slate-50 space-y-6">
                  <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                      Declared in Package Manifest
                    </h4>
                    <div className="flex items-center gap-2 text-sm font-mono">
                      <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-300">
                        {selectedInventoryItem.currentVersion}
                      </span>
                      {selectedInventoryItem.targetVersion &&
                        selectedInventoryItem.targetVersion !==
                          selectedInventoryItem.currentVersion && (
                          <>
                            <span className="text-slate-400">→</span>
                            <span className="bg-blue-50 text-blue-700 font-bold px-2.5 py-1 rounded-md border border-blue-200">
                              {selectedInventoryItem.targetVersion}
                            </span>
                          </>
                        )}
                    </div>
                    {isLockfileOnly && (
                      <p className="text-xs text-slate-500 mt-3 leading-relaxed">
                        🔒 The declared range already covers the latest matching
                        release, so{" "}
                        <code className="font-mono bg-slate-100 px-1 rounded">
                          package.json
                        </code>{" "}
                        doesn&apos;t need to change — only the lockfile-resolved
                        version updates (see below).
                      </p>
                    )}
                  </div>

                  {matchingPR ? (
                    <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Pending Update
                        </h4>
                        <span
                          className={`px-2.5 py-1 inline-flex text-[10px] font-bold uppercase tracking-wide rounded-full ${matchingPR.isDraft ? "bg-slate-200 text-slate-700" : "bg-blue-100 text-blue-700"}`}
                        >
                          {matchingPR.isDraft ? "Draft" : "Open"}
                        </span>
                      </div>
                      {prData?.currentVersion && prData?.newVersion ? (
                        <div className="flex items-center gap-2 text-sm font-mono mb-4">
                          <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-300">
                            {prData.currentVersion}
                          </span>
                          <span className="text-slate-400">→</span>
                          <span className="bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-md border border-emerald-200">
                            {prData.newVersion}
                          </span>
                          <span className="text-xs text-slate-400 ml-1">
                            (actual resolved version)
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400 italic mb-4">
                          See changelog details below.
                        </p>
                      )}
                      <a
                        href={matchingPR.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium underline underline-offset-2"
                      >
                        View PR #{matchingPR.prNumber} on GitHub
                      </a>

                      <div className="mt-6 pt-6 border-t border-slate-200 max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={markdownComponents}
                        >
                          {cleanMarkdownBody(matchingPR.body)}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : selectedInventoryItem.targetVersion ? (
                    <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm text-sm text-slate-500">
                      No open Renovate PR found for this package yet — it may
                      not have been created, or it was already merged or closed.
                    </div>
                  ) : (
                    <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-5 text-sm text-emerald-800">
                      ✅ Up to date — no pending updates detected for this
                      package.
                    </div>
                  )}
                </div>

                {matchingPR && (
                  <div className="bg-white px-8 py-5 border-t border-slate-200 shrink-0 flex justify-end shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                    <a
                      href={matchingPR.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-md font-semibold tracking-wide transition-colors shadow-sm flex items-center gap-2"
                    >
                      Review & Merge on GitHub
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
    </main>
  );
}
