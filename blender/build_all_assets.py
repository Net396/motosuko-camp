"""
Master Blender 5.3 Asset Pipeline for Motosuko Solo Camping Simulator.
Run headless via:
  D:/Blender/blender-5.3.0-windows-x64/blender.exe --background --python blender/build_all_assets.py
"""
import os
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
OUT_DIR = os.path.join(PROJECT_DIR, "public", "models")

if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from generators.pbr_textures import generate_all_materials
from generators.terrain_fuji import build_campsite_terrain, build_mt_fuji_backdrop
from generators.camp_structures import (
    build_canvas_tent, build_camp_table, build_kermit_chair, build_hurricane_lantern, build_camp_extras
)
from generators.fire_and_wood import (
    build_firepit_snowpeak, build_chopping_block, build_hatchet, build_firewood_assets
)
from generators.cooking_gear import (
    build_castiron_skillet, build_wagyu_steak, build_camp_pot,
    build_gooseneck_kettle, build_coffee_dripper_set, build_titanium_mug,
    build_cutting_board_and_jug
)
from generators.nature_assets import (
    build_japanese_cedar, build_japanese_maples, build_basalt_rock, build_pampas_grass, build_autumn_shrubs
)
from generators.ground_details import (
    build_3d_gravel_cluster, build_3d_moss_mound, build_3d_curled_maple_leaf,
    build_3d_grass_tuft, build_3d_fern_clump, build_3d_forest_debris, build_3d_driftwood
)


def main():
    t0 = time.time()
    os.makedirs(OUT_DIR, exist_ok=True)
    print("=" * 64)
    print("  MOTOSUKO CAMP - BLENDER 5.3 PROCEDURAL PBR ASSET PIPELINE")
    print("=" * 64)

    print("[1/6] Synthesizing PBR Texture Maps & Principled BSDF Materials...")
    mats = generate_all_materials()
    print(f"  Created {len(mats)} PBR materials with embedded PNG maps.")

    print("[2/6] Building Lake Motosuko Shoreline & Mt. Fuji Backdrop...")
    build_campsite_terrain(mats, OUT_DIR)
    build_mt_fuji_backdrop(OUT_DIR)

    print("[3/6] Building Japanese Camp Structures (Tent, Table, Kermit Chair, Lantern, Extras)...")
    build_canvas_tent(mats, OUT_DIR)
    build_camp_table(mats, OUT_DIR)
    build_kermit_chair(mats, OUT_DIR)
    build_hurricane_lantern(mats, OUT_DIR)
    build_camp_extras(mats, OUT_DIR)

    print("[4/6] Building Fire Pit, Chopping Block, Hatchet & Hinoki Firewood...")
    build_firepit_snowpeak(mats, OUT_DIR)
    build_chopping_block(mats, OUT_DIR)
    build_hatchet(mats, OUT_DIR)
    build_firewood_assets(mats, OUT_DIR)

    print("[5/6] Building Camp Cooking & Pour-Over Coffee Gear...")
    build_castiron_skillet(mats, OUT_DIR)
    build_wagyu_steak(mats, OUT_DIR)
    build_camp_pot(mats, OUT_DIR)
    build_gooseneck_kettle(mats, OUT_DIR)
    build_coffee_dripper_set(mats, OUT_DIR)
    build_titanium_mug(mats, OUT_DIR)
    build_cutting_board_and_jug(mats, OUT_DIR)

    print("[6/7] Building Nature Assets (Cedar, Autumn Maples, Shrubs, Basalt Rocks, Susuki Grass)...")
    build_japanese_cedar(mats, OUT_DIR)
    build_japanese_maples(mats, OUT_DIR)
    build_basalt_rock(mats, OUT_DIR)
    build_pampas_grass(mats, OUT_DIR)
    build_autumn_shrubs(mats, OUT_DIR)

    print("[7/7] Building True 3D Ground Cover Models (Gravel Clusters, Moss Mounds, 3D Curled Leaves, Grass, Ferns, Twigs, Driftwood)...")
    build_3d_gravel_cluster(mats, OUT_DIR)
    build_3d_moss_mound(mats, OUT_DIR)
    build_3d_curled_maple_leaf(mats, OUT_DIR)
    build_3d_grass_tuft(mats, OUT_DIR)
    build_3d_fern_clump(mats, OUT_DIR)
    build_3d_forest_debris(mats, OUT_DIR)
    build_3d_driftwood(mats, OUT_DIR)

    dt = time.time() - t0
    print("=" * 64)
    print(f"  ALL BLENDER GLB ASSETS EXPORTED SUCCESSFULLY IN {dt:.1f}s -> {OUT_DIR}")
    print("=" * 64)


if __name__ == "__main__":
    main()
