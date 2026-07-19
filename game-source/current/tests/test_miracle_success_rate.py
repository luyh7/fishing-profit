"""?????????????? n=24/25/26 ??????????

??????????????

????????? mod 1e7 ????????
  P ? 1 - exp(-(2^n - 1) / 10_000_000)
  n=24 ? ~81%, n=25 ? ~96.5%, n=26 ? ~99.9%

?????
  .venv/Scripts/python.exe zhenxun/plugins/zhenxun_plugin_fishing/tests/test_miracle_success_rate.py --trials 2000
"""

from __future__ import annotations

import argparse
import importlib.util
import random
import sys
import time
from pathlib import Path

import pytest


def _load_starry_system_from_file():
    """Load starry_system.py by path (no nonebot plugin package import)."""
    root = Path(__file__).resolve().parents[1]
    starry_path = root / "core" / "starry_system.py"
    src = starry_path.read_text(encoding="utf-8")
    src = src.replace(
        "from ..constants import STARRY_FISH_DROP_RATE",
        "STARRY_FISH_DROP_RATE = 0.01",
    )
    module_name = "zhenxun_plugin_fishing_starry_standalone"
    if module_name in sys.modules:
        mod = sys.modules[module_name]
    else:
        from types import ModuleType

        mod = ModuleType(module_name)
        mod.__file__ = str(starry_path)
        sys.modules[module_name] = mod
        exec(compile(src, str(starry_path), "exec"), mod.__dict__)
    return {
        "MIRACLE_MAX_EXACT_N": mod.MIRACLE_MAX_EXACT_N,
        "MIRACLE_MOD_BASE": mod.MIRACLE_MOD_BASE,
        "MIRACLE_TARGET": mod.MIRACLE_TARGET,
        "find_miracle_subset": mod.find_miracle_subset,
    }


def _load_starry_system():
    """Prefer package import under pytest stubs; fall back to file load."""
    try:
        from zhenxun.plugins.zhenxun_plugin_fishing.core.starry_system import (
            MIRACLE_MAX_EXACT_N,
            MIRACLE_MOD_BASE,
            MIRACLE_TARGET,
            find_miracle_subset,
        )

        return {
            "MIRACLE_MAX_EXACT_N": MIRACLE_MAX_EXACT_N,
            "MIRACLE_MOD_BASE": MIRACLE_MOD_BASE,
            "MIRACLE_TARGET": MIRACLE_TARGET,
            "find_miracle_subset": find_miracle_subset,
        }
    except Exception:
        return _load_starry_system_from_file()


# pytest 收集时优先使用已安装轻量桩的包导入；独立 CLI 才回退到文件加载。
_STARRY = _load_starry_system()
MIRACLE_MAX_EXACT_N = _STARRY["MIRACLE_MAX_EXACT_N"]
MIRACLE_MOD_BASE = _STARRY["MIRACLE_MOD_BASE"]
MIRACLE_TARGET = _STARRY["MIRACLE_TARGET"]
find_miracle_subset = _STARRY["find_miracle_subset"]

# pytest ?? trial ????????CLI ???
DEFAULT_TRIALS = 400
DEFAULT_SEED = 20260715
BACKPACK_SIZES = (24, 25, 26)
ID_MIN = 0
ID_MAX = 999_999  # ????????

# ??????????????
EXPECTED_MIN_RATE = {
    24: 0.70,
    25: 0.85,
    26: 0.95,
}


def theoretical_rate(n: int, mod_base: int = MIRACLE_MOD_BASE) -> float:
    """1 - exp(-(2^n - 1)/mod)?????????"""
    import math

    return 1.0 - math.exp(-(float((1 << n) - 1) / float(mod_base)))


