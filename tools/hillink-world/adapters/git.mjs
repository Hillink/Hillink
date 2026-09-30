// Construction evidence adapter (server side, read-only). Turns the repository's real history into
// PASS_* World events:
//   git (local clone):  pass plans (world/passes/*.json on main and on open PR branches), branch, commits
//   GitHub (`gh` CLI, the laptop's existing login; confirmed by Kyle 2026-09-29): PR state, CI checks,
//                       reviews and the merge to main (a pass is accepted when it merges to main).
// Nothing here writes: the only network command is `git fetch`, which updates remote-tracking refs.
// Every event id derives from the evidence itself (sha, review id, check state), so polling is idempotent.
import { SCHEMA_VERSION } from '../core/events.mjs';

import { DEFAULT_DEFINITIONS } from '../core/agents.mjs';
const PASS_DIR ='tools/hillink-world/world/passes';
const SAFE_REF = /^(?!-)[\w./-]{1,120}$/;
const clip = (s, n = 160) => (typeof s === 'string' ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : null);
const event = (id, type, at, fields) => ({ v: SCHEMA_VERSION, id, type, at, source: 'github', ...fields });

// Which World agent a commit or review belongs to (co-author trailers, author, reviewer login).
// Pass 5E: the patterns come from the registry (core/agents.mjs meta.attribution), not from code.
export function agentFor(...texts) {
  const t = texts.filter(Boolean).join(' ').toLowerCase();
  for (const d of Object.values(DEFAULT_DEFINITIONS)) if (d.meta?.attribution && new RegExp(d.meta.attribution).test(t)) return d.id;
  return null;
}
const CI_RUNNING = new Set(['IN_PROGRESS', 'QUEUED', 'PENDING', 'WAITING', 'REQUESTED', 'EXPECTED']);
const CI_FAILED = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE']);
// One overall CI state for a head commit from GitHub's status rollup.
export function ciState(rollup = []) {
  if (!rollup.length) return null;
  const states = rollup.map(c => {
    const s = (c.conclusion || c.state || c.status || '').toUpperCase();
    if (CI_FAILED.has(s)) return 'failed';
    if (CI_RUNNING.has(s) || (c.status && c.status !== 'COMPLETED' && !c.conclusion)) return 'running';
    return 'passed';
  });
  const failed = rollup.filter((c, i) => states[i] === 'failed').map(c => c.name ?? c.context ?? 'check');
  const state = failed.length ? 'failed' : states.includes('running') ? 'running' : 'passed';
  const times = rollup.flatMap(c => [c.completedAt, c.startedAt]).filter(Boolean).map(Date.parse).filter(Number.isFinite);
  return { state, failed, at: times.length ? Math.max(...times) : null, names: rollup.map(c => c.name ?? c.context).filter(Boolean) };
}

