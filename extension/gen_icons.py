#!/usr/bin/env python3
"""Generate PNG icons for the Meet Recorder extension."""
import struct, zlib, os, math

def make_png(size, pixels_rgba):
    """pixels_rgba: flat list of (r,g,b,a) tuples, row by row."""
    def w32(n): return struct.pack('>I', n)
    def chunk(name, data):
        crc = zlib.crc32(name + data) & 0xffffffff
        return w32(len(data)) + name + data + w32(crc)

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', w32(size) + w32(size) + b'\x08\x06\x00\x00\x00')  # RGBA

    raw = b''
    for y in range(size):
        raw += b'\x00'
        for x in range(size):
            r, g, b, a = pixels_rgba[y * size + x]
            raw += bytes([r, g, b, a])

    idat = chunk(b'IDAT', zlib.compress(raw, 9))
    iend = chunk(b'IEND', b'')
    return sig + ihdr + idat + iend


def draw_icon(size, bg, fg, shape='mic'):
    """Draw a simple icon: bg color background with a centered shape in fg color."""
    pixels = []
    cx, cy = size / 2, size / 2
    r_outer = size * 0.45
    r_inner = r_outer * 0.55

    for y in range(size):
        for x in range(size):
            dx, dy = x - cx, y - cy
            dist = math.sqrt(dx*dx + dy*dy)

            # Rounded background circle
            if dist > r_outer:
                pixels.append((0, 0, 0, 0))  # transparent
                continue

            # Anti-alias edge
            edge = r_outer - dist
            alpha = int(min(255, edge * 4)) if edge < 1 else 255

            if shape == 'mic':
                # White microphone body (rounded rectangle in center)
                rel_x = dx / size
                rel_y = dy / size
                in_body = abs(rel_x) < 0.13 and -0.22 < rel_y < 0.12
                in_top  = rel_x**2 + (rel_y - 0.12)**2 < 0.013**2 * 100  # mic top cap
                in_arc  = 0.015 < rel_x**2 + (rel_y - 0.19)**2 < 0.033   # mic arc
                in_stand = abs(rel_x) < 0.03 and 0.19 < rel_y < 0.27      # stand
                in_base  = abs(rel_x) < 0.13 and 0.25 < rel_y < 0.29      # base

                # Mic body (rounded rect)
                mic_body = abs(rel_x) < 0.10 and -0.20 < rel_y < 0.10
                mic_rounded = rel_x**2 + (rel_y + 0.20)**2 < 0.011 * 100 or \
                              rel_x**2 + (rel_y - 0.10)**2 < 0.011 * 100

                in_mic = mic_body or (abs(rel_x) < 0.10 and -0.21 < rel_y < 0.11)

                # Semicircle arc around mic
                arc_dist = math.sqrt(rel_x**2 + (rel_y - 0.10)**2)
                in_arc2  = 0.13 < arc_dist < 0.19 and rel_y < 0.10 + arc_dist * 0.3

                if in_mic:
                    pixels.append((*fg, alpha))
                else:
                    pixels.append((*bg, alpha))

            elif shape == 'stop':
                # White square in center (stop symbol)
                rel_x = dx / size
                rel_y = dy / size
                if abs(rel_x) < 0.22 and abs(rel_y) < 0.22:
                    pixels.append((*fg, alpha))
                else:
                    pixels.append((*bg, alpha))

            else:
                pixels.append((*bg, alpha))

    return pixels


def draw_simple(size, bg, fg, is_rec=False):
    """Simpler, cleaner icon: colored circle + letter."""
    pixels = []
    cx, cy = size / 2, size / 2
    r = size * 0.46

    for y in range(size):
        for x in range(size):
            dx, dy = x - cx, y - cy
            dist = math.sqrt(dx*dx + dy*dy)

            if dist > r:
                pixels.append((0, 0, 0, 0))
                continue

            edge = r - dist
            alpha = int(min(255, edge * 5)) if edge < 1.5 else 255

            if is_rec:
                # Red circle with white inner dot
                inner_r = r * 0.35
                if dist < inner_r:
                    pixels.append((*fg, alpha))
                else:
                    pixels.append((*bg, alpha))
            else:
                # Blue circle with white mic stand (simple lines)
                rel_x = dx / size
                rel_y = dy / size
                # Simple mic: vertical line + small cap
                in_stem  = abs(rel_x) < 0.07 and -0.15 < rel_y < 0.18
                in_cap   = rel_x**2 + (rel_y + 0.15)**2 < 0.07**2
                in_base  = abs(rel_x) < 0.15 and 0.16 < rel_y < 0.21
                in_stand = abs(rel_x) < 0.03 and 0.18 < rel_y < 0.25
                arc_dist = math.sqrt(rel_x**2 + (rel_y - 0.18)**2)
                in_arc   = 0.11 < arc_dist < 0.16 and rel_y > 0.04

                if in_stem or in_cap or in_base or in_stand or in_arc:
                    pixels.append((*fg, alpha))
                else:
                    pixels.append((*bg, alpha))

    return pixels


os.makedirs('icons', exist_ok=True)

BLUE = (0, 122, 255)
RED  = (255, 59, 48)
WHITE = (255, 255, 255)

for size in [16, 48, 128]:
    # Normal icon: blue with white mic
    p = draw_simple(size, BLUE, WHITE, is_rec=False)
    with open(f'icons/icon{size}.png', 'wb') as f:
        f.write(make_png(size, p))

    # Recording icon: red with white stop dot
    p = draw_simple(size, RED, WHITE, is_rec=True)
    with open(f'icons/icon{size}_rec.png', 'wb') as f:
        f.write(make_png(size, p))

print("Icons generated in ./icons/")