def simulate_success_rate(
    n: int,
    *,
    trials: int = DEFAULT_TRIALS,
    seed: int = DEFAULT_SEED,
    target: int = MIRACLE_TARGET,
    mod_base: int = MIRACLE_MOD_BASE,
) -> dict:
    rng = random.Random(seed + n * 1_000_003)
    hits = 0
    t0 = time.perf_counter()
    for _ in range(trials):
        values = [rng.randint(ID_MIN, ID_MAX) for _ in range(n)]
        indices = find_miracle_subset(values, target=target, mod_base=mod_base)
        if not indices:
            continue
        total = sum(values[i] for i in indices) % mod_base
        assert total == target % mod_base
        assert all(0 <= i < n for i in indices)
        assert len(indices) == len(set(indices))
        hits += 1
    elapsed = time.perf_counter() - t0
    rate = hits / trials if trials else 0.0
    return {
        "n": n,
        "trials": trials,
        "hits": hits,
        "misses": trials - hits,
        "rate": rate,
        "rate_pct": rate * 100.0,
        "theory_pct": theoretical_rate(n, mod_base) * 100.0,
        "elapsed_sec": elapsed,
        "ms_per_trial": (elapsed / trials * 1000.0) if trials else 0.0,
        "seed": seed,
        "target": target,
        "mod_base": mod_base,
    }


def format_report(rows: list[dict], *, seed: int, trials: int) -> str:
    lines = [
        "=== ????????????? 0..999999?===",
        f"seed={seed} trials/size={trials} target={MIRACLE_TARGET} mod={MIRACLE_MOD_BASE}",
        f"{'n':>4}  {'trials':>7}  {'hits':>6}  {'rate':>10}  {'theory':>10}  {'ms/trial':>9}",
    ]
    for row in rows:
        lines.append(
            f"{row['n']:>4}  {row['trials']:>7}  {row['hits']:>6}  "
            f"{row['rate_pct']:>9.3f}%  {row['theory_pct']:>9.3f}%  "
            f"{row['ms_per_trial']:>9.3f}"
        )
    return "\n".join(lines)


class TestMiracleRandomSuccessRate:
    """????????????? 24/25/26 ??????????"""

    def test_miracle_max_exact_n_covers_practical_sizes(self):
        assert MIRACLE_MAX_EXACT_N >= max(BACKPACK_SIZES)

    def test_success_rate_for_sizes_24_25_26(self):
        rows = []
        for n in BACKPACK_SIZES:
            row = simulate_success_rate(n)
            rows.append(row)
            assert 0.0 <= row["rate"] <= 1.0
            assert row["hits"] + row["misses"] == row["trials"]
            assert row["rate"] + 1e-12 >= EXPECTED_MIN_RATE[n]

        report = format_report(rows, seed=DEFAULT_SEED, trials=DEFAULT_TRIALS)
        print(report)
        out = Path(__file__).resolve().parent / "_miracle_success_rate_last.txt"
        out.write_text(report + "\n", encoding="utf-8")

        by_n = {row["n"]: row["rate"] for row in rows}
        # ?????????????????????????
        assert by_n[25] + 0.05 >= by_n[24]
        assert by_n[26] + 0.05 >= by_n[25]

    def test_theoretical_curve_increases_with_n(self):
        assert theoretical_rate(24) < theoretical_rate(25) < theoretical_rate(26)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Miracle subset success-rate sim")
    parser.add_argument("--trials", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--sizes", type=int, nargs="+", default=list(BACKPACK_SIZES))
    args = parser.parse_args(argv)

    # CLI ?????????? nonebot ?????
    global MIRACLE_MAX_EXACT_N, MIRACLE_MOD_BASE, MIRACLE_TARGET, find_miracle_subset
    loaded = _load_starry_system_from_file()
    MIRACLE_MAX_EXACT_N = loaded["MIRACLE_MAX_EXACT_N"]
    MIRACLE_MOD_BASE = loaded["MIRACLE_MOD_BASE"]
    MIRACLE_TARGET = loaded["MIRACLE_TARGET"]
    find_miracle_subset = loaded["find_miracle_subset"]

    rows = []
    for n in args.sizes:
        row = simulate_success_rate(n, trials=args.trials, seed=args.seed)
        rows.append(row)
        print(
            f"n={row['n']} trials={row['trials']} hits={row['hits']} "
            f"rate={row['rate_pct']:.3f}% theory={row['theory_pct']:.3f}% "
            f"ms={row['ms_per_trial']:.3f}"
        )
    report = format_report(rows, seed=args.seed, trials=args.trials)
    out = Path(__file__).resolve().parent / "_miracle_success_rate_last.txt"
    out.write_text(report + "\n", encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    # ???????? import ??????? package import ?????
    # main() ????????????
    main()

