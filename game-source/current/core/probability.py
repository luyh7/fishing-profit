"""
概率计算 — 展示概率、天气调整概率。
"""

from ..constants import (
    get_display_probabilities,
    get_lost_wind_utr_probability,
    get_meteor_adjusted_probabilities,
)


def calculate_display_probabilities(
    rod_level: int,
    difficulty: int,
    max_rarity: str,
    duoduo_count: int = 0,
    weather_luck_boost: float = 0,
    weather_lost_wind: bool = False,
    material_rate: float = 0.0,
    starry_utr_unlocked: bool = False,
) -> dict[str, float]:
    """计算最终展示概率，综合多多、流星、迷途风、材料率效果。

    material_rate > 0 时（S1 猫猫乐园），所有鱼稀有度概率按 (1 - material_rate)
    等比缩放，为材料率腾出空间。天气效果（流星/迷途风）在缩放前应用，
    两者不冲突：天气影响鱼的稀有度分布，材料率影响鱼 vs 材料的整体比例。

    starry_utr_unlocked：11-20 集齐全 UR 后，展示递进 UTR 概率（概率表 UTR 截断为 0）。
    """
    # 星空图解锁后仍不展示概率表 UTR，只用递进概率
    table_max = "UR" if starry_utr_unlocked else max_rarity
    probabilities = get_display_probabilities(
        rod_level, difficulty, duoduo_count, table_max
    )
    if weather_luck_boost > 0:
        probabilities = get_meteor_adjusted_probabilities(
            rod_level, difficulty, weather_luck_boost
        )
        if starry_utr_unlocked:
            # 流星加成后仍截断展示用 UTR 位
            utr_mass = probabilities.get("UTR", 0.0)
            if utr_mass:
                probabilities["UTR"] = 0.0
                probabilities["UR"] = probabilities.get("UR", 0.0) + utr_mass
    if weather_lost_wind or starry_utr_unlocked:
        utr_probability = get_lost_wind_utr_probability(rod_level, difficulty)
        probabilities["UTR"] = utr_probability
        for key in list(probabilities):
            if key != "UTR":
                probabilities[key] *= 1 - utr_probability
    if material_rate > 0:
        fish_scale = 1.0 - material_rate
        for key in probabilities:
            probabilities[key] *= fish_scale
    return probabilities
