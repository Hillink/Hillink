// Construction: every development pass of Hillink World is a building project in the World.
// A pass is planned as data (world/passes/*.json); it advances only on evidence from real sources
// (commits, CI runs, reviews, the merge), never on time. Its stage is derived from the whole evidence
// set, so redelivered or out-of-order evidence cannot move it backwards or forwards by itself.
//
// Stages: planned → claimed → implementing → testing → review → changes-requested → rework → approved → accepted,
// plus blocked (the latest CI run on the latest commit failed). Accepted = merged to main (confirmed by Kyle).

export const STAGES = ['planned', 'claimed', 'implementing', 'testing', 'review', 'changes-requested', 'rework', 'approved', 'accepted', 'blocked'];
export const STAGE_LABEL = {
  planned: 'Planned', claimed: 'Claimed', implementing: 'Implementing', testing: 'Testing', review: 'In review',
  'changes-requested': 'Changes requested', rework: 'Rework', approved: 'Approved', accepted: 'Accepted', blocked: 'Blocked',
};
// The visible pieces of a structure, in build order. Each real commit installs one; the last piece
// (activation) only goes in when the pass is accepted.
export const PIECES = ['site', 'slab', 'frame', 'beams', 'walls', 'glass', 'roof', 'fit-out', 'active'];
const EVIDENCE_KINDS = new Set(['branch', 'pr', 'commit', 'ci', 'review', 'merge']);

export function applyPassEvent(world, e, changed) {
  world.passes ??= {};
  if (e.type === 'PASS_PLANNED') {
    const p = world.passes[e.passId] ??= { id: e.passId, evidence: {}, plannedAt: e.at };
    Object.assign(p, {
      title: e.title, summary: e.summary ?? p.summary ?? null, structures: Array.isArray(e.structures) ? e.structures : p.structures ?? [],
      branch: e.branch ?? p.branch ?? null, pr: e.pr ?? p.pr ?? null, source: e.source, order: e.order ?? p.order ?? 0,
    });
  } else if (e.type === 'PASS_EVIDENCE') {
    const p = world.passes[e.passId] ??= { id: e.passId, title: e.passId, structures: [], evidence: {}, source: e.source };
    const ev = e.evidence;
    if (!ev || !EVIDENCE_KINDS.has(ev.kind)) throw Error(`Unknown pass evidence ${ev?.kind}`);
    // Keyed by the evidence's own identity (commit sha, check run + state, review id): idempotent.
    p.evidence[ev.key ?? `${ev.kind}:${ev.ref}`] = { ...ev, at: e.at, source: e.source };
  } else return;
  const p = world.passes[e.passId];
  Object.assign(p, derive(p));
  changed.add(`pass:${e.passId}`);
}

// Stage, installed pieces and rework count from the evidence set. Pure.
export function derive(pass) {
  const ev = Object.values(pass.evidence ?? {}).sort((a, b) => a.at - b.at);
  const of = kind => ev.filter(x => x.kind === kind);
  const commits = of('commit'), reviews = of('review'), ci = of('ci');
  const merged = of('merge').at(-1) ?? null;
  const lastCommit = commits.at(-1) ?? null;
  // Rework: a changes-requested review followed by at least one commit.
  let rework = 0, openRequest = null;
  for (const x of ev) {
    if (x.kind === 'review' && x.state === 'changes_requested') openRequest = x;
    else if (x.kind === 'review' && x.state === 'approved') openRequest = null;
    else if (x.kind === 'commit' && openRequest) { rework += 1; openRequest = { ...openRequest, reworked: true }; }
  }
  // CI that belongs to the latest commit (or, without a sha link, the latest run).
  const headCi = ci.filter(x => !lastCommit || x.sha === lastCommit.ref || x.at >= lastCommit.at);
  const ciState = headCi.at(-1)?.state ?? null; // running | passed | failed
  const lastReview = reviews.filter(r => r.state === 'approved' || r.state === 'changes_requested').at(-1) ?? null;
  const pr = of('pr').at(-1) ?? null;
  let stage;
  if (merged) stage = 'accepted';
  else if (ciState === 'failed') stage = 'blocked';
  else if (openRequest && !openRequest.reworked) stage = 'changes-requested';
  else if (lastReview?.state === 'approved' && ciState !== 'running' && (!lastCommit || lastReview.at >= lastCommit.at)) stage = 'approved';
  else if (openRequest?.reworked || (lastReview?.state === 'changes_requested' && rework > 0)) stage = ciState === 'running' ? 'testing' : 'rework';
  else if (ciState === 'running') stage = 'testing';
  else if (pr && pr.state === 'ready' && commits.length) stage = 'review';
  else if (reviews.length && commits.length) stage = 'review';
  else if (commits.length) stage = 'implementing';
  else if (pr || of('branch').length) stage = 'claimed';
  else stage = 'planned';
  // One piece per commit, never the final "active" piece before the merge.
  const pieces = merged ? PIECES.length : Math.min(PIECES.length - 1, 1 + commits.length);
  const blocker = stage === 'blocked' ? headCi.at(-1) : null;
  return {
    stage, pieces, rework, commits: commits.length, ci: ciState, lastEvidenceAt: ev.at(-1)?.at ?? null,
    blocker: blocker ? { summary: blocker.summary ?? 'CI failed', ref: blocker.ref ?? null, at: blocker.at } : null,
    request: stage === 'changes-requested' ? { summary: openRequest?.summary ?? 'Changes requested', by: openRequest?.by ?? null } : null,
  };
}

// Which structures a finished pass adds to the World (the baseline), in pass order.
export function acceptedStructures(world) {
  return Object.values(world.passes ?? {}).filter(p => p.stage === 'accepted').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).flatMap(p => p.structures ?? []);
}
