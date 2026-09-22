#!/usr/bin/env python3
"""
Prepare the Android template for ONE build.

Everything comes from environment variables (never from shell interpolation):
  APP_NAME, PACKAGE_NAME, WEBSITE_URL, ICON_COLOR, ICON_URL   (ICON_URL optional)

What it does
  1. validates the inputs (fails early with a clear message)
  2. writes app name / colours / network config into the Android resources
  3. downloads the logo (uploaded icon -> favicon fallbacks) and generates a proper
     adaptive launcher icon.  If no logo can be loaded the template icon is kept.

Usage:  python3 scripts/prepare_android.py [--template DIR] [--preview out.png]
"""
import argparse
import io
import os
import re
import sys
from pathlib import Path
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen
from xml.sax.saxutils import escape as xml_escape

DEFAULT_COLOR = "#6366f1"
PACKAGE_RE = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$")
URL_RE = re.compile(r"^https?://[^\s\"'<>\\]+$")
COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def fail(msg):
    print(f"::error::{msg}")
    sys.exit(1)


# ── validation ───────────────────────────────────────────────────────────────
def clean_app_name(raw):
    name = re.sub(r"[\x00-\x1f\x7f]", " ", raw or "")
    name = re.sub(r"\s+", " ", name).strip()
    if not 1 <= len(name) <= 50:
        fail("APP_NAME must be 1-50 characters")
    return name


def android_string(value):
    """Escape a value for <string> in res/values/strings.xml (keeps unicode names intact)."""
    value = value.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')
    value = xml_escape(value)
    if value[:1] in ("@", "?"):
        value = "\\" + value
    return value


# ── icon helpers ─────────────────────────────────────────────────────────────
def fetch(url, limit=8 * 1024 * 1024, timeout=25):
    if urlparse(url).scheme not in ("http", "https"):
        raise ValueError("unsupported url scheme")
    req = Request(url, headers={"User-Agent": "Mozilla/5.0 (Web2AppBuilder)"})
    with urlopen(req, timeout=timeout) as resp:
        data = resp.read(limit + 1)
    if len(data) > limit:
        raise ValueError("image too large")
    return data


def load_image(data):
    from PIL import Image

    img = Image.open(io.BytesIO(data))
    if img.format == "ICO":
        try:
            best = max(img.ico.sizes())
            img = img.ico.getimage(best)
        except Exception:
            pass
    return img.convert("RGBA")


def pick_source(candidates):
    """First candidate that loads and is big enough; otherwise the largest that loaded."""
    best = None
    for index, url in enumerate(candidates):
        if not url:
            continue
        try:
            img = load_image(fetch(url))
        except Exception as exc:  # noqa: BLE001 - any failure -> next candidate
            print(f"  icon candidate failed ({url[:80]}): {exc}")
            continue
        w, h = img.size
        print(f"  icon candidate ok: {url[:80]} ({w}x{h})")
        explicit_upload = index == 0 and os.environ.get("ICON_SOURCE") == "upload"
        if explicit_upload or min(w, h) >= 96:
            return img, url
        if best is None or w * h > best[0].width * best[0].height:
            best = (img, url)
    return best if best else (None, None)


def hex_of(rgb):
    return "#%02x%02x%02x" % tuple(int(v) for v in rgb[:3])


