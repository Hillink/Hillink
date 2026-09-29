// Hillink World renderer. Pure presentation over the same snapshot as Command Center:
// position comes from verified agent status, motion from real state transitions, never from assignment alone.
const NS = 'http://www.w3.org/2000/svg';
const rooms = {
  'Connection Gate': { x: 20, y: 30, w: 160, h: 600, real: 'Connection Gate', fantasy: 'Castle Gate', always: true },
  'Command Center': { x: 200, y: 30, w: 360, h: 200, real: 'Command Center', fantasy: 'Throne Room', always: true },
  Workshop: { x: 590, y: 30, w: 300, h: 200, real: 'Workshop', fantasy: 'Forge' },
  Archive: { x: 920, y: 30, w: 260, h: 200, real: 'Archive', fantasy: 'Scriptorium' },
  'Triage Room': { x: 200, y: 270, w: 360, h: 170, real: 'Triage Room', fantasy: 'War Tent', always: true },
  'Testing Lab': { x: 590, y: 270, w: 300, h: 170, real: 'Testing Lab', fantasy: 'Proving Grounds' },
  'Local Workshop': { x: 920, y: 270, w: 260, h: 170, real: 'Local Workshop', fantasy: "Artificer's Den" },
  'Meeting Room': { x: 200, y: 480, w: 360, h: 150, real: 'Meeting Room', fantasy: 'Round Table', planned: true },
};
const look = {
  chatgpt: { real: { skin: '#e0b48f', body: '#2f6f5e', accent: '#b5ed88', hat: 'headset' }, fantasy: { skin: '#e0b48f', body: '#6b2a86', accent: '#f4c542', hat: 'crown', cape: '#a3302f' } },
  claude: { real: { skin: '#d9a07a', body: '#c46a3c', accent: '#ffd35c', hat: 'hardhat', tool: 'wrench' }, fantasy: { skin: '#d9a07a', body: '#7a4a2a', accent: '#b0b7c3', hat: 'helm', tool: 'hammer', beard: '#c9803f' } },
  codex: { real: { skin: '#c79a78', body: '#2c4b7a', accent: '#92b9ff', hat: 'visor', tool: 'clipboard' }, fantasy: { skin: '#9fb3c8', body: '#56657a', accent: '#5ef0ff', hat: 'cyber', tool: 'scanner' } },
  qwen: { real: { skin: '#e6b995', body: '#5a5f6b', accent: '#ffbd7b', hat: 'cap', tool: 'wrench' }, fantasy: { skin: '#e6b995', body: '#3e5c3a', accent: '#ffbd7b', hat: 'goggles', tool: 'staff' } },
  gemma: { real: { skin: '#f0c9a8', body: '#7b4d8f', accent: '#f3b6d9', hat: 'glasses', tool: 'book' }, fantasy: { skin: '#f0c9a8', body: '#3a3f6b', accent: '#e8dcb5', hat: 'hood', tool: 'quill' } },
  'hq-verifier': { real: { skin: '#b9c4cf', body: '#39424e', accent: '#b5ed88', hat: 'antenna', tool: 'tablet', robot: true }, fantasy: { skin: '#c9a45a', body: '#7a5c2e', accent: '#f4d27a', hat: 'gear', tool: 'tablet', robot: true } },
  kyle: { real: { skin: '#c68e6a', body: '#1f2937', accent: '#b5ed88', hat: 'none' }, fantasy: { skin: '#c68e6a', body: '#1f2937', accent: '#f4c542', hat: 'circlet', cape: '#1e5b3a' } },
};
const fallbackLook = { skin: '#d7b08e', body: '#4b5563', accent: '#b5ed88', hat: 'none' };

const el = (tag, attrs = {}, parent) => {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
};

