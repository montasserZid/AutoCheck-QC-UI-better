"""Remove the external near-white background from the vehicle WebP library.

The segmentation uses border-connected background seeds plus OpenCV GrabCut.
It never treats all white pixels as background, which keeps white body panels,
headlights, chrome, and highlights inside the vehicle silhouette.
"""

from __future__ import annotations

import argparse
import json
import shutil
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


@dataclass
class ProcessResult:
    relative: str
    status: str
    original_size: tuple[int, int]
    output_size: tuple[int, int]
    foreground_ratio: float
    transparent_ratio: float
    strong_pixels_kept: float
    reason: str = ""


def _border_pixels(rgb: np.ndarray) -> np.ndarray:
    return np.concatenate((rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]), axis=0)


def _connected_background(rgb: np.ndarray, threshold: float) -> np.ndarray:
    base = np.median(_border_pixels(rgb), axis=0)
    distance = np.linalg.norm(rgb.astype(np.float32) - base, axis=2)
    near_background = (distance <= threshold).astype(np.uint8)
    _, labels = cv2.connectedComponents(near_background, connectivity=8)
    border_labels = np.unique(np.concatenate((labels[0], labels[-1], labels[:, 0], labels[:, -1])))
    return np.isin(labels, border_labels)


def segment(rgb: np.ndarray, threshold: float = 18.0) -> tuple[np.ndarray, np.ndarray]:
    """Return a foreground mask and an alpha channel for an RGB image."""

    height, width = rgb.shape[:2]
    base = np.median(_border_pixels(rgb), axis=0)
    distance = np.linalg.norm(rgb.astype(np.float32) - base, axis=2)
    connected_background = _connected_background(rgb, threshold)

    grabcut_mask = np.full((height, width), cv2.GC_PR_BGD, dtype=np.uint8)
    grabcut_mask[~connected_background] = cv2.GC_PR_FGD
    strong_foreground = distance > 42
    strong_foreground[:8, :] = False
    strong_foreground[-8:, :] = False
    strong_foreground[:, :8] = False
    strong_foreground[:, -8:] = False
    grabcut_mask[strong_foreground] = cv2.GC_FGD

    background_model = np.zeros((1, 65), dtype=np.float64)
    foreground_model = np.zeros((1, 65), dtype=np.float64)
    cv2.grabCut(rgb, grabcut_mask, None, background_model, foreground_model, 5, cv2.GC_INIT_WITH_MASK)
    foreground = (grabcut_mask == cv2.GC_FGD) | (grabcut_mask == cv2.GC_PR_FGD)

    # Keep the connected vehicle silhouette and discard isolated segmentation noise.
    components, labels, stats, _ = cv2.connectedComponentsWithStats(foreground.astype(np.uint8), 8)
    if components > 1:
        largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        foreground &= labels == largest

    # Anti-alias only near-white pixels at the external boundary. Internal white
    # panels remain opaque because they are not adjacent to the background.
    boundary = foreground & (~cv2.erode(foreground.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool))
    luminance = np.mean(rgb.astype(np.float32), axis=2)
    alpha = np.where(foreground, 255, 0).astype(np.uint8)
    pale_edge = boundary & (luminance > 235)
    edge_alpha = np.clip((254.0 - luminance[pale_edge]) * 14.0, 0, 255).astype(np.uint8)
    alpha[pale_edge] = edge_alpha

    return foreground, alpha


def process_file(source: Path, destination: Path) -> ProcessResult:
    original = Image.open(source).convert("RGB")
    rgb = np.asarray(original)
    foreground, alpha = segment(rgb)
    foreground_ratio = float(np.mean(foreground))
    transparent_ratio = float(np.mean(alpha == 0))
    strong = np.linalg.norm(rgb.astype(np.float32) - np.median(_border_pixels(rgb), axis=0), axis=2) > 42
    strong_pixels_kept = float(np.mean(foreground[strong])) if np.any(strong) else 1.0

    reason = ""
    status = "processed"
    if foreground_ratio < 0.03 or foreground_ratio > 0.85:
        status = "failed"
        reason = f"suspicious foreground ratio {foreground_ratio:.3f}"
    elif strong_pixels_kept < 0.985:
        status = "failed"
        reason = f"strong vehicle pixels retained at {strong_pixels_kept:.3f}"

    if status == "processed":
        rgba = np.dstack((rgb, alpha))
        destination.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(rgba, mode="RGBA").save(destination, format="WEBP", lossless=True, method=6)

    return ProcessResult(
        relative=source.as_posix(),
        status=status,
        original_size=original.size,
        output_size=original.size,
        foreground_ratio=foreground_ratio,
        transparent_ratio=transparent_ratio,
        strong_pixels_kept=strong_pixels_kept,
        reason=reason,
    )


def composite_checkerboard(image: Image.Image, dark: bool) -> Image.Image:
    square = 24
    light = (62, 62, 62) if dark else (248, 248, 248)
    shade = (42, 42, 42) if dark else (224, 224, 224)
    background = Image.new("RGB", image.size, light)
    draw = cv2.cvtColor(np.asarray(background), cv2.COLOR_RGB2BGR)
    for y in range(0, image.height, square):
        for x in range(0, image.width, square):
            if ((x // square) + (y // square)) % 2:
                draw[y:y + square, x:x + square] = shade[::-1]
    checked = Image.fromarray(cv2.cvtColor(draw, cv2.COLOR_BGR2RGB))
    checked.paste(image.convert("RGBA"), mask=image.getchannel("A"))
    return checked


def contact_sheet(paths: list[tuple[str, Path]], output: Path, dark: bool) -> None:
    cell_width, cell_height = 384, 280
    sheet = Image.new("RGB", (cell_width * 2, cell_height * 3), (238, 238, 238))
    from PIL import ImageDraw

    draw = ImageDraw.Draw(sheet)
    for index, (label, path) in enumerate(paths):
        image = Image.open(path).convert("RGBA")
        image.thumbnail((cell_width - 16, cell_height - 38))
        rendered = composite_checkerboard(image, dark)
        x = (index % 2) * cell_width + 8
        y = (index // 2) * cell_height + 28
        sheet.paste(rendered, (x, y))
        draw.text((x, y - 21), label, fill=(10, 10, 10))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=Path("public/vehicles"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    sources = sorted(args.input.rglob("*.webp"))
    results: list[ProcessResult] = []
    for source in sources:
        relative = source.relative_to(args.input)
        results.append(process_file(source, args.output / relative))
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps([result.__dict__ for result in results], indent=2), encoding="utf-8")
    print(json.dumps({"files": len(sources), "processed": sum(r.status == "processed" for r in results), "failed": sum(r.status == "failed" for r in results)}))


if __name__ == "__main__":
    main()
