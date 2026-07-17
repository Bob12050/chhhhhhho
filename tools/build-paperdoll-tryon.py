from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "art-source" / "paperdoll"
OUTPUT_DIR = ROOT / "public" / "previews" / "paperdoll-iron"
GAME_OUTPUT_DIR = ROOT / "public" / "assets" / "paperdoll-pilot"

TILE_W = 360
TILE_H = 500
GROUND_Y = 458
DIRECTIONS = ("down", "up", "left", "down-left", "up-left")

GAME_FRAME_W = 96
GAME_FRAME_H = 96
GAME_ANCHOR_X = 48
GAME_ANCHOR_Y = 84
GAME_SOURCE_ANCHOR_X = 180
GAME_SOURCE_ANCHOR_Y = 435
GAME_SCALE = 0.18
GAME_MAX_FRAMES = 4
GAME_CARDINAL_DIRECTIONS = ("down", "up", "left")
GAME_DIAGONAL_DIRECTIONS = ("down-left", "up-left")
GAME_ANIMATIONS = ("idle", "walk", "attack", "cast", "hurt", "death")
GAME_DIAGONAL_ANIMATIONS = ("idle", "walk", "attack")

SOURCE_FILES = {
    "base": "player_base-turnaround-v1.png",
    "armed": "iron-equipped-turnaround-preview-v1.png",
    "armor": "iron-weaponless-turnaround-v1.png",
}

ARMOR_LAYERS = ("head", "torso", "hands", "feet")
WEAPON_LAYERS = ("sword", "shield")

LAYER_FILES = {
    "base": "base-atlas-v1.png",
    "head": "head-atlas-v1.png",
    "torso": "torso-atlas-v1.png",
    "hands": "hands-atlas-v1.png",
    "feet": "feet-atlas-v1.png",
    "sword": "sword-atlas-v1.png",
    "shield": "shield-atlas-v1.png",
}

GAME_LAYER_STEMS = {
    "base": "base",
    "head": "helm-iron",
    "torso": "torso-iron",
    "hands": "hands-iron",
    "feet": "feet-iron",
    "sword": "sword-iron",
    "shield": "shield-iron",
}


def blank_tile() -> Image.Image:
    return Image.new("RGBA", (TILE_W, TILE_H), (0, 0, 0, 0))


def remove_connected_checker(image: Image.Image) -> Image.Image:
    """Remove only near-white source background connected to an outer edge."""
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


def remove_dark_navy(image: Image.Image) -> Image.Image:
    """Flood away the generated preview backdrop while preserving dark outlines."""
    image = image.convert("RGBA")
    width, height = image.size
    pixels = image.load()
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def is_background(x: int, y: int) -> bool:
        red, green, blue, _ = pixels[x, y]
        return red < 75 and green < 85 and blue < 115 and blue >= green + 6 and green >= red + 5

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


def keep_largest_component(image: Image.Image) -> Image.Image:
    """Discard disconnected fragments that leaked in from adjacent views."""
    alpha = image.getchannel("A")
    pixels = alpha.load()
    visited = bytearray(image.width * image.height)
    largest: list[tuple[int, int]] = []

    for start_y in range(image.height):
        for start_x in range(image.width):
            index = start_y * image.width + start_x
            if visited[index] or pixels[start_x, start_y] < 8:
                continue
            visited[index] = 1
            queue: deque[tuple[int, int]] = deque([(start_x, start_y)])
            component: list[tuple[int, int]] = []
            while queue:
                x, y = queue.popleft()
                component.append((x, y))
                for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if not (0 <= next_x < image.width and 0 <= next_y < image.height):
                        continue
                    next_index = next_y * image.width + next_x
                    if visited[next_index] or pixels[next_x, next_y] < 8:
                        continue
                    visited[next_index] = 1
                    queue.append((next_x, next_y))
            if len(component) > len(largest):
                largest = component

    keep = Image.new("L", image.size, 0)
    keep_pixels = keep.load()
    for x, y in largest:
        keep_pixels[x, y] = 255
    keep = keep.filter(ImageFilter.MaxFilter(3))
    output = image.copy()
    output.putalpha(ImageChops.multiply(alpha, keep))
    return output


def load_views(filename: str, *, dark_background: bool = False) -> dict[str, Image.Image]:
    source = Image.open(SOURCE_DIR / filename)
    source = remove_dark_navy(source) if dark_background else remove_connected_checker(source)
    slice_width = source.width / len(DIRECTIONS)
    views: dict[str, Image.Image] = {}
    for index, direction in enumerate(DIRECTIONS):
        left = round(index * slice_width)
        right = round((index + 1) * slice_width)
        views[direction] = crop_subject(source.crop((left, 0, right, source.height)))
    return views


