"""Build runtime character atlases from 4x6 generated sprite sources.

The cardinal source rows are down move/action, up move/action, and left
move/action. The diagonal source already follows the runtime's six-row
idle/walk/attack layout. Both inputs must have transparency applied first.
"""

from __future__ import annotations

import argparse
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from statistics import median

from PIL import Image, ImageEnhance


COLS = 4
SOURCE_ROWS = 6
FRAME_SIZE = 96
ANCHOR_X = 48
ANCHOR_Y = 84
CARDINAL_ROWS = 18
DIAGONAL_ROWS = 6


@dataclass(frozen=True)
class Component:
    area: int
    bbox: tuple[int, int, int, int]


@dataclass(frozen=True)
class Cell:
    image: Image.Image
    main: Component
    meaningful_bbox: tuple[int, int, int, int]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cardinal-source", required=True, type=Path)
    parser.add_argument("--diagonal-source", required=True, type=Path)
    parser.add_argument("--out-cardinal", required=True, type=Path)
    parser.add_argument("--out-diagonal", required=True, type=Path)
    parser.add_argument("--target-height", type=int, default=68)
    parser.add_argument(
        "--frame-size",
        type=int,
        default=96,
        help="Square output cell size. Use 192 with --target-height 136 for true HD atlases.",
    )
    parser.add_argument(
        "--allow-detached-movement",
        action="store_true",
        help="Keep intentional detached movement parts such as familiars.",
    )
    return parser.parse_args()


def connected_components(alpha: Image.Image, threshold: int = 48) -> list[Component]:
    width, height = alpha.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    components: list[Component] = []

    for y in range(height):
        for x in range(width):
            idx = y * width + x
            if visited[idx] or pixels[x, y] <= threshold:
                continue

            queue: deque[tuple[int, int]] = deque([(x, y)])
            visited[idx] = 1
            area = 0
            min_x = max_x = x
            min_y = max_y = y

            while queue:
                px, py = queue.popleft()
                area += 1
                min_x = min(min_x, px)
                max_x = max(max_x, px)
                min_y = min(min_y, py)
                max_y = max(max_y, py)

                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if nx < 0 or nx >= width or ny < 0 or ny >= height:
                        continue
                    nidx = ny * width + nx
                    if visited[nidx] or pixels[nx, ny] <= threshold:
                        continue
                    visited[nidx] = 1
                    queue.append((nx, ny))

            components.append(Component(area, (min_x, min_y, max_x + 1, max_y + 1)))

    return components


def union_bbox(boxes: list[tuple[int, int, int, int]]) -> tuple[int, int, int, int]:
    return (
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    )


def split_source(
    path: Path,
    movement_rows: tuple[int, ...],
    allow_detached_movement: bool = False,
) -> list[list[Cell]]:
    source = Image.open(path).convert("RGBA")
    cells: list[list[Cell]] = []

    for row in range(SOURCE_ROWS):
        row_cells: list[Cell] = []
        y0 = round(row * source.height / SOURCE_ROWS)
        y1 = round((row + 1) * source.height / SOURCE_ROWS)
        for col in range(COLS):
            x0 = round(col * source.width / COLS)
            x1 = round((col + 1) * source.width / COLS)
            image = source.crop((x0, y0, x1, y1))
            alpha = image.getchannel("A")
            components = connected_components(alpha)
            if not components:
                raise ValueError(f"No visible pixels in {path} cell ({col}, {row})")

            main = max(components, key=lambda component: component.area)
            minimum_area = max(8, round(main.area * 0.007))
            meaningful_components = [
                component
                for component in components
                if component.area >= minimum_area
            ]
            if row in movement_rows:
                # Generated grids occasionally let the next row's hat or boots
                # cross a crop boundary. Only movement poses get this filter;
                # attack effects may intentionally extend beyond their cell.
                edge_margin = 1
                main_height = main.bbox[3] - main.bbox[1]
                vertical_gap_limit = max(4, round(main_height * 0.05))

                def belongs_to_pose(component: Component) -> bool:
                    if component == main:
                        return True
                    if (
                        component.bbox[0] <= edge_margin
                        or component.bbox[1] <= edge_margin
                        or component.bbox[2] >= image.width - edge_margin
                        or component.bbox[3] >= image.height - edge_margin
                    ):
                        return False
                    if allow_detached_movement:
                        return True
                    vertical_gap = max(
                        0,
                        main.bbox[1] - component.bbox[3],
                        component.bbox[1] - main.bbox[3],
                    )
                    return vertical_gap <= vertical_gap_limit

                meaningful_components = [
                    component
                    for component in meaningful_components
                    if belongs_to_pose(component)
                ]

            meaningful = [component.bbox for component in meaningful_components]
            clean_alpha = Image.new("L", image.size, 0)
            for box in meaningful:
                clean_alpha.paste(alpha.crop(box), box[:2])
            image.putalpha(clean_alpha)
            row_cells.append(Cell(image, main, union_bbox(meaningful)))
        cells.append(row_cells)

    return cells


