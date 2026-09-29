// Skins: the same simulation dressed two ways (plus the Blueprint debug view). A skin is materials for
// the building and a look for each agent; nothing here changes positions, states or timing.
// Agent identities (Kyle's directive): Claude builder/engineer (dwarf), Codex QA and security inspector
// (cyborg), ChatGPT orchestrator (king), Qwen local analyst, Gemma utility worker, Local Verifier minor.

const LOOKS = {
  real: {
    claude: { shirt: '#d9773f', sleeve: '#d9773f', pants: '#3a3f4a', hair: '#5a3a22', skin: '#f1c7a0', belt: '#4a3a2a', hoodie: true, glasses: true, screen: '#ffb27a', package: 'box' },
    codex: { shirt: '#2d4f8e', pants: '#1f2530', hair: '#1a1a1d', skin: '#d8a883', headset: true, badge: '#e8f1ff', vest: null, jacket: '#243f73', screen: '#5ee1ff', package: 'box' },
    chatgpt: { shirt: '#f2f4f7', jacket: '#2a2f3a', sleeve: '#2a2f3a', pants: '#2a2f3a', hair: '#2b2118', skin: '#eab893', tie: '#10a37f', package: 'box' },
    qwen: { shirt: '#6f4fc9', pants: '#2b2440', hair: '#d8d4e6', skin: '#f3d0b0', glasses: true, screen: '#c3a6ff', package: 'box' },
    gemma: { shirt: '#e7e3d6', overalls: '#2f8f6b', pants: '#2f8f6b', hair: '#6b3f22', skin: '#c98f68', hat: 'cap', hatColor: '#2f8f6b', screen: '#7cf0c4', package: 'box' },
    'hq-verifier': { shirt: '#56606e', pants: '#2a313a', hair: '#333', skin: '#e2b48d', vest: '#f2b01e', hat: 'hardhat', hatColor: '#f2f2f2', scale: 0.92, package: 'box' },
    kyle: { shirt: '#ffffff', jacket: '#1f2f5a', sleeve: '#1f2f5a', pants: '#1f2f5a', hair: '#1b1512', skin: '#b67c56', tie: '#7c4dff', package: 'box' },
  },
  fantasy: {
    claude: { shirt: '#b5552b', sleeve: '#b5552b', pants: '#5a3b24', hair: '#c4521f', beard: '#c4521f', beardLong: true, skin: '#eab28a', hat: 'helmet', hatColor: '#9aa6b4', horns: true, belt: '#3c2a1a', scale: 0.86, wide: 1.2, headScale: 1.08, package: 'scroll' },
    codex: { shirt: '#3c4a5c', pants: '#2a323d', skin: '#b8c4d0', skinTone2: 'rgba(120,135,155,0.55)', hair: '#5d6b7c', bald: true, visor: '#39e6ff', antenna: true, metalArm: true, core: true, glove: '#9aa6b4', package: 'scroll' },
    chatgpt: { shirt: '#6b1f2e', sleeve: '#6b1f2e', pants: '#3a1620', hair: '#e9e4d8', beard: '#e9e4d8', skin: '#efc6a2', hat: 'crown', cape: '#a3182c', belt: '#c8a24a', package: 'scroll' },
    qwen: { shirt: '#4a2f8a', robe: true, hair: '#e8e2f4', beard: '#e8e2f4', skin: '#f0cfae', hat: 'wizard', hatColor: '#3b2470', package: 'scroll' },
    gemma: { shirt: '#3f7a4a', pants: '#5b4630', hair: '#7a4a2a', skin: '#e8b890', hat: 'hood', hatColor: '#2f5e39', goggles: true, scale: 0.8, package: 'scroll' },
    'hq-verifier': { shirt: '#7d8794', pants: '#4a4f58', hair: '#444', skin: '#e2b48d', hat: 'helmet', vest: '#2f5aa8', scale: 0.92, package: 'scroll' },
    kyle: { shirt: '#3a2b6b', sleeve: '#3a2b6b', pants: '#231a44', hair: '#1b1512', skin: '#b67c56', cape: '#7c4dff', package: 'scroll' },
  },
};

// Unknown agents: a plain outfit in their registered colour, so they are never mistaken for a named agent.
export function lookFor(skinId, agent) {
  const own = LOOKS[skinId === 'fantasy' ? 'fantasy' : 'real'][agent?.id];
  if (own) return own;
  const c = agent?.appearance?.color ?? '#6b7a90';
  return { shirt: c, pants: '#2c3340', hair: '#3b2a20', package: skinId === 'fantasy' ? 'scroll' : 'box' };
}

