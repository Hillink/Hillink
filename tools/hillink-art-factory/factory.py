"""Hillink Art Factory: rigged + animated 3D character -> Hillink sprite sheet + metadata. Unattended and deterministic.

  python factory.py --recipe <id> --out <dir> [--scale N] [--evidence <dir>]

Runs under Python 3.11 with the pinned requirements (bpy is Blender as a Python module: no GUI, no display, no GPU).
Stages, each recorded in <out>/factory-report.json:
  1. load    the recipe's input file (allowlisted in recipes.json, sha256-checked)
  2. render  every clip x facing x frame with a fixed orthographic camera (config.json), supersampled, transparent
  3. pixel   pixel.py: ground point onto the World anchor, binary alpha, one shared palette, outline, sheet + json
No step takes a path, setting or code from the caller except the recipe id, the output folder and the scale.
"""
import argparse, hashlib, json, math, os, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def load_recipe(rid):
    recipes = json.load(open(os.path.join(HERE, 'recipes.json')))['recipes']
    if rid not in recipes:
        raise SystemExit(f'unknown recipe {rid!r}; allowlisted: {", ".join(sorted(recipes))}')
    r = recipes[rid]
    src = os.path.normpath(os.path.join(HERE, r['input']['file']))
    if not src.startswith(os.path.join(HERE, 'inputs') + os.sep):
        raise SystemExit('recipe input must live under inputs/')
    if sha256(src) != r['input']['sha256']:
        raise SystemExit('recipe input sha256 mismatch: refusing to run on an unexpected file')
    return r, src