def fit_scale(cells: list[list[Cell]], movement_rows: tuple[int, ...], target_height: int) -> float:
    main_heights = [
        cells[row][col].main.bbox[3] - cells[row][col].main.bbox[1]
        for row in movement_rows
        for col in range(COLS)
    ]
    # Size from the character component only. A wide spell flash or slash may
    # clip at the 96px frame edge, but must never shrink every gameplay pose.
    return target_height / median(main_heights)


def normalize_cell(cell: Cell, scale: float) -> Image.Image:
    main_left, _, main_right, main_bottom = cell.main.bbox
    main_center = (main_left + main_right) / 2
    resized = cell.image.resize(
        (max(1, round(cell.image.width * scale)), max(1, round(cell.image.height * scale))),
        Image.Resampling.NEAREST,
    )
    x = round(ANCHOR_X - main_center * scale)
    content_left, _, content_right, _ = cell.meaningful_bbox
    if (content_right - content_left) * scale <= FRAME_SIZE - 4:
        min_x = round(2 - content_left * scale)
        max_x = round(FRAME_SIZE - 2 - content_right * scale)
        x = max(min_x, min(max_x, x))
    # Ground the character component itself. A familiar may intentionally
    # hover lower than the character without lifting the character's feet.
    y = round(ANCHOR_Y - main_bottom * scale)
    frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    frame.alpha_composite(resized, (x, y))
    return frame


def hurt_frame(frame: Image.Image, y_offset: int) -> Image.Image:
    colored = ImageEnhance.Color(frame).enhance(0.7)
    red = Image.new("RGBA", frame.size, (255, 72, 72, 0))
    red.putalpha(frame.getchannel("A").point(lambda value: round(value * 0.22)))
    colored = Image.alpha_composite(colored, red)
    shifted = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    shifted.alpha_composite(colored, (0, y_offset))
    return shifted


def death_frame(frame: Image.Image, step: int) -> Image.Image:
    brightness = (1.0, 0.8, 0.6, 0.42)[step]
    alpha_scale = (1.0, 0.9, 0.68, 0.42)[step]
    faded = ImageEnhance.Brightness(frame).enhance(brightness)
    faded.putalpha(faded.getchannel("A").point(lambda value: round(value * alpha_scale)))
    shifted = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    shifted.alpha_composite(faded, (0, (0, 2, 4, 7)[step]))
    return shifted


def paste_row(sheet: Image.Image, row: int, frames: list[Image.Image]) -> None:
    for col, frame in enumerate(frames):
        sheet.alpha_composite(frame, (col * FRAME_SIZE, row * FRAME_SIZE))


def validate_movement_grounding(
    sheet: Image.Image,
    movement_rows: tuple[int, ...],
    label: str,
    allow_detached: bool = False,
) -> None:
    for row in movement_rows:
        for col in range(COLS):
            frame = sheet.crop(
                (
                    col * FRAME_SIZE,
                    row * FRAME_SIZE,
                    (col + 1) * FRAME_SIZE,
                    (row + 1) * FRAME_SIZE,
                )
            )
            alpha = frame.getchannel("A")
            visible_bbox = alpha.getbbox()
            if visible_bbox is None:
                raise ValueError(f"Empty {label} movement frame ({col}, {row})")
            ground_bottom = visible_bbox[3]
            if allow_detached:
                components = connected_components(alpha)
                ground_bottom = max(components, key=lambda component: component.area).bbox[3]
            if not ANCHOR_Y - 1 <= ground_bottom <= ANCHOR_Y + 1:
                raise ValueError(
                    f"Ungrounded {label} movement frame ({col}, {row}): "
                    f"bottom={ground_bottom}"
                )
            if visible_bbox[0] == 0 or visible_bbox[2] == FRAME_SIZE:
                raise ValueError(f"Clipped {label} movement frame ({col}, {row})")
            if allow_detached:
                continue

            components = connected_components(alpha)
            main = max(components, key=lambda component: component.area)
            minimum_area = max(8, round(main.area * 0.007))
            main_height = main.bbox[3] - main.bbox[1]
            vertical_gap_limit = max(4, round(main_height * 0.05))
            for component in components:
                if component == main or component.area < minimum_area:
                    continue
                vertical_gap = max(
                    0,
                    main.bbox[1] - component.bbox[3],
                    component.bbox[1] - main.bbox[3],
                )
                if vertical_gap > vertical_gap_limit:
                    raise ValueError(
                        f"Detached fragment in {label} movement frame "
                        f"({col}, {row}): bbox={component.bbox}"
                    )


