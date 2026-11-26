#!/usr/bin/env python3
"""Generate Chrome Web Store screenshots (1280x800) and small promo tile (440x280) in 24-bit RGB."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "store"
ICON_48 = ROOT / "assets" / "icons" / "icon-48.png"
ICON_128 = ROOT / "assets" / "icons" / "icon-128.png"

SRC_DRAWER = Path(r"C:\Users\ady\Pictures\Screenshots\Screenshot 2026-11-27 001330.png")
SRC_PILL = Path(r"C:\Users\ady\Pictures\Screenshots\Screenshot 2026-11-27 001320.png")

FONTS_DIR = Path(r"C:\Windows\Fonts")


def load_font(candidates: list[str], size: int) -> ImageFont.FreeTypeFont:
    for name in candidates:
        path = FONTS_DIR / name
        if path.is_file():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def make_gradient_bg(width: int, height: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    base = Image.new("RGBA", (width, height))
    px = base.load()
    for y in range(height):
        t = y / max(1, height - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(width):
            px[x, y] = (r, g, b, 255)
    return base


def add_radial_glow(canvas: Image.Image, cx: int, cy: int, rx: int, ry: int, color: tuple[int, int, int, int]) -> Image.Image:
    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=95))
    return Image.alpha_composite(canvas, glow)


def round_corners(img: Image.Image, radius: int) -> Image.Image:
    rgba = img.convert("RGBA")
    mask = Image.new("L", rgba.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, rgba.width, rgba.height], radius=radius, fill=255)
    out = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    out.paste(rgba, (0, 0), mask)
    return out


def render_screenshot(src_path: Path, headline: str, subtitle: str, out_path: Path) -> None:
    W, H = 1280, 800
    canvas = make_gradient_bg(W, H, (11, 15, 26), (19, 26, 46))
    canvas = add_radial_glow(canvas, W // 2 - 140, 260, 420, 220, (79, 70, 229, 78))
    canvas = add_radial_glow(canvas, W // 2 + 180, 540, 400, 240, (124, 58, 237, 62))

    font_title = load_font(["segoeuib.ttf", "arialbd.ttf"], 34)
    font_sub = load_font(["seguisb.ttf", "segoeui.ttf", "arial.ttf"], 18)

    draw = ImageDraw.Draw(canvas)

    # Top header: icon + headline centered
    icon = Image.open(ICON_48).convert("RGBA").resize((38, 38), Image.Resampling.LANCZOS)
    title_bbox = draw.textbbox((0, 0), headline, font=font_title)
    title_w = title_bbox[2] - title_bbox[0]
    title_h = title_bbox[3] - title_bbox[1]
    gap = 14
    total_header_w = icon.width + gap + title_w
    header_x = (W - total_header_w) // 2
    header_y = 34

    canvas.paste(icon, (header_x, header_y + max(0, (title_h - icon.height) // 2)), icon)
    draw = ImageDraw.Draw(canvas)
    draw.text((header_x + icon.width + gap, header_y - 3), headline, font=font_title, fill=(248, 250, 252, 255))

    # Subtitle centered
    sub_bbox = draw.textbbox((0, 0), subtitle, font=font_sub)
    sub_w = sub_bbox[2] - sub_bbox[0]
    draw.text(((W - sub_w) // 2, 86), subtitle, font=font_sub, fill=(156, 163, 175, 255))

    # Showcase frame preserving exact source aspect ratio
    src_img = Image.open(src_path).convert("RGBA")
    frame_w = 936
    frame_h = min(622, round(frame_w * src_img.height / src_img.width))
    frame_x = (W - frame_w) // 2
    frame_y = 140
    radius = 18

    resized = src_img.resize((frame_w, frame_h), Image.Resampling.LANCZOS)
    rounded = round_corners(resized, radius)

    # Soft shadow behind frame
    shadow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow_layer).rounded_rectangle(
        [frame_x, frame_y + 10, frame_x + frame_w, frame_y + frame_h + 10],
        radius=radius,
        fill=(0, 0, 0, 175),
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=24))
    canvas = Image.alpha_composite(canvas, shadow_layer)

    canvas.paste(rounded, (frame_x, frame_y), rounded)

    # Subtle crisp 1px border around showcase frame
    border_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(border_layer).rounded_rectangle(
        [frame_x, frame_y, frame_x + frame_w - 1, frame_y + frame_h - 1],
        radius=radius,
        outline=(255, 255, 255, 44),
        width=1,
    )
    canvas = Image.alpha_composite(canvas, border_layer)

    canvas.convert("RGB").save(out_path, format="PNG", optimize=True)


def render_promo_small(out_path: Path) -> None:
    W, H = 440, 280
    canvas = make_gradient_bg(W, H, (15, 20, 36), (26, 29, 58))
    canvas = add_radial_glow(canvas, 110, 90, 180, 140, (79, 70, 229, 115))
    canvas = add_radial_glow(canvas, 340, 210, 170, 130, (124, 58, 237, 95))

    icon = Image.open(ICON_128).convert("RGBA").resize((68, 68), Image.Resampling.LANCZOS)
    canvas.paste(icon, (32, 42), icon)

    font_title = load_font(["segoeuib.ttf", "arialbd.ttf"], 30)
    font_tag = load_font(["segoeui.ttf", "arial.ttf"], 15)
    font_pill = load_font(["seguisb.ttf", "arialbd.ttf"], 12)

    draw = ImageDraw.Draw(canvas)
    draw.text((116, 44), "LLM Queue", font=font_title, fill=(255, 255, 255, 255))
    draw.text((116, 84), "Auto-send follow-up prompts", font=font_tag, fill=(199, 210, 254, 255))

    # Subtitle line
    draw.text(
        (32, 136),
        "Queue multiple prompts while AI generates.\nZero waiting, 100% local & open source.",
        font=font_tag,
        fill=(203, 213, 225, 255),
        spacing=6,
    )

    # Platform pills (draw onto separate RGBA layer so semi-transparency composites cleanly)
    pills = ["Auto-Queue", "Batch Split", "Presets", "100% Local"]
    pill_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    pill_draw = ImageDraw.Draw(pill_layer)
    px = 32
    py = 208
    for label in pills:
        bbox = pill_draw.textbbox((0, 0), label, font=font_pill)
        tw = bbox[2] - bbox[0]
        pw = tw + 20
        ph = 28
        pill_draw.rounded_rectangle(
            [px, py, px + pw, py + ph],
            radius=14,
            fill=(255, 255, 255, 28),
            outline=(255, 255, 255, 68),
            width=1,
        )
        pill_draw.text((px + 10, py + 6), label, font=font_pill, fill=(241, 245, 249, 255))
        px += pw + 8

    canvas = Image.alpha_composite(canvas, pill_layer)
    canvas.convert("RGB").save(out_path, format="PNG", optimize=True)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    s1 = OUT_DIR / "screenshot-1-drawer.png"
    s2 = OUT_DIR / "screenshot-2-pill.png"
    p1 = OUT_DIR / "promo-small-440x280.png"

    render_screenshot(
        SRC_DRAWER,
        "Queue Follow-Up Prompts While AI Replies",
        "Auto-sends each prompt after generation finishes — Pause, Step 1, Presets & Batch Split",
        s1,
    )
    render_screenshot(
        SRC_PILL,
        "Unobtrusive Floating Pill & Auto-Queue on Enter",
        "Press Enter while the AI is streaming to queue your next prompt automatically",
        s2,
    )
    render_promo_small(p1)

    for path in (s1, s2, p1):
        with Image.open(path) as im:
            print(f"{path} -> {im.size}, mode={im.mode}")


if __name__ == "__main__":
    main()
