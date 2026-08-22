// GitHub REST APIを使い、src/data/stopMaster.json と src/data/fareTable.json を
// 1回のコミットで（Git Data APIで新しいtree/commitを作り、branchのrefを更新する形で）
// 原子的に更新する。この2ファイルだけを差し替えるコミットがpushされると、
// 既存の .github/workflows/deploy-pages.yml が自動でビルド・再デプロイする。

const API = "https://api.github.com";

async function githubRequest(env, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "tokubus-gtfs-admin-worker",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function commitGtfsData(env, { stopMasterJson, fareTableJson, message }) {
  const { GITHUB_OWNER: owner, GITHUB_REPO: repo, GITHUB_BRANCH: branch } = env;

  const refData = await githubRequest(env, `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
  const latestCommitSha = refData.object.sha;

  const commitData = await githubRequest(env, `/repos/${owner}/${repo}/git/commits/${latestCommitSha}`);
  const baseTreeSha = commitData.tree.sha;

  const [stopMasterBlob, fareTableBlob] = await Promise.all([
    githubRequest(env, `/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: stopMasterJson, encoding: "utf-8" }),
    }),
    githubRequest(env, `/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: fareTableJson, encoding: "utf-8" }),
    }),
  ]);

  const newTree = await githubRequest(env, `/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: [
        { path: "src/data/stopMaster.json", mode: "100644", type: "blob", sha: stopMasterBlob.sha },
        { path: "src/data/fareTable.json", mode: "100644", type: "blob", sha: fareTableBlob.sha },
      ],
    }),
  });

  const newCommit = await githubRequest(env, `/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message,
      tree: newTree.sha,
      parents: [latestCommitSha],
    }),
  });

  await githubRequest(env, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: newCommit.sha }),
  });

  return newCommit.sha;
}

export async function fetchCurrentGtfsStats(env) {
  const { GITHUB_OWNER: owner, GITHUB_REPO: repo, GITHUB_BRANCH: branch } = env;
  const base = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/src/data`;
  const [stopMasterRes, fareTableRes] = await Promise.all([
    fetch(`${base}/stopMaster.json`),
    fetch(`${base}/fareTable.json`),
  ]);
  const stopMaster = await stopMasterRes.json();
  const fareTable = await fareTableRes.json();
  return {
    routeCount: Object.keys(stopMaster).length,
    farePairCount: fareTable.pairs.length,
  };
}