function drawCharacter(g, l) {
  g.replaceChildren();
  el('ellipse', { cx: 0, cy: 1, rx: 14, ry: 4, fill: '#0006' }, g);
  const body = el('g', { class: 'body' }, g);
  if (l.cape) el('path', { d: 'M-12,-34 L12,-34 L15,-2 L-15,-2 Z', fill: l.cape }, body);
  el('rect', { class: 'leg l', x: -8, y: -14, width: 6, height: 14, rx: 2, fill: '#1b2230' }, body);
  el('rect', { class: 'leg r', x: 2, y: -14, width: 6, height: 14, rx: 2, fill: '#1b2230' }, body);
  if (l.robot) el('rect', { x: -12, y: -38, width: 24, height: 26, rx: 5, fill: l.body, stroke: l.accent, 'stroke-width': 1.5 }, body);
  else el('path', { d: 'M-12,-12 Q-13,-36 0,-37 Q13,-36 12,-12 Z', fill: l.body }, body);
  el('rect', { x: -4, y: -30, width: 8, height: 3, rx: 1.5, fill: l.accent, opacity: 0.9 }, body);
  const arm = el('g', { class: 'arm' }, body);
  el('rect', { x: 10, y: -33, width: 5, height: 16, rx: 2.5, fill: l.body }, arm);
  drawTool(arm, l);
  el('rect', { x: -15, y: -33, width: 5, height: 16, rx: 2.5, fill: l.body }, body);
  const head = el('g', { class: 'head' }, body);
  if (l.robot) {
    el('rect', { x: -10, y: -57, width: 20, height: 18, rx: 4, fill: l.skin }, head);
    el('rect', { x: -6, y: -51, width: 12, height: 4, rx: 2, fill: l.accent, class: 'eye' }, head);
  } else {
    el('circle', { cx: 0, cy: -46, r: 10, fill: l.skin }, head);
    el('circle', { cx: -3.5, cy: -46, r: 1.3, fill: '#1b1b1b', class: 'eye' }, head);
    el('circle', { cx: 3.5, cy: -46, r: 1.3, fill: '#1b1b1b', class: 'eye' }, head);
  }
  if (l.beard) el('path', { d: 'M-9,-44 Q0,-26 9,-44 Q0,-38 -9,-44 Z', fill: l.beard }, head);
  drawHat(head, l);
}
function drawHat(head, l) {
  const a = l.accent;
  switch (l.hat) {
    case 'hardhat': el('path', { d: 'M-11,-49 Q0,-64 11,-49 Z', fill: a }, head); el('rect', { x: -13, y: -50, width: 26, height: 3, rx: 1.5, fill: a }, head); break;
    case 'helm': el('path', { d: 'M-11,-48 Q0,-65 11,-48 Z', fill: a }, head); el('path', { d: 'M-11,-50 L-17,-60 L-9,-53 Z M11,-50 L17,-60 L9,-53 Z', fill: '#e8e2d0' }, head); break;
    case 'crown': el('path', { d: 'M-9,-54 L-9,-62 L-4,-57 L0,-64 L4,-57 L9,-62 L9,-54 Z', fill: a }, head); break;
    case 'circlet': el('rect', { x: -10, y: -54, width: 20, height: 2.5, fill: a }, head); break;
    case 'headset': el('path', { d: 'M-10,-47 Q0,-62 10,-47', fill: 'none', stroke: a, 'stroke-width': 2 }, head); el('circle', { cx: -10, cy: -46, r: 2.5, fill: a }, head); break;
    case 'visor': el('rect', { x: -9, y: -49, width: 18, height: 5, rx: 2, fill: a, opacity: 0.85 }, head); break;
    case 'cyber': el('rect', { x: -10, y: -49, width: 20, height: 5, rx: 2, fill: '#20303f' }, head); el('rect', { x: 1, y: -48, width: 7, height: 3, rx: 1.5, fill: a, class: 'eye glow' }, head); el('path', { d: 'M-10,-52 L-10,-56 L10,-56 L10,-52', fill: 'none', stroke: '#8da0b3', 'stroke-width': 1.5 }, head); break;
    case 'cap': el('path', { d: 'M-10,-50 Q0,-60 10,-50 L15,-50 L15,-48 L-10,-48 Z', fill: a }, head); break;
    case 'goggles': el('circle', { cx: -4, cy: -52, r: 3, fill: 'none', stroke: a, 'stroke-width': 1.5 }, head); el('circle', { cx: 4, cy: -52, r: 3, fill: 'none', stroke: a, 'stroke-width': 1.5 }, head); break;
    case 'glasses': el('circle', { cx: -3.5, cy: -46, r: 3, fill: 'none', stroke: '#222', 'stroke-width': 1 }, head); el('circle', { cx: 3.5, cy: -46, r: 3, fill: 'none', stroke: '#222', 'stroke-width': 1 }, head); break;
    case 'hood': el('path', { d: 'M-13,-40 Q-12,-62 0,-60 Q12,-62 13,-40 Q8,-52 0,-53 Q-8,-52 -13,-40 Z', fill: l.body }, head); break;
    case 'antenna': el('line', { x1: 0, y1: -57, x2: 0, y2: -64, stroke: '#9aa5b1', 'stroke-width': 1.5 }, head); el('circle', { cx: 0, cy: -65, r: 2.5, fill: a, class: 'eye' }, head); break;
    case 'gear': el('circle', { cx: 0, cy: -60, r: 4, fill: 'none', stroke: a, 'stroke-width': 2, 'stroke-dasharray': '2 1.5', class: 'spin' }, head); break;
    default: break;
  }
}
function drawTool(arm, l) {
  const a = l.accent;
  switch (l.tool) {
    case 'wrench': el('path', { d: 'M13,-18 L20,-8 M18,-11 l4,-1 l-1,4', stroke: '#c9ced6', 'stroke-width': 2.5, fill: 'none', 'stroke-linecap': 'round' }, arm); break;
    case 'hammer': el('line', { x1: 13, y1: -18, x2: 19, y2: -4, stroke: '#7a5230', 'stroke-width': 2.5 }, arm); el('rect', { x: 14, y: -8, width: 10, height: 6, rx: 1, fill: '#9aa3ad', transform: 'rotate(-20 19 -5)' }, arm); break;
    case 'clipboard': el('rect', { x: 13, y: -22, width: 10, height: 13, rx: 1.5, fill: '#e9edf2' }, arm); el('rect', { x: 15, y: -19, width: 6, height: 1.5, fill: a }, arm); el('rect', { x: 15, y: -15, width: 6, height: 1.5, fill: a }, arm); break;
    case 'scanner': el('rect', { x: 13, y: -20, width: 9, height: 6, rx: 2, fill: '#2a3644' }, arm); el('path', { d: 'M22,-17 L34,-23 L34,-11 Z', fill: a, opacity: 0.35, class: 'beam' }, arm); break;
    case 'staff': el('line', { x1: 13, y1: -40, x2: 13, y2: 0, stroke: '#8a6a3f', 'stroke-width': 2.5 }, arm); el('circle', { cx: 13, cy: -42, r: 3.5, fill: a, class: 'eye glow' }, arm); break;
    case 'book': el('rect', { x: 12, y: -22, width: 11, height: 9, rx: 1, fill: a }, arm); el('line', { x1: 17.5, y1: -22, x2: 17.5, y2: -13, stroke: '#6a3d7a', 'stroke-width': 1 }, arm); break;
    case 'quill': el('path', { d: 'M14,-16 Q24,-30 26,-34 Q22,-26 16,-15 Z', fill: a }, arm); break;
    case 'tablet': el('rect', { x: 12, y: -23, width: 11, height: 14, rx: 2, fill: '#10161e', stroke: a, 'stroke-width': 1 }, arm); el('path', { d: 'M15,-16 l2,2 l4,-5', stroke: a, 'stroke-width': 1.5, fill: 'none' }, arm); break;
    default: break;
  }
}

