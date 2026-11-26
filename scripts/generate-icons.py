#!/usr/bin/env python3
"""Generate crisp supersampled PNG extension icons matching assets/icon.svg."""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "icons"
SIZES = [16, 32, 48, 128]
SCALE = 4


def lerp_color(c1: tuple[int, int, int], c2: tuple[int, int, int], t: float) -> tuple[int, int, int, int]:
    return (
        int(c1[0] + (c2[0] - c1[0]) * t),
        int(c1[1] + (c2[1] - c1[1]) * t),
        int(c1[2] + (c2[2] - c1[2]) * t),
        255,
    )


def render_master(base_size: int = 128) -> Image.Image:
    s = base_size * SCALE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))

    # Diagonal indigo (#4F46E5) -> violet (#7C3AED) gradient
    grad = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    c_start = (79, 70, 229)
    c_end = (124, 58, 237)
    px = grad.load()
    for y in range(s):
        for x in range(s):
            t = (x + y) / (2 * (s - 1))
            px[x, y] = lerp_color(c_start, c_end, t)

    # Squircle mask
    pad = int(6 * SCALE)
    radius = int(28 * SCALE)
    mask = Image.new("L", (s, s), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([pad, pad, s - pad, s - pad], radius=radius, fill=255)
    img.paste(grad, (0, 0), mask)

    # Subtle top sheen
    sheen = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sheen_draw = ImageDraw.Draw(sheen)
    sheen_draw.rounded_rectangle(
        [pad, pad, s - pad, int(s * 0.52)],
        radius=radius,
        fill=(255, 255, 255, 36),
    )
    sheen_clipped = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sheen_clipped.paste(sheen, (0, 0), mask)
    img = Image.alpha_composite(img, sheen_clipped)

    # Queue bars + dispatch play chevron
    overlay = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    def sc(val: float) -> int:
        return int(round(val * SCALE))

    # Top bar (queued later)
    draw.rounded_rectangle(
        [sc(26), sc(34), sc(80), sc(45)],
        radius=sc(5.5),
        fill=(255, 255, 255, 138),
    )
    # Middle bar (queued next)
    draw.rounded_rectangle(
        [sc(26), sc(53), sc(92), sc(65)],
        radius=sc(6),
        fill=(255, 255, 255, 202),
    )
    # Bottom bar (dispatching)
    draw.rounded_rectangle(
        [sc(26), sc(73), sc(72), sc(86)],
        radius=sc(6.5),
        fill=(255, 255, 255, 255),
    )

    # Dispatch chevron / play triangle with soft rounded corners
    pts = [
        (sc(83), sc(70)),
        (sc(104), sc(82.5)),
        (sc(83), sc(95)),
    ]
    draw.polygon(pts, fill=(255, 255, 255, 255))
    for p in pts:
        r = sc(2.2)
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=(255, 255, 255, 255))

    return Image.alpha_composite(img, overlay)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    master = render_master(128)
    for size in SIZES:
        resized = master.resize((size, size), Image.Resampling.LANCZOS)
        out_path = OUT_DIR / f"icon-{size}.png"
        resized.save(out_path, format="PNG", optimize=True)
        print(f"Generated {out_path} ({size}x{size})")


if __name__ == "__main__":
    main()