def build_foreground(img, fallback_color):
    """Return (432x432 RGBA foreground, background hex)."""
    from PIL import Image, ImageOps

    lanczos = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
    size = 432
    w, h = img.size
    corners = [img.getpixel(p) for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    opaque = all(c[3] >= 250 for c in corners)

    if opaque:
        bg = hex_of([sum(c[i] for c in corners) / 4 for i in range(3)])
        fit = int(size * 0.66)
    else:
        bg = fallback_color
        bbox = img.getchannel("A").getbbox()
        if bbox:
            img = img.crop(bbox)
        fit = int(size * 0.60)

    logo = ImageOps.contain(img, (fit, fit), lanczos)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(logo, ((size - logo.width) // 2, (size - logo.height) // 2))
    return canvas, bg


def write_preview(fg, bg, path):
    from PIL import Image, ImageDraw

    canvas = Image.new("RGBA", (432, 432), bg)
    canvas.alpha_composite(fg)
    mask = Image.new("L", (432, 432), 0)
    ImageDraw.Draw(mask).ellipse((72, 72, 360, 360), fill=255)
    out = Image.new("RGBA", (432, 432), (30, 30, 40, 255))
    out.paste(canvas, (0, 0), mask)
    out.save(path)


# ── main ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--template", default=str(Path(__file__).resolve().parent.parent / "android-template"))
    parser.add_argument("--preview", default="")
    args = parser.parse_args()

    root = Path(args.template)
    res = root / "app/src/main/res"
    if not res.is_dir():
        fail(f"Android template not found at {root}")

    app_name = clean_app_name(os.environ.get("APP_NAME"))
    package = (os.environ.get("PACKAGE_NAME") or "").strip()
    url = (os.environ.get("WEBSITE_URL") or "").strip()
    color = (os.environ.get("ICON_COLOR") or "").strip()
    icon_url = (os.environ.get("ICON_URL") or "").strip()

    if not PACKAGE_RE.match(package):
        fail(f"Invalid package name: {package!r}")
    if not URL_RE.match(url):
        fail(f"Invalid website URL: {url!r}")
    if not COLOR_RE.match(color):
        color = DEFAULT_COLOR
    host = urlparse(url).hostname or ""
    origin = f"{urlparse(url).scheme}://{urlparse(url).netloc}"

    print(f"App name : {app_name}")
    print(f"Package  : {package}")
    print(f"Website  : {url}")
    print(f"Colour   : {color}")

    # network security config (only relax cleartext for http:// sites)
    nsc = ['<?xml version="1.0" encoding="utf-8"?>', "<network-security-config>"]
    if url.startswith("http://") and host:
        nsc.append('    <domain-config cleartextTrafficPermitted="true">')
        nsc.append(f'        <domain includeSubdomains="true">{xml_escape(host)}</domain>')
        nsc.append("    </domain-config>")
    nsc += [
        '    <base-config cleartextTrafficPermitted="false">',
        "        <trust-anchors>",
        '            <certificates src="system" />',
        "        </trust-anchors>",
        "    </base-config>",
        "</network-security-config>",
        "",
    ]
    (res / "xml/network_security_config.xml").write_text("\n".join(nsc), encoding="utf-8")
    if url.startswith("http://"):
        manifest = root / "app/src/main/AndroidManifest.xml"
        manifest.write_text(
            manifest.read_text(encoding="utf-8").replace('android:usesCleartextTraffic="false"', 'android:usesCleartextTraffic="true"'),
            encoding="utf-8",
        )

    # app name
    strings = res / "values/strings.xml"
    text = strings.read_text(encoding="utf-8")
    text = re.sub(r"(<string name=\"app_name\"[^>]*>).*?(</string>)", lambda m: m.group(1) + android_string(app_name) + m.group(2), text, count=1, flags=re.S)
    strings.write_text(text, encoding="utf-8")

    # icon
    bg_color = color
    try:
        candidates = [icon_url, f"https://www.google.com/s2/favicons?sz=256&domain_url={quote(url, safe='')}", f"{origin}/apple-touch-icon.png", f"{origin}/favicon.ico"]
        print("Generating launcher icon...")
        source, used = pick_source(candidates)
        if source is None:
            print("No logo could be loaded - keeping the template icon.")
        else:
            fg, bg_color = build_foreground(source, color)
            drawable_nodpi = res / "drawable-nodpi"
            drawable_nodpi.mkdir(parents=True, exist_ok=True)
            fg.save(drawable_nodpi / "ic_launcher_foreground.png")
            old_vector = res / "drawable/ic_launcher_foreground.xml"
            if old_vector.exists():
                old_vector.unlink()
            if args.preview:
                write_preview(fg, bg_color, args.preview)
            print(f"Icon generated from {used[:100]}  (background {bg_color})")
    except Exception as exc:  # noqa: BLE001 - never fail the build because of the logo
        print(f"Icon generation failed ({exc}); keeping the template icon.")
        bg_color = color

    colors = res / "values/colors.xml"
    text = colors.read_text(encoding="utf-8").replace("ICON_COLOR", color).replace("ICON_BG", bg_color)
    colors.write_text(text, encoding="utf-8")
    print("Android project prepared.")


if __name__ == "__main__":
    main()