function drawRoom(layer, id, room, skin, built) {
  const g = el('g', { class: `room ${built ? 'built' : 'unbuilt'}` }, layer);
  if (!built) {
    el('rect', { x: room.x, y: room.y, width: room.w, height: room.h, rx: 10, fill: 'none', stroke: '#6b6f4a', 'stroke-width': 1.5, 'stroke-dasharray': '6 6' }, g);
    for (let i = 1; i < 4; i++) el('line', { x1: room.x + (room.w / 4) * i, y1: room.y + room.h - 12, x2: room.x + (room.w / 4) * i, y2: room.y + room.h - 40, stroke: '#6b6f4a', 'stroke-width': 2 }, g);
    const t = el('text', { x: room.x + room.w / 2, y: room.y + room.h / 2, 'text-anchor': 'middle', class: 'room-label dim' }, g);
    t.textContent = `${room[skin]} · not built yet`;
    const s = el('text', { x: room.x + room.w / 2, y: room.y + room.h / 2 + 16, 'text-anchor': 'middle', class: 'room-sub' }, g);
    s.textContent = room.planned ? 'Planned: meetings are not implemented' : 'Builds when a connected agent can work here';
    return;
  }
  el('rect', { x: room.x, y: room.y, width: room.w, height: room.h, rx: 10, class: `floor ${id === 'Triage Room' ? 'triage' : id === 'Connection Gate' ? 'gate' : ''}` }, g);
  el('rect', { x: room.x, y: room.y, width: room.w, height: 26, rx: 10, class: 'roof' }, g);
  const t = el('text', { x: room.x + 12, y: room.y + 17, class: 'room-label' }, g);
  t.textContent = room[skin].toUpperCase();
  // Furniture is decoration only and never implies activity.
  if (id === 'Command Center') { el('rect', { x: room.x + 30, y: room.y + 50, width: 120, height: 34, rx: 4, class: 'screen' }, g); el('rect', { x: room.x + 170, y: room.y + 50, width: 80, height: 34, rx: 4, class: 'screen' }, g); }
  else if (id === 'Connection Gate') { el('rect', { x: room.x + 8, y: room.y + 50, width: 10, height: room.h - 60, class: 'pillar' }, g); el('rect', { x: room.x + room.w - 18, y: room.y + 50, width: 10, height: room.h - 60, class: 'pillar' }, g); }
  else if (id === 'Triage Room') { el('rect', { x: room.x + 20, y: room.y + 40, width: 110, height: 44, rx: 4, class: 'board' }, g); }
  else { el('rect', { x: room.x + 20, y: room.y + room.h - 58, width: room.w - 40, height: 12, rx: 3, class: 'bench' }, g); }
}

