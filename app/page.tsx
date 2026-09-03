import axios from "axios";
import jwt from "jsonwebtoken";
import DashboardUI, { InventoryItem, PullRequestUpdate } from "./DashboardUI";

export const dynamic = "force-dynamic";

interface GitHubRepository {
  owner: { login: string };
  name: string;
}

interface GitHubIssue {
  title: string;
  body: string | null;
}

interface GitHubPullRequest {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  draft: boolean;
  user: { login: string } | null;
  head: { ref: string };
}

// GitHub list endpoints cap out at 30 results per page unless paginated
// explicitly, which was silently dropping PRs/issues once a repo passed
// that count. Follow every page so nothing gets missed.
async function fetchAllPages<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T[]> {
  const results: T[] = [];
  const separator = url.includes("?") ? "&" : "?";
  let page = 1;

  while (true) {
    const res = await axios.get(`${url}${separator}per_page=100&page=${page}`, { headers });
    results.push(...res.data);
    if (res.data.length < 100) break;
    page++;
  }

  return results;
}

// --- 1. Enterprise Authentication Flow ---
async function getInstallationToken(): Promise<string | null> {
  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_INSTALLATION_ID;
  const privateKey = process.env.GITHUB_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!appId || !installationId || !privateKey) return null;

  try {
    const payload = {
      iat: Math.floor(Date.now() / 1000) - 60,
      exp: Math.floor(Date.now() / 1000) + (10 * 60),
      iss: appId,
    };
    const signedJwt = jwt.sign(payload, privateKey, { algorithm: "RS256" });
    const res = await axios.post(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {},
      { headers: { Authorization: `Bearer ${signedJwt}`, Accept: "application/vnd.github.v3+json" } }
    );
    return res.data.token;
  } catch (error) {
    console.error("Token generation failed:", error);
    return null;
  }
}

// --- 2. Dynamic Repository Discovery ---
async function fetchInstalledRepositories(token: string) {
  try {
    const res = await axios.get("https://api.github.com/installation/repositories?per_page=100", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" },
    });
    return res.data.repositories.map((repo: GitHubRepository) => ({ owner: repo.owner.login, name: repo.name }));
  } catch (error) {
    console.error("Failed to fetch installed repositories:", error);
    return [];
  }
}

// --- 3. Unified Data Fetcher ---
async function getPlatformData() {
  const token = await getInstallationToken();
  if (!token) return { inventory: [], prs: [] };

  const repositories = await fetchInstalledRepositories(token);
  const inventory: InventoryItem[] = [];
  const prs: PullRequestUpdate[] = [];

  for (const repo of repositories) {
    try {
      const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" };

      // Make parallel requests to speed up page load
      const [issues, pulls] = await Promise.all([
        fetchAllPages<GitHubIssue>(`https://api.github.com/repos/${repo.owner}/${repo.name}/issues?state=open&creator=app/renovate`, headers).catch(() => []),
        fetchAllPages<GitHubPullRequest>(`https://api.github.com/repos/${repo.owner}/${repo.name}/pulls?state=open`, headers).catch(() => [])
      ]);

      // --- Process PRs (Actionable Updates) ---
      for (const pr of pulls) {
        const isRenovate = pr.user?.login?.includes("renovate") || pr.head.ref.startsWith("renovate/");
        if (isRenovate) {
          prs.push({
            id: `${repo.name}-pr-${pr.number}`,
            repo: repo.name,
            title: pr.title,
            body: pr.body || "",
            prNumber: pr.number,
            htmlUrl: pr.html_url,
            isDraft: pr.draft,
          });
        }
      }

      // --- Process Dashboard Issue (All Packages Inventory) ---
      const dashboardIssue = issues.find((issue) => issue.title.includes("Dependency Dashboard"));
      if (dashboardIssue && dashboardIssue.body) {
        const lines = dashboardIssue.body.split('\n');
        
        // Ensure we only parse the Detected Dependencies section to avoid parsing the Open PR checkboxes
        let isParsingDependencies = false;
        // Renovate lists the same package once per file/manager it's found in
        // (e.g. a GitHub Action used in two workflows). Track ones already
        // seen for this repo so exact duplicates only appear once.
        const seenDependencies = new Set<string>();

        for (const line of lines) {
          if (line.includes("## Detected Dependencies")) isParsingDependencies = true;
          if (!isParsingDependencies) continue;

          // 1. Normalize the line by stripping markdown lists, checkboxes, and HTML comments
          let cleanLine = line.trim();
          cleanLine = cleanLine.replace(/^(?:-\s+\[\s?[x ]?\s?\]\s+|-\s+)/, "");
          
          // FIX: Using RegExp constructor so the clipboard doesn't swallow the HTML comment string!
          cleanLine = cleanLine.replace(new RegExp("", "g"), "").trim();
          
          // 2. Strip all backticks to normalize (e.g., `http ^0.13.5` becomes http ^0.13.5)
          cleanLine = cleanLine.replace(/`/g, "");

          // 3. Extract the data. This handles both npm and Flutter formatting safely.
          const regex = /^([a-zA-Z0-9\-@/_.]+)\s+(.+?)(?:\s+(?:→|->)\s+\[Updates:\s+(.*?)\])?$/;
          const match = cleanLine.match(regex);
          
          // Ignore table of contents or empty brackets
          if (match && match[1] && !match[1].includes("]")) {
            const packageName = match[1].trim();
            const currentVersion = match[2].trim();
            const targetVersion = match[3] ? match[3].trim() : null;
            const dedupeKey = `${packageName}|${currentVersion}|${targetVersion}`;

            if (!seenDependencies.has(dedupeKey)) {
              seenDependencies.add(dedupeKey);
              inventory.push({
                id: `${repo.name}-inv-${dedupeKey}`,
                repo: repo.name,
                packageName,
                currentVersion,
                targetVersion,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error(`Error processing ${repo.name}:`, error);
    }
  }

  return { inventory, prs };
}

export default async function Page() {
  const { inventory, prs } = await getPlatformData();
  
  // Pass both datasets down to your client UI
  return <DashboardUI inventory={inventory} actionablePRs={prs} />;
}