def build_cardinal(cells: list[list[Cell]], target_height: int) -> tuple[Image.Image, float]:
    scale = fit_scale(cells, (0, 2, 4), target_height)
    normalized = [[normalize_cell(cell, scale) for cell in row] for row in cells]
    sheet = Image.new("RGBA", (COLS * FRAME_SIZE, CARDINAL_ROWS * FRAME_SIZE), (0, 0, 0, 0))

    for direction in range(3):
        move = normalized[direction * 2]
        action = normalized[direction * 2 + 1]
        base_row = direction * 6
        idle = [move[0], move[2], move[0], move[2]]
        hurt = [hurt_frame(move[0], 1), hurt_frame(move[2], 2), move[0], move[2]]
        death = [death_frame(move[0], step) for step in range(COLS)]
        paste_row(sheet, base_row, idle)
        paste_row(sheet, base_row + 1, move)
        paste_row(sheet, base_row + 2, action)
        paste_row(sheet, base_row + 3, action)
        paste_row(sheet, base_row + 4, hurt)
        paste_row(sheet, base_row + 5, death)

    return sheet, scale


def build_diagonal(cells: list[list[Cell]], target_height: int) -> tuple[Image.Image, float]:
    scale = fit_scale(cells, (0, 1, 3, 4), target_height)
    sheet = Image.new("RGBA", (COLS * FRAME_SIZE, DIAGONAL_ROWS * FRAME_SIZE), (0, 0, 0, 0))
    for row, source_row in enumerate(cells):
        paste_row(sheet, row, [normalize_cell(cell, scale) for cell in source_row])
    return sheet, scale


def main() -> None:
    global FRAME_SIZE, ANCHOR_X, ANCHOR_Y
    args = parse_args()
    if args.frame_size < 32 or args.frame_size % 2:
        raise ValueError("--frame-size must be an even integer of at least 32")
    FRAME_SIZE = args.frame_size
    ANCHOR_X = FRAME_SIZE // 2
    ANCHOR_Y = round(FRAME_SIZE * 0.875)
    cardinal_cells = split_source(
        args.cardinal_source,
        (0, 2, 4),
        args.allow_detached_movement,
    )
    diagonal_cells = split_source(
        args.diagonal_source,
        (0, 1, 3, 4),
        args.allow_detached_movement,
    )
    cardinal, cardinal_scale = build_cardinal(cardinal_cells, args.target_height)
    diagonal, diagonal_scale = build_diagonal(diagonal_cells, args.target_height)
    validate_movement_grounding(
        cardinal,
        (0, 1, 6, 7, 12, 13),
        "cardinal",
        args.allow_detached_movement,
    )
    validate_movement_grounding(
        diagonal,
        (0, 1, 3, 4),
        "diagonal",
        args.allow_detached_movement,
    )

    args.out_cardinal.parent.mkdir(parents=True, exist_ok=True)
    args.out_diagonal.parent.mkdir(parents=True, exist_ok=True)
    cardinal.save(args.out_cardinal, optimize=True)
    diagonal.save(args.out_diagonal, optimize=True)
    print(
        f"Wrote {args.out_cardinal} {cardinal.size} (scale {cardinal_scale:.3f})\n"
        f"Wrote {args.out_diagonal} {diagonal.size} (scale {diagonal_scale:.3f})"
    )


if __name__ == "__main__":
    main()
