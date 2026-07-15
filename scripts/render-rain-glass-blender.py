import math
import os
import random
from array import array

import bpy


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUTPUT = os.environ.get(
    'RAIN_GLASS_OUTPUT',
    os.path.join(ROOT, 'web', 'assets', 'rain-glass-blender-bg.png')
)
SCENE_OUTPUT = os.path.join(ROOT, 'web', 'assets', 'rain-glass-blender-scene.blend')
WIDTH = 1920
HEIGHT = 1080

random.seed(70701)


def clamp01(value):
    return max(0.0, min(1.0, value))


def smoothstep(edge0, edge1, value):
    if edge0 == edge1:
        return 1.0 if value >= edge1 else 0.0
    t = clamp01((value - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def blend_pixel(pixels, index, color, alpha):
    if alpha <= 0:
        return
    alpha = clamp01(alpha)
    inv = 1.0 - alpha
    pixels[index] = pixels[index] * inv + color[0] * alpha
    pixels[index + 1] = pixels[index + 1] * inv + color[1] * alpha
    pixels[index + 2] = pixels[index + 2] * inv + color[2] * alpha
    pixels[index + 3] = 1.0


def draw_drop(pixels, cx, cy, rx, ry, alpha):
    outer_rx = rx * 1.18
    outer_ry = ry * 1.18
    x0 = max(0, int(cx - outer_rx - 2))
    x1 = min(WIDTH - 1, int(cx + outer_rx + 2))
    y0 = max(0, int(cy - outer_ry - 2))
    y1 = min(HEIGHT - 1, int(cy + outer_ry + 2))
    rim_strength = 0.62 + random.random() * 0.26
    rotation = (random.random() - 0.5) * 0.22
    cos_r = math.cos(rotation)
    sin_r = math.sin(rotation)

    for py in range(y0, y1 + 1):
        for px in range(x0, x1 + 1):
            dx = px - cx
            dy = py - cy
            ux = (dx * cos_r + dy * sin_r) / rx
            uy = (-dx * sin_r + dy * cos_r) / ry
            distance = math.sqrt(ux * ux + uy * uy)
            if distance > 1.18:
                continue

            index = (py * WIDTH + px) * 4
            outer = 1.0 - smoothstep(1.0, 1.18, distance)
            if distance > 1.0:
                blend_pixel(pixels, index, (0.0, 0.0, 0.0), alpha * outer * rim_strength * 0.82)
                continue

            rim = smoothstep(0.62, 1.0, distance)
            center = 1.0 - smoothstep(0.0, 0.86, distance)
            glass = 0.18 + center * 0.22
            blend_pixel(pixels, index, (0.96, 0.98, 0.98), alpha * glass)
            blend_pixel(pixels, index, (0.0, 0.0, 0.0), alpha * rim * rim_strength * 0.92)

            if uy > 0.18:
                lower = smoothstep(0.18, 0.86, uy) * (1.0 - smoothstep(0.74, 1.0, distance))
                blend_pixel(pixels, index, (0.0, 0.0, 0.0), alpha * lower * 0.32)

            hx = (ux + 0.34) / 0.2
            hy = (uy + 0.34) / 0.075
            highlight_distance = math.sqrt(hx * hx + hy * hy)
            if highlight_distance < 1.0:
                highlight = (1.0 - highlight_distance) * 0.76
                blend_pixel(pixels, index, (1.0, 1.0, 1.0), alpha * highlight)


def add_soft_background(pixels):
    for y in range(HEIGHT):
        vertical = y / max(1, HEIGHT - 1)
        for x in range(WIDTH):
            horizontal = x / max(1, WIDTH - 1)
            cloud = (
                math.sin(horizontal * 9.3 + vertical * 2.1) * 0.008
                + math.sin(horizontal * 3.6 - vertical * 7.8) * 0.01
                + (random.random() - 0.5) * 0.012
            )
            value = 0.86 + (1.0 - vertical) * 0.045 + horizontal * 0.018 + cloud
            index = (y * WIDTH + x) * 4
            pixels[index] = clamp01(value * 0.98)
            pixels[index + 1] = clamp01(value)
            pixels[index + 2] = clamp01(value * 1.01)
            pixels[index + 3] = 1.0


def generate_pixels():
    pixels = array('f', [1.0]) * (WIDTH * HEIGHT * 4)
    add_soft_background(pixels)

    for _ in range(122):
        radius = random.uniform(8.0, 23.0)
        draw_drop(
            pixels,
            random.uniform(radius, WIDTH - radius),
            random.uniform(radius, HEIGHT - radius),
            radius * random.uniform(0.82, 1.24),
            radius * random.uniform(0.78, 1.18),
            random.uniform(0.78, 0.98),
        )

    for _ in range(760):
        radius = random.uniform(3.0, 9.8)
        draw_drop(
            pixels,
            random.uniform(radius, WIDTH - radius),
            random.uniform(radius, HEIGHT - radius),
            radius * random.uniform(0.82, 1.28),
            radius * random.uniform(0.78, 1.18),
            random.uniform(0.6, 0.9),
        )

    for _ in range(3600):
        radius = random.uniform(0.75, 2.8)
        draw_drop(
            pixels,
            random.uniform(radius, WIDTH - radius),
            random.uniform(radius, HEIGHT - radius),
            radius * random.uniform(0.82, 1.25),
            radius * random.uniform(0.78, 1.18),
            random.uniform(0.5, 0.78),
        )

    return pixels


def save_image(pixels):
    image = bpy.data.images.new('rain_glass_round_drops', width=WIDTH, height=HEIGHT, alpha=True)
    image.pixels.foreach_set(pixels)
    image.filepath_raw = OUTPUT
    image.file_format = 'PNG'
    image.save()
    return image


def build_preview_scene(image):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
    plane = bpy.context.object
    plane.name = 'rain glass round droplet preview'
    plane.dimensions = (16, 9, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    material = bpy.data.materials.new('generated round raindrop glass')
    material.use_nodes = True
    nodes = material.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    texture = nodes.new(type='ShaderNodeTexImage')
    texture.image = image
    if bsdf and 'Base Color' in bsdf.inputs:
        material.node_tree.links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
    plane.data.materials.append(material)

    bpy.ops.object.camera_add(location=(0, 0, 10), rotation=(0, 0, 0))
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 9
    bpy.context.scene.camera = camera
    bpy.context.scene.render.resolution_x = WIDTH
    bpy.context.scene.render.resolution_y = HEIGHT

    bpy.ops.wm.save_as_mainfile(filepath=SCENE_OUTPUT)


if __name__ == '__main__':
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    generated = save_image(generate_pixels())
    build_preview_scene(generated)