// run(cmd, args) -> Promise<stdout>; injected so tests never touch a real repository.
export function createConstructionSource({ run, now = () => Date.now() }) {
  const status = { git: null, gh: null, fetchedAt: null, error: null, passes: 0 };
  const git = (...args) => run('git', args);
  const gh = (...args) => run('gh', args);
  const exists = async ref => { try { await git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`); return true; } catch { return false; } };

  async function plansOn(ref) {
    let names = [];
    try { names = (await git('ls-tree', '--name-only', ref, `${PASS_DIR}/`)).split('\n').filter(n => n.endsWith('.json')); } catch { return []; }
    const out = [];
    for (const path of names) {
      try {
        const plan = JSON.parse(await git('show', `${ref}:${path}`));
        const at = Number((await git('log', '-1', '--format=%ct', ref, '--', path)).trim()) * 1000 || now();
        if (plan?.id && SAFE_REF.test(plan.id)) out.push({ plan, at, ref });
      } catch { /* a malformed plan is skipped, never guessed at */ }
    }
    return out;
  }

  async function poll() {
    const events = [];
    try { await git('fetch', '--quiet', 'origin'); status.fetchedAt = now(); status.git = true; }
    catch (e) { status.git = false; status.error = `git fetch failed: ${clip(e.message, 120)}`; }
    // Pull requests (GitHub). Without gh the World still shows plans, commits and merges from git.
    let prs = [];
    try { prs = JSON.parse(await gh('pr', 'list', '--state', 'all', '--limit', '40', '--json', 'number,headRefName,baseRefName,state,isDraft,mergedAt,createdAt,title,url')); status.gh = true; }
    catch { status.gh = false; }
    const refs = new Set(['origin/main']);
    for (const p of prs) if (p.state === 'OPEN' && SAFE_REF.test(p.headRefName)) refs.add(`origin/${p.headRefName}`);
    // Without gh, open PRs are unknown: look for plans on every remote branch instead (git only).
    if (!status.gh) {
      try { for (const r of (await git('for-each-ref', '--count=80', '--sort=-committerdate', '--format=%(refname:short)', 'refs/remotes/origin')).split('\n')) if (SAFE_REF.test(r) && r.startsWith('origin/') && r !== 'origin/HEAD') refs.add(r); } catch { /* main only */ }
    }
    const plans = new Map();
    for (const ref of refs) for (const found of await plansOn(ref)) {
      const known = plans.get(found.plan.id);
      // A pass's own branch has the newest plan; main has it once merged.
      if (!known || (known.ref === 'origin/main' && found.plan.branch && found.ref === `origin/${found.plan.branch}`)) plans.set(found.plan.id, found);
    }
    status.passes = plans.size;
    for (const { plan, at } of plans.values()) {
      const pid = plan.id;
      events.push(event(`gh-plan-${pid}-${hashOf(JSON.stringify(plan))}`, 'PASS_PLANNED', at, {
        passId: pid, title: clip(plan.title, 120) ?? pid, summary: clip(plan.summary, 400), structures: plan.structures ?? [], branch: plan.branch ?? null, pr: plan.pr ?? null, order: plan.order ?? 0,
      }));
      const branch = plan.branch && SAFE_REF.test(plan.branch) ? plan.branch : null;
      const pr = prs.find(p => p.number === plan.pr) ?? (branch ? prs.find(p => p.headRefName === branch) : null);
      const tip = branch && await exists(`origin/${branch}`) ? `origin/${branch}` : pr?.state === 'MERGED' ? 'origin/main' : null;
      const since = plan.since && SAFE_REF.test(plan.since) ? plan.since : 'origin/main';
      if (tip) {
        events.push(event(`gh-branch-${pid}-${branch ?? 'main'}`, 'PASS_EVIDENCE', at, { passId: pid, evidence: { kind: 'branch', ref: branch ?? 'main', key: 'branch', summary: `Branch ${branch ?? 'main'}` } }));
        const scope = (plan.scope ?? []).filter(s => SAFE_REF.test(s));
        let log = '';
        try { log = await git('log', '--reverse', '--format=%H%x1f%ct%x1f%an%x1f%s%x1f%(trailers:key=Co-Authored-By,valueonly,separator=%x2c)%x1e', `${since}..${tip}`, '--', ...scope); } catch { log = ''; }
        for (const rec of log.split('\x1e').map(r => r.trim()).filter(Boolean)) {
          const [sha, ct, author, subject, coauthors] = rec.split('\x1f');
          if (!/^[0-9a-f]{40}$/.test(sha)) continue;
          events.push(event(`gh-commit-${pid}-${sha.slice(0, 12)}`, 'PASS_EVIDENCE', Number(ct) * 1000, {
            passId: pid, agentId: agentFor(coauthors, author) ?? undefined,
            evidence: { kind: 'commit', ref: sha, key: `commit:${sha}`, summary: clip(subject, 120), by: agentFor(coauthors, author) },
          }));
        }
      }
      if (pr && status.gh) {
        let view = null;
        try { view = JSON.parse(await gh('pr', 'view', String(pr.number), '--json', 'state,isDraft,mergedAt,baseRefName,headRefOid,reviews,statusCheckRollup,url')); } catch { view = null; }
        if (view) {
          const prState = view.state === 'MERGED' ? 'merged' : view.isDraft ? 'draft' : 'ready';
          events.push(event(`gh-pr-${pid}-${pr.number}-${prState}`, 'PASS_EVIDENCE', prState === 'draft' ? Date.parse(pr.createdAt) || at : Date.parse(view.mergedAt ?? '') || now(), { passId: pid, evidence: { kind: 'pr', ref: `#${pr.number}`, key: `pr:${prState}`, state: prState, summary: `PR #${pr.number} ${prState}`, url: view.url ?? pr.url } }));
          for (const r of view.reviews ?? []) {
            const state = String(r.state ?? '').toLowerCase(), rid = r.id ?? `${r.author?.login}-${r.submittedAt}`;
            if (!['approved', 'changes_requested', 'commented'].includes(state)) continue;
            events.push(event(`gh-review-${pid}-${hashOf(String(rid))}`, 'PASS_EVIDENCE', Date.parse(r.submittedAt) || now(), {
              passId: pid, agentId: agentFor(r.author?.login) ?? undefined,
              evidence: { kind: 'review', ref: String(rid), key: `review:${rid}`, state, by: agentFor(r.author?.login) ?? r.author?.login ?? null, summary: clip((r.body ?? '').split('\n').find(l => l.trim()) ?? state.replace('_', ' '), 120) },
            }));
          }
          const ci = ciState(view.statusCheckRollup ?? []);
          if (ci && /^[0-9a-f]{40}$/.test(view.headRefOid ?? '')) {
            events.push(event(`gh-ci-${pid}-${view.headRefOid.slice(0, 12)}-${ci.state}`, 'PASS_EVIDENCE', ci.at ?? now(), {
              passId: pid, evidence: { kind: 'ci', ref: view.headRefOid, sha: view.headRefOid, key: `ci:${view.headRefOid}:${ci.state}`, state: ci.state, summary: ci.state === 'failed' ? `Failing: ${ci.failed.join(', ')}` : `${ci.names.join(', ') || 'CI'}: ${ci.state}` },
            }));
          }
          if (view.state === 'MERGED' && view.baseRefName === 'main' && view.mergedAt) {
            events.push(event(`gh-merge-${pid}-${pr.number}`, 'PASS_EVIDENCE', Date.parse(view.mergedAt), { passId: pid, evidence: { kind: 'merge', ref: `#${pr.number}`, key: 'merge', summary: `PR #${pr.number} merged to main` } }));
          }
        }
      }
    }
    return events;
  }
  return { poll, status };
}

// Short stable hash for event ids (FNV-1a).
export function hashOf(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