def fit(image: Image.Image, max_width: int, max_height: int) -> Image.Image:
    scale = min(max_width / image.width, max_height / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.resize(size, Image.Resampling.LANCZOS)


def place(
    image: Image.Image,
    center_x: int,
    *,
    top: int | None = None,
    bottom: int | None = None,
) -> Image.Image:
    tile = blank_tile()
    x = round(center_x - image.width / 2)
    if top is not None:
        y = top
    elif bottom is not None:
        y = bottom - image.height
    else:
        raise ValueError("top or bottom is required")
    tile.alpha_composite(image, (x, y))
    return tile


def mask_from_polygons(polygons: list[list[tuple[int, int]]]) -> Image.Image:
    mask = Image.new("L", (TILE_W, TILE_H), 0)
    draw = ImageDraw.Draw(mask)
    for polygon in polygons:
        draw.polygon(polygon, fill=255)
    return mask


def layer_shapes(direction: str) -> dict[str, list[list[tuple[int, int]]]]:
    common_head = [[(82, 18), (278, 18), (282, 165), (246, 218), (114, 218), (78, 165)]]
    common_torso = [[(72, 180), (288, 180), (298, 356), (62, 356)]]
    common_hands = [
        [(70, 210), (135, 210), (142, 354), (64, 354)],
        [(225, 210), (292, 210), (296, 354), (218, 354)],
    ]
    common_feet = [[(88, 334), (272, 334), (276, 434), (84, 434)]]

    if direction == "down":
        return {
            "head": common_head,
            "torso": common_torso,
            "hands": common_hands,
            "feet": common_feet,
            "sword": [
                [(28, 432), (52, 442), (116, 338), (90, 318)],
                [(70, 286), (132, 286), (132, 366), (68, 366)],
            ],
            "shield": [[(228, 246), (326, 242), (350, 315), (316, 407), (252, 396), (222, 300)]],
        }
    if direction == "up":
        return {
            "head": common_head,
            "torso": common_torso,
            "hands": common_hands,
            "feet": common_feet,
            "sword": [
                [(258, 292), (286, 280), (350, 418), (324, 442)],
                [(252, 280), (326, 280), (334, 366), (260, 368)],
            ],
            "shield": [[(28, 252), (108, 240), (132, 315), (100, 410), (42, 400), (22, 310)]],
        }
    if direction == "left":
        return {
            "head": [[(92, 26), (258, 28), (270, 166), (236, 218), (112, 218), (86, 160)]],
            "torso": [[(94, 184), (262, 184), (274, 360), (86, 360)]],
            "hands": [[(86, 214), (158, 214), (166, 354), (78, 354)]],
            "feet": [[(106, 338), (260, 338), (266, 434), (100, 434)]],
            "sword": [[(48, 426), (72, 442), (172, 338), (148, 306)]],
            "shield": [[(126, 244), (202, 238), (232, 278), (224, 378), (184, 412), (130, 382), (120, 296)]],
        }
    if direction == "down-left":
        return {
            "head": [[(78, 18), (276, 18), (284, 166), (246, 220), (110, 220), (72, 164)]],
            "torso": common_torso,
            "hands": common_hands,
            "feet": common_feet,
            "sword": [
                [(12, 420), (40, 444), (116, 340), (92, 314)],
                [(34, 286), (112, 286), (118, 366), (36, 366)],
            ],
            "shield": [[(190, 244), (260, 238), (288, 278), (280, 376), (238, 410), (194, 382), (182, 298)]],
        }
    return {
        "head": [[(80, 14), (286, 14), (290, 176), (252, 224), (108, 224), (74, 168)]],
        "torso": common_torso,
        "hands": common_hands,
        "feet": common_feet,
        "sword": [
            [(228, 300), (260, 282), (338, 416), (316, 442)],
            [(218, 284), (288, 282), (300, 368), (226, 374)],
        ],
        "shield": [[(14, 250), (104, 242), (128, 314), (100, 406), (34, 398), (8, 302)]],
    }


def extract_with_mask(image: Image.Image, mask: Image.Image) -> Image.Image:
    output = image.copy()
    output.putalpha(ImageChops.multiply(image.getchannel("A"), mask))
    return output


def mask_to_rgba(mask: Image.Image) -> Image.Image:
    output = Image.new("RGBA", mask.size, (255, 255, 255, 0))
    output.putalpha(mask)
    return output


def assign_remaining_pixels(
    reference_alpha: Image.Image,
    masks: dict[str, Image.Image],
    priority: tuple[str, ...],
) -> None:
    """Give every visible master pixel to its nearest equipment layer."""
    owner = [-1] * (TILE_W * TILE_H)
    queue: deque[tuple[int, int]] = deque()
    mask_pixels = {layer: masks[layer].load() for layer in priority}

    for owner_index, layer in enumerate(priority):
        pixels = mask_pixels[layer]
        for y in range(TILE_H):
            row = y * TILE_W
            for x in range(TILE_W):
                index = row + x
                if owner[index] < 0 and pixels[x, y] > 0:
                    owner[index] = owner_index
                    queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        source_owner = owner[y * TILE_W + x]
        for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if not (0 <= next_x < TILE_W and 0 <= next_y < TILE_H):
                continue
            index = next_y * TILE_W + next_x
            if owner[index] >= 0:
                continue
            owner[index] = source_owner
            queue.append((next_x, next_y))

    alpha_pixels = reference_alpha.load()
    for y in range(TILE_H):
        row = y * TILE_W
        for x in range(TILE_W):
            if alpha_pixels[x, y] == 0:
                continue
            layer_index = owner[row + x]
            if layer_index >= 0:
                mask_pixels[priority[layer_index]][x, y] = 255


def normalized_master_views() -> tuple[dict[str, Image.Image], dict[str, Image.Image]]:
    armed_source = remove_dark_navy(Image.open(SOURCE_DIR / SOURCE_FILES["armed"]))
    armor_source = remove_dark_navy(Image.open(SOURCE_DIR / SOURCE_FILES["armor"]))
    if armed_source.size != armor_source.size:
        raise ValueError("armed and weaponless masters must share one canvas")

    slice_width = armed_source.width / len(DIRECTIONS)
    armor_views: dict[str, Image.Image] = {}
    armed_views: dict[str, Image.Image] = {}
    for index, direction in enumerate(DIRECTIONS):
        left = round(index * slice_width)
        right = round((index + 1) * slice_width)
        armed = keep_largest_component(armed_source.crop((left, 0, right, armed_source.height)))
        armor = keep_largest_component(armor_source.crop((left, 0, right, armor_source.height)))
        armed_bbox = armed.getchannel("A").getbbox()
        armor_bbox = armor.getchannel("A").getbbox()
        if armed_bbox is None or armor_bbox is None:
            raise ValueError(f"master view {direction} has no visible pixels")
        bbox = (
            min(armed_bbox[0], armor_bbox[0]),
            min(armed_bbox[1], armor_bbox[1]),
            max(armed_bbox[2], armor_bbox[2]),
            max(armed_bbox[3], armor_bbox[3]),
        )
        armed = armed.crop(bbox)
        armor = armor.crop(bbox)
        scale = min(324 / armed.width, 430 / armed.height)
        size = (round(armed.width * scale), round(armed.height * scale))

        for source, destination in ((armed, armed_views), (armor, armor_views)):
            fitted = source.resize(size, Image.Resampling.LANCZOS)
            tile = place(fitted, 180, bottom=GROUND_Y)
            alpha = tile.getchannel("A")
            alpha.paste(0, (0, 435, TILE_W, TILE_H))
            tile.putalpha(alpha)
            destination[direction] = tile

    return armor_views, armed_views


def build_layers(
    base_views: dict[str, Image.Image],
    armor_views: dict[str, Image.Image],
    armed_views: dict[str, Image.Image],
) -> tuple[
    dict[str, dict[str, Image.Image]],
    dict[str, dict[str, Image.Image]],
]:
    layers = {name: {} for name in LAYER_FILES}
    mask_views = {name: {} for name in ARMOR_LAYERS}
    priority = ("head", "hands", "feet", "torso")

    for direction in DIRECTIONS:
        armor = armor_views[direction]
        armed = armed_views[direction]
        base = fit(base_views[direction], 196, 424)
        base_tile = place(base, 180, bottom=GROUND_Y)
        base_tile.putalpha(ImageChops.multiply(base_tile.getchannel("A"), armor.getchannel("A")))

        shapes = layer_shapes(direction)
        raw_masks = {layer: mask_from_polygons(shapes[layer]) for layer in ARMOR_LAYERS}
        occupied = Image.new("L", (TILE_W, TILE_H), 0)
        direction_masks: dict[str, Image.Image] = {}
        for layer in priority:
            mask = ImageChops.subtract(raw_masks[layer], occupied)
            direction_masks[layer] = mask
            occupied = ImageChops.lighter(occupied, mask)

        assign_remaining_pixels(armor.getchannel("A"), direction_masks, priority)

        layers["base"][direction] = base_tile
        for layer in priority:
            layers[layer][direction] = extract_with_mask(armor, direction_masks[layer])
            mask_views[layer][direction] = mask_to_rgba(direction_masks[layer])
        for layer in WEAPON_LAYERS:
            weapon_mask = mask_from_polygons(shapes[layer])
            layers[layer][direction] = extract_with_mask(armed, weapon_mask)

    return layers, mask_views


def write_atlas(views: dict[str, Image.Image], destination: Path) -> None:
    atlas = Image.new("RGBA", (TILE_W * len(DIRECTIONS), TILE_H), (0, 0, 0, 0))
    for index, direction in enumerate(DIRECTIONS):
        atlas.alpha_composite(views[direction], (index * TILE_W, 0))
    destination.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(destination, optimize=True)


def game_frame(view: Image.Image) -> Image.Image:
    """Scale one aligned try-on tile onto the game's 96px feet anchor."""
    size = (round(TILE_W * GAME_SCALE), round(TILE_H * GAME_SCALE))
    scaled = view.resize(size, Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", (GAME_FRAME_W, GAME_FRAME_H), (0, 0, 0, 0))
    x = round(GAME_ANCHOR_X - GAME_SOURCE_ANCHOR_X * GAME_SCALE)
    y = round(GAME_ANCHOR_Y - GAME_SOURCE_ANCHOR_Y * GAME_SCALE)
    frame.alpha_composite(scaled, (x, y))
    return frame


def write_static_pose_sheet(
    views: dict[str, Image.Image],
    directions: tuple[str, ...],
    animations: tuple[str, ...],
    destination: Path,
) -> None:
    """Duplicate each grounded pose across animation frames for the first pilot."""
    sheet = Image.new(
        "RGBA",
        (GAME_FRAME_W * GAME_MAX_FRAMES, GAME_FRAME_H * len(directions) * len(animations)),
        (0, 0, 0, 0),
    )
    for direction_index, direction in enumerate(directions):
        frame = game_frame(views[direction])
        for animation_index, _animation in enumerate(animations):
            row = direction_index * len(animations) + animation_index
            for column in range(GAME_MAX_FRAMES):
                sheet.alpha_composite(frame, (column * GAME_FRAME_W, row * GAME_FRAME_H))
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, optimize=True)


def write_game_sheets(layers: dict[str, dict[str, Image.Image]]) -> int:
    for layer, stem in GAME_LAYER_STEMS.items():
        write_static_pose_sheet(
            layers[layer],
            GAME_CARDINAL_DIRECTIONS,
            GAME_ANIMATIONS,
            GAME_OUTPUT_DIR / f"{stem}-cardinal-v2.png",
        )
        write_static_pose_sheet(
            layers[layer],
            GAME_DIAGONAL_DIRECTIONS,
            GAME_DIAGONAL_ANIMATIONS,
            GAME_OUTPUT_DIR / f"{stem}-diagonal-v2.png",
        )
    return len(GAME_LAYER_STEMS) * 2


def main() -> None:
    base_views = load_views(SOURCE_FILES["base"])
    armor_views, armed_views = normalized_master_views()
    layers, masks = build_layers(base_views, armor_views, armed_views)

    for layer, filename in LAYER_FILES.items():
        write_atlas(layers[layer], OUTPUT_DIR / filename)
    for layer, views in masks.items():
        write_atlas(views, OUTPUT_DIR / f"mask-{layer}-atlas-v1.png")

    composite: dict[str, Image.Image] = {}
    for direction in DIRECTIONS:
        tile = layers["base"][direction].copy()
        for layer in ARMOR_LAYERS:
            alpha = ImageChops.multiply(
                tile.getchannel("A"),
                ImageChops.invert(masks[layer][direction].getchannel("A")),
            )
            tile.putalpha(alpha)
            tile.alpha_composite(layers[layer][direction])
        for layer in WEAPON_LAYERS:
            tile.alpha_composite(layers[layer][direction])
        composite[direction] = tile
    write_atlas(composite, OUTPUT_DIR / "composite-atlas-v1.png")
    write_atlas(composite, OUTPUT_DIR / "reference-atlas-v1.png")
    write_atlas(armor_views, OUTPUT_DIR / "armor-reference-atlas-v1.png")
    game_sheet_count = write_game_sheets(layers)
    print(
        f"Wrote {len(LAYER_FILES) + len(masks) + 3} try-on atlases to {OUTPUT_DIR} "
        f"and {game_sheet_count} game sheets to {GAME_OUTPUT_DIR}"
    )


if __name__ == "__main__":
    main()