def render(recipe, src, cfg, scale, raw_dir):
    import bpy
    from mathutils import Vector
    from bpy_extras.object_utils import world_to_camera_view

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    scene = bpy.context.scene
    arm = next((o for o in scene.objects if o.type == 'ARMATURE'), None)
    if arm is None:
        raise SystemExit('input has no armature (stage B output must be rigged)')

    def under_armature(o):
        p = o.parent
        while p is not None:
            if p == arm:
                return True
            p = p.parent
        return any(m.type == 'ARMATURE' and m.object == arm for m in o.modifiers)
    meshes = [o for o in scene.objects if o.type == 'MESH' and under_armature(o)]
    for o in scene.objects:
        if o.type == 'MESH' and o not in meshes:
            o.hide_render = True  # helpers that are not part of the character
    ad = arm.animation_data or arm.animation_data_create()
    for t in ad.nla_tracks:
        t.mute = True

    def use_action(name):
        act = bpy.data.actions.get(name)
        if act is None:
            raise SystemExit(f'input has no animation named {name!r} (stage C output must provide it)')
        ad.action = act
        if getattr(act, 'slots', None) and len(act.slots):
            ad.action_slot = act.slots[0]
        return act

    def bounds():
        dg = bpy.context.evaluated_depsgraph_get()
        pts = []
        for o in meshes:
            ev = o.evaluated_get(dg)
            me = ev.to_mesh()
            pts += [ev.matrix_world @ v.co for v in me.vertices]
            ev.to_mesh_clear()
        return pts

    # Rest measurement: the first clip's first frame. The character's height maps to the body plan's art height.
    first = next(iter(recipe['clips'].values()))
    act = use_action(first['action'])
    scene.frame_set(int(act.frame_range[0]))
    pts = bounds()
    zmin, zmax = min(p.z for p in pts), max(p.z for p in pts)
    height = zmax - zmin
    base_w, base_h = cfg['cell']
    W, H, SS = base_w * scale, base_h * scale, cfg['render']['supersample']
    art_h = cfg['bodyHeights'][recipe['bodyPlan']] * scale
    root = next(b for b in arm.pose.bones if b.parent is None)
    hips = next((b for b in arm.pose.bones if any(k in b.name.lower() for k in ('hips', 'pelvis', 'body'))), root)

    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam_data.sensor_fit = 'VERTICAL'
    cam_data.ortho_scale = H * height / art_h  # vertical extent so the character is art_h pixels tall on screen
    cam_data.clip_end = 10000
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    key = bpy.data.objects.new('key', bpy.data.lights.new('key', 'SUN'))
    key.data.energy = cfg['render']['keyStrength']
    scene.collection.objects.link(key)
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[1].default_value = cfg['render']['ambient']

    r = scene.render
    r.engine = cfg['render']['engine']
    r.resolution_x, r.resolution_y, r.resolution_percentage = W * SS, H * SS, 100
    r.film_transparent = True
    r.filter_size = 1.5
    r.threads_mode = 'FIXED'
    r.threads = cfg['render']['threads']
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_mode = 'RGBA'
    r.image_settings.color_depth = '8'
    scene.view_settings.view_transform = 'Standard'
    if r.engine == 'CYCLES':
        scene.cycles.device = 'CPU'
        scene.cycles.samples = cfg['render']['samples']
        scene.cycles.use_denoising = False
        scene.cycles.seed = cfg['render']['seed']
        scene.cycles.use_animated_seed = False

    el = math.radians(cfg['camera']['elevationDeg'])

    def aim(yaw, ground):
        az = math.radians(yaw)
        d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
        cam.location = ground + d * (height * 50)
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.view_layer.update()

    # Calibrate the scale on screen, not in the model: in the rest pose seen from the front-right camera, the
    # character's projected height must be exactly art_h pixels (camera pitch foreshortens a standing figure).
    # The sprite's foot point is where the soles meet the ground, not the point under the hips: in the rest pose take
    # the centre of the lowest vertices (bottom 3% of the height) relative to the hips, and keep that offset per frame.
    hp = arm.matrix_world @ hips.head
    soles = [p for p in pts if p.z <= zmin + 0.03 * height]
    foot_off = Vector((sum(p.x for p in soles) / len(soles) - hp.x, sum(p.y for p in soles) / len(soles) - hp.y, 0))
    aim(cfg['camera']['facings']['fr'], Vector((hp.x, hp.y, zmin)) + foot_off)
    ys = [world_to_camera_view(scene, cam, p).y for p in pts]
    cam_data.ortho_scale *= ((max(ys) - min(ys)) * H) / art_h
    frames_meta = {}
    os.makedirs(raw_dir, exist_ok=True)
    for clip, c in recipe['clips'].items():
        act = use_action(c['action'])
        f0, f1 = act.frame_range
        n = int(c['frames'])
        # Loops: n evenly spaced frames over [f0, f1) (the end frame repeats the start). One-shots include the end.
        steps = [f0 + (f1 - f0) * i / (n if c.get('loop', True) else max(1, n - 1)) for i in range(n)]
        for facing, yaw in cfg['camera']['facings'].items():
            for i, fr in enumerate(steps):
                scene.frame_set(int(math.floor(fr)), subframe=fr - math.floor(fr))
                # The ground point under the hips this frame: root motion and sway never move the sprite's anchor.
                hp = arm.matrix_world @ hips.head
                ground = Vector((hp.x, hp.y, zmin)) + foot_off
                aim(yaw, ground)
                # Key light from the camera's upper left, so every facing is lit the same way.
                key.rotation_euler = cam.rotation_euler.copy()
                key.rotation_euler.rotate_axis('X', math.radians(-35))
                key.rotation_euler.rotate_axis('Y', math.radians(-35))
                bpy.context.view_layer.update()
                g = world_to_camera_view(scene, cam, ground)
                name = f'{clip}__{facing}__{i}.png'
                r.filepath = os.path.join(raw_dir, name)
                bpy.ops.render.render(write_still=True)
                frames_meta.setdefault(clip, {}).setdefault(facing, []).append({'file': name, 'ground': [g.x * W * SS, (1 - g.y) * H * SS], 'actionFrame': round(fr, 3)})
    return {'blender': bpy.app.version_string, 'engine': r.engine, 'cell': [W, H], 'anchor': [cfg['anchor'][0] * scale, cfg['anchor'][1] * scale], 'supersample': SS, 'artHeight': art_h, 'modelHeight': round(height, 4), 'hipsBone': hips.name, 'frames': frames_meta}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--recipe', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--scale', type=int, default=1, choices=[1, 2, 3, 4])
    ap.add_argument('--evidence', default=None)
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(HERE, 'config.json')))
    t0 = time.time()
    recipe, src = load_recipe(a.recipe)
    evidence = os.path.abspath(a.evidence or os.path.join(a.out, '_evidence'))
    raw = os.path.join(evidence, 'raw')
    rendered = render(recipe, src, cfg, a.scale, raw)
    import pixel
    meta = pixel.build(rendered, recipe, a.recipe, cfg, raw, a.out, scale=a.scale)
    report = {'recipe': a.recipe, 'input': recipe['input'], 'scale': a.scale, 'blender': rendered['blender'], 'engine': rendered['engine'], 'seconds': round(time.time() - t0, 2),
              'clips': {k: v['action'] for k, v in recipe['clips'].items()}, 'renders': sum(len(f) for c in rendered['frames'].values() for f in c.values()),
              'sheet': meta['sheet'], 'json': meta['json'], 'sheetSha256': meta['sheetSha256']}
    pixel.contact_sheet(raw, rendered, os.path.join(evidence, 'raw-contact.png'))
    json.dump(report, open(os.path.join(evidence, 'factory-report.json'), 'w'), indent=1, sort_keys=True)
    print('HQ-ART ' + json.dumps(report, sort_keys=True))


if __name__ == '__main__':
    main()
