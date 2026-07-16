from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "art-source" / "paperdoll"
OUTPUT_DIR = ROOT / "public" / "assets" / "paperdoll-pilot"
PREVIEW_PATH = ROOT / "tmp" / "paperdoll-pilot-preview.png"

FRAME = 96
ANCHOR_X = 48
ANCHOR_Y = 84
MAX_FRAMES = 4

DIRECTIONS = ("down", "up", "left", "down-left", "up-left")
CARDINAL_DIRECTIONS = DIRECTIONS[:3]
DIAGONAL_DIRECTIONS = DIRECTIONS[3:]
ANIMATIONS = (
    ("idle", 2),
    ("walk", 4),
    ("attack", 4),
    ("cast", 4),
    ("hurt", 2),
    ("death", 4),
)
DIAGONAL_ANIMATIONS = ANIMATIONS[:3]

SOURCE_FILES = {
    "base": "player_base-turnaround-v1.png",
    "head": "helm_iron-turnaround-v1.png",
    "torso": "plate_iron-turnaround-v1.png",
    "hands": "gauntlets_iron-turnaround-v1.png",
    "feet": "boots_iron-turnaround-v1.png",
    "near_weapon": "sword_iron-turnaround-v1.png",
    "far_weapon": "shield_iron-turnaround-v1.png",
}

OUTPUT_STEMS = {
    "base": "base",
    "head": "helm-iron",
    "torso": "torso-iron",
    "far_hand": "hand-far-iron",
    "near_hand": "hand-near-iron",
    "feet": "feet-iron",
    "near_weapon": "sword-iron",
    "far_weapon": "shield-iron",
}

TARGET_BOXES = {
    "base": (36, 60),
    "head": (34, 38),
    "torso": (39, 34),
    "hands": (40, 25),
    "feet": (31, 22),
    "near_weapon": (20, 39),
    "far_weapon": (29, 37),
}


def transparent_frame() -> Image.Image:
    return Image.new("RGBA", (FRAME, FRAME), (0, 0, 0, 0))


def remove_connected_checker(image: Image.Image) -> Image.Image:
    """Remove only near-white background pixels connected to the outer edge."""
    image = image.convert("RGBA")
    if image.getchannel("A").getextrema()[0] < 255:
        return image

    width, height = image.size
    pixels = image.load()
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def is_background(x: int, y: int) -> bool:
        red, green, blue, _ = pixels[x, y]
        return min(red, green, blue) >= 235 and max(red, green, blue) - min(red, green, blue) <= 10

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if visited[index] or not is_background(x, y):
            return
        visited[index] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        pixels[x, y] = (0, 0, 0, 0)
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    return image


def crop_subject(image: Image.Image) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("source view has no visible pixels")
    return image.crop(bbox)


def load_views(filename: str) -> dict[str, Image.Image]:
    source = remove_connected_checker(Image.open(SOURCE_DIR / filename))
    slice_width = source.width / len(DIRECTIONS)
    views: dict[str, Image.Image] = {}
    for index, direction in enumerate(DIRECTIONS):
        left = round(index * slice_width)
        right = round((index + 1) * slice_width)
        views[direction] = crop_subject(source.crop((left, 0, right, source.height)))
    return views


def fit(image: Image.Image, max_width: int, max_height: int) -> Image.Image:
    scale = min(max_width / image.width, max_height / image.height)
    width = max(1, round(image.width * scale))
    height = max(1, round(image.height * scale))
    return image.resize((width, height), Image.Resampling.LANCZOS)


def place(image: Image.Image, center_x: int, *, top: int | None = None, bottom: int | None = None) -> Image.Image:
    frame = transparent_frame()
    x = round(center_x - image.width / 2)
    if top is not None:
        y = top
    elif bottom is not None:
        y = bottom - image.height
    else:
        raise ValueError("top or bottom is required")
    frame.alpha_composite(image, (x, y))
    return frame