// Building materials per skin.
export const MATERIALS = {
  real: {
    sky: ['#0f1b33', '#2d4b7a', '#f0a36a'], skyline: '#1a2740', skylineLit: '#ffd28a', ground: '#51604a', groundEdge: '#3e4a39',
    road: '#2c2f36', roadLine: '#e8e2c8', pavement: '#9b9a94', pavementEdge: '#7c7b76',
    wallBack: { lounge: '#e9dcc8', hall: '#dfe3e8', eng: '#cfd8e3' }, wallTrim: '#8b949e', wallSide: '#c2c8d0',
    floor: { wood: ['#b98a5e', '#a97b52'], tile: ['#d5d9de', '#c6cbd1'], carpet: ['#6d7b91', '#65728a'] },
    slab: '#6d747d', slabTop: '#8a9199', facade: 'rgba(170,215,255,0.22)', facadeFrame: '#5d6873', frame: '#39414b',
    partitionLow: '#b7bec7', glass: 'rgba(190,225,255,0.18)', glassEdge: 'rgba(230,245,255,0.55)',
    exterior: '#8a95a3', exteriorDark: '#6c7784', roof: '#5f666f', parapet: '#7a828c',
    wood: '#8a5a36', woodLight: '#b07a4a', metal: '#9aa3ad', metalDark: '#59616b', fabric: '#4b6a8a', fabric2: '#c7683f', leaf: '#3f8f4f', leafLight: '#62b066', pot: '#b86b3f',
    screenOff: '#1b2230', screenIdle: '#27405e', screenOn: '#5ec8ff', code: ['#7ee787', '#79c0ff', '#ffa657', '#d2a8ff'], accent: '#ff7a1a', light: 'rgba(255,236,190,0.16)',
    lamp: '#fff2c4', sign: '#ffffff', signGlow: 'rgba(255,190,110,0.35)', liftFrame: '#39414b', liftGlass: 'rgba(170,220,255,0.24)', liftCar: '#e6e9ee', liftAccent: '#5ec8ff',
  },
  fantasy: {
    sky: ['#1a1036', '#5b3a8c', '#f4a261'], skyline: '#2a1d4a', skylineLit: '#ffcf6b', ground: '#4f7a3a', groundEdge: '#3d5f2c',
    road: '#6b5b4a', roadLine: '#8a7760', pavement: '#9c8f7a', pavementEdge: '#7d7160',
    wallBack: { lounge: '#c9b28f', hall: '#b9ab94', eng: '#a99c86' }, wallTrim: '#6b5640', wallSide: '#a8977c',
    floor: { wood: ['#9c6b3f', '#8a5d36'], tile: ['#a39a8c', '#958c7e'], carpet: ['#6b2f3a', '#5f2833'] },
    slab: '#6a5a48', slabTop: '#86745e', facade: 'rgba(255,210,140,0.16)', facadeFrame: '#5a4432', frame: '#4a3828',
    partitionLow: '#8e7a60', glass: 'rgba(255,220,160,0.14)', glassEdge: 'rgba(255,235,190,0.45)',
    exterior: '#9a8a74', exteriorDark: '#7d6f5c', roof: '#7a4a3a', parapet: '#8a7560',
    wood: '#6b4226', woodLight: '#9c6b3f', metal: '#b3a17a', metalDark: '#6e5f45', fabric: '#6b2f3a', fabric2: '#2f5e39', leaf: '#3d7f3a', leafLight: '#72b35a', pot: '#8a5a3a',
    screenOff: '#1d1430', screenIdle: '#3a2560', screenOn: '#b58cff', code: ['#ffd36b', '#b58cff', '#72e0c8', '#ff9fb2'], accent: '#ffcf6b', light: 'rgba(255,200,120,0.18)',
    lamp: '#ffcf6b', sign: '#ffe6a8', signGlow: 'rgba(255,190,90,0.4)', liftFrame: '#5a4432', liftGlass: 'rgba(160,120,255,0.22)', liftCar: '#d9c7a0', liftAccent: '#b58cff',
    torches: true, banners: true, fantasy: true,
  },
  blueprint: {
    sky: ['#0b2447', '#0b2447', '#0b2447'], line: '#9ecbff', lineDim: 'rgba(158,203,255,0.35)', text: '#e6f1ff', node: '#ffd23f', edge: 'rgba(255,210,63,0.55)', point: '#7ee787', lift: '#ff7ab6',
  },
};