const spots = {};
function placeFor(agent) {
  if (['UNKNOWN', 'OFFLINE'].includes(agent.status)) return 'Connection Gate';
  if (['BLOCKED', 'STALLED', 'RATE_LIMITED'].includes(agent.status)) return 'Triage Room';
  return rooms[agent.workstation] ? agent.workstation : 'Command Center';
}
function slot(roomId, index, count) {
  const room = rooms[roomId];
  const cols = Math.min(count, Math.max(1, Math.floor((room.w - 40) / 70)));
  const col = index % cols, row = Math.floor(index / cols);
  return { x: room.x + (room.w / (cols + 1)) * (col + 1), y: room.y + room.h - 22 - row * 100 };
}

let svg, layers, actors = new Map(), lastSkin = null;
export function renderWorld(container, snapshot, skin) {
  if (!svg || !container.contains(svg)) {
    container.replaceChildren();
    svg = el('svg', { viewBox: '0 0 1200 650', class: 'world-svg', role: 'img', 'aria-label': 'Hillink World map' });
    const defs = el('defs', {}, svg);
    const grad = el('radialGradient', { id: 'sky', cx: '50%', cy: '0%', r: '90%' }, defs);
    el('stop', { offset: '0%', class: 'sky-top' }, grad); el('stop', { offset: '100%', class: 'sky-bottom' }, grad);
    layers = { ground: el('rect', { x: 0, y: 0, width: 1200, height: 650, fill: 'url(#sky)' }, svg), sky: el('g', { class: 'night-sky' }, svg), paths: el('g', { class: 'paths' }, svg), rooms: el('g', {}, svg), actors: el('g', {}, svg) };
    el('path', { d: 'M180,130 L200,130 M180,355 L200,355 M560,150 L590,150 M890,150 L920,150 M560,355 L590,355 M890,355 L920,355 M380,230 L380,270 M380,440 L380,480 M740,230 L740,270 M1050,230 L1050,270', class: 'corridor' }, layers.paths);
    for (let i = 0; i < 60; i++) el('circle', { cx: (i * 263) % 1200, cy: (i * 97) % 650, r: (i % 3) * 0.5 + 0.6, class: 'star' }, layers.sky);
    container.appendChild(svg);
    actors = new Map(); lastSkin = null;
  }
  const hour = new Date(snapshot.now).getHours();
  svg.setAttribute('class', `world-svg ${skin} ${hour >= 18 || hour < 7 ? 'night' : 'day'}`);
  // Construction: a room exists once an agent that works there has a connected execution adapter.
  const builtRooms = new Set(Object.keys(rooms).filter(id => rooms[id].always));
  for (const agent of snapshot.agents) if (agent.adapterAvailable && rooms[agent.workstation]) builtRooms.add(agent.workstation);
  const roomKey = `${skin}|${[...builtRooms].sort().join(',')}`;
  if (layers.rooms.dataset.key !== roomKey) {
    layers.rooms.replaceChildren();
    for (const [id, room] of Object.entries(rooms)) drawRoom(layers.rooms, id, room, skin, builtRooms.has(id));
    layers.rooms.dataset.key = roomKey;
  }
  const people = [...snapshot.agents.map(a => ({ ...a, place: placeFor(a) })), { id: 'kyle', name: 'Kyle', real: 'Owner', fantasy: 'Lord of Hillink', status: 'OWNER', place: 'Command Center', owner: true }];
  const byPlace = {};
  for (const p of people) (byPlace[p.place] ||= []).push(p);
  const seen = new Set();
  for (const [place, group] of Object.entries(byPlace)) group.forEach((person, index) => {
    const { x, y } = slot(place, index, group.length);
    seen.add(person.id);
    let actor = actors.get(person.id);
    if (!actor) {
      const g = el('g', { class: 'actor', tabindex: person.owner ? null : '0', 'data-agent': person.owner ? null : person.id }, layers.actors);
      const figure = el('g', { class: 'figure' }, g);
      const bubble = el('g', { class: 'bubble' }, g);
      const label = el('text', { y: 18, 'text-anchor': 'middle', class: 'actor-name' }, g);
      const status = el('text', { y: 30, 'text-anchor': 'middle', class: 'actor-status' }, g);
      const title = el('title', {}, g);
      actor = { g, figure, bubble, label, status, title, x, y, skin: null };
      actors.set(person.id, actor);
      g.style.transform = `translate(${x}px, ${y}px)`;
    }
    if (actor.skin !== skin) { drawCharacter(actor.figure, look[person.id]?.[skin] || fallbackLook); actor.skin = skin; }
    const moved = Math.hypot(actor.x - x, actor.y - y) > 1;
    if (moved) {
      // Walk only because the verified status changed where this agent belongs.
      actor.g.classList.add('walking');
      clearTimeout(actor.walkTimer); actor.walkTimer = setTimeout(() => actor.g.classList.remove('walking'), 1600);
      actor.g.style.transform = `translate(${x}px, ${y}px)`;
      actor.x = x; actor.y = y;
    }
    const state = person.owner ? 'owner' : person.status.toLowerCase().replace('_', '-');
    for (const c of [...actor.g.classList]) if (c.startsWith('st-')) actor.g.classList.remove(c);
    actor.g.classList.add(`st-${state}`);
    actor.label.textContent = person.name;
    actor.status.textContent = person.owner ? person[skin] : `${person[skin]} · ${person.status}`;
    const task = snapshot.tasks.find(t => t.id === person.assignment);
    actor.title.textContent = person.owner ? 'Kyle (owner)' : `${person.name}: ${person.status}${task ? ` · ${task.stage} · ${task.title}` : ''}${person.detail ? ` · ${person.detail}` : ''}`;
    const mark = { running: task?.stage === 'TESTING' ? '🧪' : '⚙', stalled: '?', blocked: '!', 'rate-limited': '⏳' }[state];
    actor.bubble.replaceChildren();
    if (mark) {
      el('rect', { x: -11, y: -86, width: 22, height: 20, rx: 6, class: 'bubble-bg' }, actor.bubble);
      const t = el('text', { x: 0, y: -71, 'text-anchor': 'middle', class: 'bubble-text' }, actor.bubble); t.textContent = mark;
    }
  });
  for (const [id, actor] of actors) if (!seen.has(id)) { actor.g.remove(); actors.delete(id); }
}