def clear_ellipse(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    alpha = image.getchannel("A")
    ImageDraw.Draw(alpha).ellipse(box, fill=0)
    output = image.copy()
    output.putalpha(alpha)
    return output


def alpha_components(image: Image.Image, min_area: int = 8) -> list[tuple[int, int, int, int]]:
    alpha = image.getchannel("A")
    width, height = image.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    components: list[tuple[int, tuple[int, int, int, int]]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] < 16:
                continue
            visited[index] = 1
            stack = [(x, y)]
            count = 0
            min_x = max_x = x
            min_y = max_y = y
            while stack:
                px, py = stack.pop()
                count += 1
                min_x = min(min_x, px)
                max_x = max(max_x, px)
                min_y = min(min_y, py)
                max_y = max(max_y, py)
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if not (0 <= nx < width and 0 <= ny < height):
                        continue
                    next_index = ny * width + nx
                    if visited[next_index] or pixels[nx, ny] < 16:
                        continue
                    visited[next_index] = 1
                    stack.append((nx, ny))
            if count >= min_area:
                components.append((count, (min_x, min_y, max_x + 1, max_y + 1)))

    components.sort(reverse=True)
    return [bbox for _, bbox in components]


def isolate_component(image: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    isolated = transparent_frame()
    isolated.alpha_composite(image.crop(bbox), (bbox[0], bbox[1]))
    return isolated


def translate(image: Image.Image, dx: int, dy: int) -> Image.Image:
    moved = transparent_frame()
    moved.alpha_composite(image, (dx, dy))
    return moved


def animate_pair_walk(image: Image.Image, frame_index: int) -> Image.Image:
    if frame_index not in (1, 3):
        return image.copy()
    components = alpha_components(image, min_area=18)
    if len(components) < 2:
        return image.copy()
    pair = sorted(components[:2], key=lambda bbox: bbox[0])
    moving_index = 0 if frame_index == 1 else 1
    output = transparent_frame()
    for index, bbox in enumerate(pair):
        part = image.crop(bbox)
        lift = -2 if index == moving_index else 0
        output.alpha_composite(part, (bbox[0], bbox[1] + lift))
    return output


def animate_base_walk(image: Image.Image, frame_index: int) -> Image.Image:
    if frame_index not in (1, 3):
        return image.copy()
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        return image.copy()
    left, top, right, bottom = bbox
    split_x = (left + right) // 2
    cut_y = top + round((bottom - top) * 0.73)
    region = (left, cut_y, split_x, bottom) if frame_index == 1 else (split_x, cut_y, right, bottom)
    output = image.copy()
    clear = Image.new("RGBA", (region[2] - region[0], region[3] - region[1]), (0, 0, 0, 0))
    output.paste(clear, (region[0], region[1]))
    output.alpha_composite(image.crop(region), (region[0], region[1] - 1))
    return output


def movement_offset(direction: str, amount: int) -> tuple[int, int]:
    vectors = {
        "down": (0, 1),
        "up": (0, -1),
        "left": (-1, 0),
        "down-left": (-1, 1),
        "up-left": (-1, -1),
    }
    vx, vy = vectors[direction]
    return vx * amount, vy * amount


def animated_frame(layer: str, direction: str, animation: str, frame_index: int, static: Image.Image) -> Image.Image:
    if animation == "walk":
        if layer == "base":
            return animate_base_walk(static, frame_index)
        if layer == "feet":
            return animate_pair_walk(static, frame_index)
        if layer in ("near_hand", "near_weapon"):
            return translate(static, 0, -1 if frame_index == 1 else 0)
        if layer in ("far_hand", "far_weapon"):
            return translate(static, 0, -1 if frame_index == 3 else 0)
        return static.copy()
    if animation == "attack":
        amount = (0, 1, 2, 0)[frame_index]
        dx, dy = movement_offset(direction, amount)
        if layer == "near_weapon":
            dx *= 2
            dy *= 2
        return translate(static, dx, dy)
    if animation == "cast":
        return translate(static, 0, -1 if frame_index in (1, 2) else 0)
    if animation == "hurt":
        dx, dy = movement_offset(direction, -1 if frame_index == 0 else 0)
        return translate(static, dx, dy)
    if animation == "death":
        return translate(static, 0, min(frame_index, 2))
    return static.copy()


def hand_layers(view: Image.Image, direction: str) -> tuple[Image.Image, Image.Image]:
    resized = fit(view, *TARGET_BOXES["hands"])
    pair = place(resized, 48, top=50)
    components = alpha_components(pair, min_area=18)
    if len(components) < 2:
        return transparent_frame(), pair
    pair_boxes = sorted(components[:2], key=lambda bbox: bbox[0])
    near_is_left = direction != "up"
    near_bbox = pair_boxes[0 if near_is_left else 1]
    far_bbox = pair_boxes[1 if near_is_left else 0]
    return isolate_component(pair, far_bbox), isolate_component(pair, near_bbox)


def build_static_layers(sources: dict[str, dict[str, Image.Image]]) -> dict[str, dict[str, Image.Image]]:
    layers = {layer: {} for layer in OUTPUT_STEMS}
    sword_centers = {"down": 29, "up": 65, "left": 28, "down-left": 29, "up-left": 29}
    shield_centers = {"down": 67, "up": 30, "left": 63, "down-left": 65, "up-left": 65}
    head_centers = {"down": 48, "up": 48, "left": 46, "down-left": 47, "up-left": 47}

    for direction in DIRECTIONS:
        base = fit(sources["base"][direction], *TARGET_BOXES["base"])
        layers["base"][direction] = place(base, 48, bottom=ANCHOR_Y)

        head = fit(sources["head"][direction], *TARGET_BOXES["head"])
        head_frame = place(head, head_centers[direction], top=20)
        face_openings = {
            "down": (36, 36, 60, 54),
            "left": (34, 36, 51, 54),
            "down-left": (34, 36, 58, 54),
            "up-left": (34, 37, 50, 53),
        }
        if direction in face_openings:
            head_frame = clear_ellipse(head_frame, face_openings[direction])
        layers["head"][direction] = head_frame

        torso = fit(sources["torso"][direction], *TARGET_BOXES["torso"])
        torso_frame = place(torso, 48, top=48)
        neck_openings = {
            "down": (43, 47, 53, 54),
            "up": (43, 47, 53, 54),
            "left": (43, 47, 51, 55),
            "down-left": (42, 47, 53, 55),
            "up-left": (42, 47, 52, 55),
        }
        layers["torso"][direction] = clear_ellipse(torso_frame, neck_openings[direction])

        far_hand, near_hand = hand_layers(sources["hands"][direction], direction)
        layers["far_hand"][direction] = far_hand
        layers["near_hand"][direction] = near_hand

        feet = fit(sources["feet"][direction], *TARGET_BOXES["feet"])
        layers["feet"][direction] = place(feet, 48, bottom=ANCHOR_Y)

        sword = fit(sources["near_weapon"][direction], *TARGET_BOXES["near_weapon"])
        layers["near_weapon"][direction] = place(sword, sword_centers[direction], bottom=83)

        shield = fit(sources["far_weapon"][direction], *TARGET_BOXES["far_weapon"])
        layers["far_weapon"][direction] = place(shield, shield_centers[direction], bottom=81)

    return layers


def write_sheet(
    layer: str,
    directions: tuple[str, ...],
    animations: tuple[tuple[str, int], ...],
    static_layers: dict[str, dict[str, Image.Image]],
    destination: Path,
) -> None:
    sheet = Image.new("RGBA", (FRAME * MAX_FRAMES, FRAME * len(directions) * len(animations)), (0, 0, 0, 0))
    for direction_index, direction in enumerate(directions):
        for animation_index, (animation, frame_count) in enumerate(animations):
            row = direction_index * len(animations) + animation_index
            for frame_index in range(MAX_FRAMES):
                active_frame = min(frame_index, frame_count - 1)
                frame = animated_frame(layer, direction, animation, active_frame, static_layers[layer][direction])
                sheet.alpha_composite(frame, (frame_index * FRAME, row * FRAME))
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, optimize=True)


def composite_frame(
    static_layers: dict[str, dict[str, Image.Image]], direction: str, animation: str, frame_index: int
) -> Image.Image:
    if direction in ("up", "up-left"):
        order = ("far_weapon", "near_weapon", "far_hand", "near_hand", "base", "feet", "torso", "head")
    else:
        order = ("base", "feet", "torso", "far_hand", "far_weapon", "head", "near_hand", "near_weapon")
    frame = transparent_frame()
    for layer in order:
        frame.alpha_composite(animated_frame(layer, direction, animation, frame_index, static_layers[layer][direction]))
    return frame


def write_preview(static_layers: dict[str, dict[str, Image.Image]]) -> None:
    background = (37, 48, 54, 255)
    preview = Image.new("RGBA", (FRAME * len(DIRECTIONS), FRAME * 4), background)
    for direction_index, direction in enumerate(DIRECTIONS):
        for frame_index in range(4):
            preview.alpha_composite(
                composite_frame(static_layers, direction, "walk", frame_index),
                (direction_index * FRAME, frame_index * FRAME),
            )
    PREVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)
    preview.resize((preview.width * 2, preview.height * 2), Image.Resampling.NEAREST).save(PREVIEW_PATH)


def main() -> None:
    sources = {name: load_views(filename) for name, filename in SOURCE_FILES.items()}
    static_layers = build_static_layers(sources)

    for layer, stem in OUTPUT_STEMS.items():
        write_sheet(
            layer,
            CARDINAL_DIRECTIONS,
            ANIMATIONS,
            static_layers,
            OUTPUT_DIR / f"{stem}-cardinal-v1.png",
        )
        write_sheet(
            layer,
            DIAGONAL_DIRECTIONS,
            DIAGONAL_ANIMATIONS,
            static_layers,
            OUTPUT_DIR / f"{stem}-diagonal-v1.png",
        )

    write_preview(static_layers)
    print(f"Wrote {len(OUTPUT_STEMS) * 2} sheets to {OUTPUT_DIR}")
    print(f"Wrote preview to {PREVIEW_PATH}")


if __name__ == "__main__":
    main()
