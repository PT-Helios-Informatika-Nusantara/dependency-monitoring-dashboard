# Dependency Monitoring Dashboard

A centralized Internal Developer Portal (IDP) control plane designed to monitor infrastructure dependencies and aggregate actionable updates across multiple GitOps repositories. 

This dashboard acts as a "Single Pane of Glass," separating routine dependency tracking from active human code reviews by surfacing background bot activity into a dedicated, high-visibility UI.



## 🚀 Features

* **Dual-Layer Visibility:** Toggle seamlessly between **Actionable Updates** (Draft PRs awaiting human review) and **All Packages** (a complete inventory of current vs. target package versions).
* **Cross-Ecosystem Parsing:** Custom extraction engine capable of normalizing dependency data across NPM (`package.json`), Go (`go.mod`), and Flutter (`pubspec.yaml`) environments.
* **Smart UI & Metrics:** Automatically extracts and displays Mend Renovate metrics (Age, Confidence), flags batched ecosystem updates (e.g., React + React DOM), and features a rich Markdown Slide-Over panel for reading release notes.
* **Zero-Trust Ready:** Authenticates exclusively via scoped GitHub App Installation tokens, ensuring secure, short-lived API access without relying on static Personal Access Tokens (PATs).

## 🏗️ Architecture & Workflow

This dashboard acts strictly as a **Visibility Layer**. It does not write to GitHub; it reads the operational state left by Mend Renovate.

1. **The Webhook Trigger:** A global `renovate-config` preset dictates dependency rules.
2. **The Silent Execution:** Renovate evaluates repositories and opens silent **Draft Pull Requests** for updates, keeping the main GitHub PR tab clean of bot noise.
3. **The Aggregation:** This Next.js backend makes parallel requests to the GitHub API, pulling issue bodies and Pull Request states across the infrastructure.
4. **The Resolution:** Developers review the rich UI, click "Review & Merge on GitHub", and trigger the CI/CD pipeline. Once merged or closed, the dashboard automatically syncs state.

## ⚙️ Prerequisites

### 1. GitHub App Authentication
To run this dashboard, you must create a GitHub App with the following permissions:
* **Repository Permissions:** `Issues` (Read), `Pull Requests` (Read), `Metadata` (Read)
* Install the App on the target repositories you wish to monitor.

### 2. Mend Renovate Configuration
Your target repositories must use Mend Renovate with a specific `renovate.json` configuration to ensure background drafts and dashboards are generated:

```json
{
  "dependencyDashboard": true,
  "dependencyDashboardApproval": false,
  "draftPR": true,
  "recreateWhen": "auto"
}
