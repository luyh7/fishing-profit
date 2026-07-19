import re

from zhenxun.plugins.zhenxun_plugin_fishing.config import ConfigManager


class TestMultiplicativeSpeed:
    def test_hook_bait_multiplicative(self):
        base = ConfigManager.get_base_fishing_interval()
        hook_only = ConfigManager.calculate_fishing_interval(5, 0)
        bait_only = ConfigManager.calculate_fishing_interval(0, 40)
        both = ConfigManager.calculate_fishing_interval(5, 40)

        hook_mul = base / hook_only
        bait_mul = base / bait_only
        both_mul = base / both

        assert abs(both_mul - hook_mul * bait_mul) < 0.01, (
            f"乘区制不成立: {both_mul} != {hook_mul} * {bait_mul} = {hook_mul * bait_mul}"
        )

    def test_additive_not_used(self):
        base = ConfigManager.get_base_fishing_interval()
        hook_5_bait_40 = ConfigManager.calculate_fishing_interval(5, 40)
        additive_interval = base / (1 + (5 * 10 + 40) / 100)
        assert abs(hook_5_bait_40 - additive_interval) > 0.01, "不应使用加法制"

    def test_no_hook_no_bait_is_base(self):
        base = ConfigManager.get_base_fishing_interval()
        interval = ConfigManager.calculate_fishing_interval(0, 0)
        assert interval == base

    def test_hook_speed_per_level_from_config(self):
        shop = ConfigManager.get_shop()
        assert shop.hook_speed_bonus_per_level == 10

    def test_bait_always_beneficial(self):
        shop = ConfigManager.get_shop()
        for bait in shop.baits:
            for hook_lv in range(11):
                no_bait = ConfigManager.calculate_fishing_interval(hook_lv, 0)
                with_bait = ConfigManager.calculate_fishing_interval(
                    hook_lv, bait.speed_bonus
                )
                assert with_bait < no_bait, (
                    f"鱼饵{bait.name}(+{bait.speed_bonus}%)在hook Lv.{hook_lv}时应加速"
                )

    def test_speed_buff_multiplier(self):
        base = ConfigManager.get_base_fishing_interval()
        no_buff = ConfigManager.calculate_fishing_interval(5, 40, has_speed_buff=False)
        with_buff = ConfigManager.calculate_fishing_interval(5, 40, has_speed_buff=True)
        assert with_buff < no_buff
        assert abs(no_buff / with_buff - 1.5) < 0.01

    def test_interval_minimum(self):
        interval = ConfigManager.calculate_fishing_interval(10, 120)
        assert interval >= 1


class TestPityHints:
    def test_frame_pity_hint(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.core.hints import build_pity_hints

        hints = build_pity_hints(
            total_fish=[],
            frame_pity=30,
            cat_frame_pity=5,
            utr_pity=0,
            display_slots=3,
            upgraded_display_count=2,
            cat_frames=10,
            effects_now=None,
        )
        assert any("展示木框保底" in h for h in hints)
        assert any("猫猫框保底" in h for h in hints)

    def test_utr_pity_hint_with_lost_wind(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.core.hints import build_pity_hints

        hints = build_pity_hints(
            total_fish=[],
            frame_pity=0,
            cat_frame_pity=0,
            utr_pity=50,
            display_slots=3,
            upgraded_display_count=3,
            cat_frames=0,
            effects_now={"weather_lost_wind": True},
        )
        assert any("迷途风UTR保底" in h for h in hints)

    def test_utr_pity_hint_after_lost_wind(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.core.hints import build_pity_hints

        hints = build_pity_hints(
            total_fish=[],
            frame_pity=0,
            cat_frame_pity=0,
            utr_pity=50,
            display_slots=3,
            upgraded_display_count=3,
            cat_frames=0,
            effects_now={"weather_lost_wind": False},
        )
        assert any("迷途风UTR保底" in h for h in hints)

    def test_upgrade_display_hint(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.core.hints import build_pity_hints

        hints = build_pity_hints(
            total_fish=[],
            frame_pity=0,
            cat_frame_pity=0,
            utr_pity=0,
            display_slots=3,
            upgraded_display_count=2,
            cat_frames=5,
            effects_now=None,
        )
        assert any("升级展示栏" in h for h in hints)


class TestItemDispatchTable:
    def test_dispatch_table_covers_all_known_items(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.shop.item_dispatch import (
            ITEM_DISPATCH,
        )

        known_names = ["时光药水", "时间药水", "回档药水", "回溯药水", "幸运药水", "闪光药水", "UTR自选券", "utr自选券", "UTR券", "utr券", "香甜玉米", "玉米", "展示木框", "木框"]
        for name in known_names:
            assert name in ITEM_DISPATCH, f"物品 '{name}' 未在 ITEM_DISPATCH 中注册"

    def test_dispatch_table_unknown_item_returns_none(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.shop.item_dispatch import (
            resolve_item_handler,
        )

        handler, is_image = resolve_item_handler("不存在的物品")
        assert handler is None

    def test_dispatch_table_time_potion_is_image(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.shop.item_dispatch import (
            resolve_item_handler,
        )

        handler, is_image = resolve_item_handler("时光药水")
        assert handler is not None
        assert is_image is True

    def test_dispatch_table_lucky_potion_is_text(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.shop.item_dispatch import (
            resolve_item_handler,
        )

        handler, is_image = resolve_item_handler("幸运药水")
        assert handler is not None
        assert is_image is False

    def test_dispatch_table_flash_potion_is_text(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.shop.item_dispatch import (
            resolve_item_handler,
        )

        handler, is_image = resolve_item_handler("闪光药水")
        assert handler is not None
        assert is_image is False

    def test_dispatch_table_utr_ticket_aliases(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.shop.item_dispatch import (
            resolve_item_handler,
        )

        for name in ["UTR自选券", "utr自选券", "UTR券", "utr券"]:
            handler, is_image = resolve_item_handler(name)
            assert handler is not None, name
            assert is_image is False, name


class TestDailyLimitHelpers:
    def test_remaining_stop_actions(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.services.limit_service import (
            remaining_stop_actions,
        )

        # DAILY_ACTION_LIMIT=4, status_count=1 → remaining=3
        assert remaining_stop_actions(stop_count=0, status_count=1) == 3

    def test_remaining_stop_actions_zero(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.services.limit_service import (
            remaining_stop_actions,
        )

        # stop_count=3, status_count=1 → remaining=0
        assert remaining_stop_actions(stop_count=3, status_count=1) == 0

    def test_max_status_views(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.services.limit_service import (
            max_status_views,
        )

        # DAILY_ACTION_LIMIT=4, MAX_STATUS_PER_DAY=3, stop_count=1 → min(3, 3)=3
        assert max_status_views(stop_count=1) == 3

    def test_max_status_views_capped_by_remaining_actions(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.services.limit_service import (
            max_status_views,
        )

        # stop_count=2 → remaining=2, min(3, 2)=2
        assert max_status_views(stop_count=2) == 2

    def test_is_last_stop_action(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.services.limit_service import (
            is_last_stop_action,
        )

        assert is_last_stop_action(stop_count=2, status_count=1) is True
        assert is_last_stop_action(stop_count=1, status_count=1) is False

    def test_is_last_status_view(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.services.limit_service import (
            is_last_status_view,
        )

        # max_status=3, current+1=3 → last
        assert is_last_status_view(status_count=2, stop_count=0) is True
        # max_status=3, current+1=2 → not last
        assert is_last_status_view(status_count=1, stop_count=0) is False

    def test_group_action_limit_toggle(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.services.limit_service import (
            is_group_action_limit_enabled,
            set_group_action_limit_enabled,
        )

        original = is_group_action_limit_enabled()
        try:
            set_group_action_limit_enabled(False)
            assert is_group_action_limit_enabled() is False
            set_group_action_limit_enabled(True)
            assert is_group_action_limit_enabled() is True
        finally:
            set_group_action_limit_enabled(original)

    def test_status_handler_imports_group_action_limit(self):
        """钓鱼状态 handler 必须导入 is_group_action_limit_enabled。

        回归：日志 NameError: name 'is_group_action_limit_enabled' is not defined
        """
        import ast
        from pathlib import Path

        src_path = (
            Path(__file__).resolve().parent.parent / "handlers" / "fishing.py"
        )
        source = src_path.read_text(encoding="utf-8")
        tree = ast.parse(source)

        imported = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    imported.add(alias.asname or alias.name)

        assert "is_group_action_limit_enabled" in imported, (
            "handlers/fishing.py 必须从 limit_service 导入 "
            "is_group_action_limit_enabled（钓鱼状态会调用它）"
        )
        assert "is_group_action_limit_enabled()" in source, (
            "handlers/fishing.py 应调用 is_group_action_limit_enabled()"
        )


class TestSkinStemParsing:
    """皮肤文件名解析：支持 star_man_-21 这类带下划线 id。"""

    def test_parse_skin_stem_simple_and_negative_offset(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.render.fishing_scene import (
            _parse_skin_stem,
        )

        assert _parse_skin_stem("1") == ("1", 0)
        assert _parse_skin_stem("1_-21") == ("1", -21)
        assert _parse_skin_stem("cat_-6") == ("cat", -6)
        assert _parse_skin_stem("star_man_-21") == ("star_man", -21)
        assert _parse_skin_stem("star_man") == ("star_man", 0)

    def test_find_skin_file_star_man_matches_default_offset(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.render.fishing_scene import (
            _find_skin_file,
        )

        sm_file, sm_off = _find_skin_file("star_man")
        one_file, one_off = _find_skin_file("1")
        assert sm_file is not None, "应能找到 star_man 皮肤文件"
        assert sm_file.name.startswith("star_man")
        assert sm_off == one_off, (
            f"star_man 与默认角色应使用相同 y_offset，实际 {sm_off} vs {one_off}"
        )
        # 回归：旧逻辑 split('_',1) 会把 star_man 拆成 star，永远找不到
        assert "star" != sm_file.stem.split("_", 1)[0] or sm_file.stem.startswith(
            "star_man"
        )


class TestSettlementStatusHelpers:
    def test_build_settlement_status_serializes_total_fish(self):
        from datetime import datetime

        from zhenxun.plugins.zhenxun_plugin_fishing.config import ConfigManager
        from zhenxun.plugins.zhenxun_plugin_fishing.core.settlement_status import (
            build_settlement_status,
        )

        fish = ConfigManager.get_fish("小鲫鱼")
        status = build_settlement_status(
            status_dict={"location_id": "1", "start_time": "start"},
            last_settle_time=datetime(2026, 1, 2, 3, 4, 5),
            fish_caught=[(fish, "N", 2)],
            bait_consumed=3,
            frame_pity=4,
            cat_frame_pity=5,
            utr_pity=6,
            cat_eaten_fish=[],
            cat_gifts={"gold": 7, "cat_frame_pity": 5},
        )

        assert status["location_id"] == "1"
        assert status["start_time"] == "start"
        assert status["last_settle_time"] == "2026-01-02T03:04:05"
        assert status["fish_caught"] == [{"fish_id": "小鲫鱼", "rarity": "N", "count": 2}]
        assert status["bait_consumed"] == 3
        assert status["frame_pity"] == 4
        assert status["cat_frame_pity"] == 5
        assert status["utr_pity"] == 6
        assert status["cat_gifts"]["gold"] == 7

    def test_build_settlement_status_can_preserve_existing_fish_for_time_potion(self):
        from datetime import datetime

        from zhenxun.plugins.zhenxun_plugin_fishing.core.settlement_status import (
            build_settlement_status,
        )

        status = build_settlement_status(
            status_dict={"location_id": "2", "start_time": "original"},
            last_settle_time=datetime(2026, 2, 3, 4, 5, 6),
            fish_caught=[],
            bait_consumed=8,
            frame_pity=9,
            cat_frame_pity=10,
            utr_pity=11,
            cat_eaten_fish=[],
            cat_gifts={},
        )

        assert status["location_id"] == "2"
        assert status["start_time"] == "original"
        assert status["fish_caught"] == []
        assert status["last_settle_time"] == "2026-02-03T04:05:06"


class TestCatGiftHelpers:
    def test_merge_cat_gifts_accumulates_counts_and_uses_new_item_values(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.core.cat_gift import merge_cat_gifts

        existing = {
            "gold": 10,
            "corn": 1,
            "bait_id": "1",
            "bait_count": 2,
            "cat_frames": 3,
            "fish_gifts": [{"fish_name": "小鲫鱼", "fish_rarity": "N"}],
        }
        incoming = {
            "gold": 5,
            "corn": 4,
            "bait_id": "2",
            "bait_count": 6,
            "cat_frames": 7,
            "fish_gifts": [{"fish_name": "草鱼", "fish_rarity": "R"}],
        }

        merged = merge_cat_gifts(existing, incoming, cat_frame_pity=9)
        assert merged["gold"] == 15
        assert merged["corn"] == 5
        assert merged["bait_id"] == "2"
        assert merged["bait_count"] == 8
        assert merged["cat_frames"] == 10
        assert merged["cat_frame_pity"] == 9
        # fish_gifts 列表应累积合并，保留两条
        assert len(merged["fish_gifts"]) == 2
        assert merged["fish_gifts"][0] == {"fish_name": "小鲫鱼", "fish_rarity": "N"}
        assert merged["fish_gifts"][1] == {"fish_name": "草鱼", "fish_rarity": "R"}

    def test_merge_cat_gifts_keeps_existing_item_values_when_new_empty(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.core.cat_gift import merge_cat_gifts

        existing = {
            "gold": 10,
            "corn": 1,
            "bait_id": "1",
            "bait_count": 2,
            "cat_frames": 3,
            "fish_gifts": [{"fish_name": "小鲫鱼", "fish_rarity": "N"}],
        }

        merged = merge_cat_gifts(existing, {}, cat_frame_pity=4)

        assert merged["bait_id"] == "1"
        assert len(merged["fish_gifts"]) == 1
        assert merged["fish_gifts"][0] == {"fish_name": "小鲫鱼", "fish_rarity": "N"}
        assert merged["cat_frame_pity"] == 4

    def test_merge_cat_gifts_backward_compat_old_scalar_format(self):
        """旧格式 (fish_name/fish_rarity 标量) 应被自动转换为列表。"""
        from zhenxun.plugins.zhenxun_plugin_fishing.core.cat_gift import merge_cat_gifts

        existing = {
            "gold": 0,
            "fish_name": "小鲫鱼",
            "fish_rarity": "N",
        }
        incoming = {
            "gold": 5,
            "fish_gifts": [{"fish_name": "草鱼", "fish_rarity": "R"}],
        }

        merged = merge_cat_gifts(existing, incoming, cat_frame_pity=0)
        assert len(merged["fish_gifts"]) == 2
        assert merged["fish_gifts"][0] == {"fish_name": "小鲫鱼", "fish_rarity": "N"}
        assert merged["fish_gifts"][1] == {"fish_name": "草鱼", "fish_rarity": "R"}


class TestSpeedDisplayHelpers:
    def test_speed_detail_splits_hook_bait_buff_extra_weather(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.core.speed import (
            build_speed_bonus_detail,
        )

        detail = build_speed_bonus_detail(
            hook_level=3,
            base_bait_speed_bonus=40,
            effective_speed_bonus=55,
            extra_speed_multiplier=1.2,
            weather_speed_multiplier=1.5,
        )

        assert detail == "鱼钩+30% 鱼饵+40% Buff+15% 额外×1.2 天气×1.5"

    def test_speed_detail_returns_none_without_bonus(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.core.speed import (
            build_speed_bonus_detail,
        )

        assert build_speed_bonus_detail(
            hook_level=0,
            base_bait_speed_bonus=0,
            effective_speed_bonus=0,
        ) is None

    def test_speed_detail_separates_starry_bonus(self):
        """星空艇加成应从总 Buff 中拆出单独显示。"""
        from zhenxun.plugins.zhenxun_plugin_fishing.core.speed import (
            build_speed_bonus_detail,
        )

        # 星空艇 50% + 其他 buff 15% + 鱼饵 40% + 鱼钩 30%
        detail = build_speed_bonus_detail(
            hook_level=3,
            base_bait_speed_bonus=40,
            effective_speed_bonus=105,
            extra_speed_multiplier=1.2,
            weather_speed_multiplier=1.5,
            starry_bonus=50,
        )
        assert "星空艇+50%" in detail
        assert "Buff+15%" in detail
        assert "Buff+65%" not in detail  # 星空艇不应混入 Buff 总数

    def test_speed_detail_starry_zero_no_display(self):
        """starry_bonus=0 时不显示星空艇条目。"""
        from zhenxun.plugins.zhenxun_plugin_fishing.core.speed import (
            build_speed_bonus_detail,
        )

        detail = build_speed_bonus_detail(
            hook_level=3,
            base_bait_speed_bonus=40,
            effective_speed_bonus=55,
            starry_bonus=0,
        )
        assert "星空艇" not in detail

    def test_effective_interval_applies_extra_and_weather_multipliers(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.core.speed import (
            calculate_effective_fishing_interval,
        )

        base_interval = ConfigManager.calculate_fishing_interval(2, 40, False)
        interval = calculate_effective_fishing_interval(
            hook_level=2,
            effective_speed_bonus=40,
            extra_speed_multiplier=2.0,
            weather_speed_multiplier=1.5,
        )

        assert abs(interval - max(1, base_interval / 2.0 / 1.5)) < 0.01


class TestShopDataConsistency:
    def test_rod_prices_match_json(self):
        shop = ConfigManager.get_shop()
        for k, v in shop.rod_upgrade_prices.items():
            price = ConfigManager.get_rod_upgrade_price(int(k) - 1)
            assert price == v, (
                f"rod_upgrade_prices[{k}]={v} != get_rod_upgrade_price({int(k) - 1})={price}"
            )

    def test_hook_prices_match_json(self):
        shop = ConfigManager.get_shop()
        for k, v in shop.hook_upgrade_prices.items():
            price = ConfigManager.get_hook_upgrade_price(int(k) - 1)
            assert price == v, (
                f"hook_upgrade_prices[{k}]={v} != get_hook_upgrade_price({int(k) - 1})={price}"
            )

    def test_bait_speed_bonus_progression(self):
        shop = ConfigManager.get_shop()
        speeds = [b.speed_bonus for b in shop.baits]
        assert speeds == sorted(speeds), "鱼饵速度加成应递增"
        assert speeds == [20, 40, 60, 80, 100, 120], (
            f"鱼饵速度加成应为20/40/60/80/100/120, 实际{speeds}"
        )

    def test_bait_ids_unique(self):
        shop = ConfigManager.get_shop()
        ids = [b.id for b in shop.baits]
        assert len(ids) == len(set(ids)), "鱼饵ID应唯一"

    def test_rod_names_complete(self):
        shop = ConfigManager.get_shop()
        for i in range(11):
            assert str(i) in shop.rod_names, f"缺少rod_names[{i}]"

    def test_fish_data_matches_locations(self):
        locations = ConfigManager.get_locations()
        for loc in locations:
            for fish_id in loc.fish_pool:
                fish = ConfigManager.get_fish(fish_id)
                assert fish is not None, (
                    f"地点{loc.name}中的鱼'{fish_id}'在fish数据中不存在"
                )
                assert fish.base_price > 0, f"鱼'{fish_id}'价格应>0"


class TestCommandRegex:
    FISHING_PATTERN = r"^(?:钓鱼(?!状态|图鉴|签到|改名|币兑换)|抛竿|抛杆)(?:\s*(\S+))?$"
    STATUS_PATTERN = r"^钓鱼状态$"

    def test_fishing_matches_bare(self):
        assert re.match(self.FISHING_PATTERN, "钓鱼")
        assert re.match(self.FISHING_PATTERN, "抛竿")
        assert re.match(self.FISHING_PATTERN, "抛杆")

    def test_fishing_matches_with_location(self):
        m = re.match(self.FISHING_PATTERN, "钓鱼 1")
        assert m and m.group(1) == "1"
        m = re.match(self.FISHING_PATTERN, "钓鱼 乡间浅溪")
        assert m and m.group(1) == "乡间浅溪"

    def test_fishing_does_not_match_status(self):
        assert not re.match(self.FISHING_PATTERN, "钓鱼状态")

    def test_fishing_does_not_match_collection(self):
        assert not re.match(self.FISHING_PATTERN, "钓鱼图鉴")

    def test_fishing_does_not_match_sign(self):
        assert not re.match(self.FISHING_PATTERN, "钓鱼签到")

    def test_fishing_does_not_match_rename(self):
        assert not re.match(self.FISHING_PATTERN, "钓鱼改名")

    def test_fishing_does_not_match_exchange(self):
        assert not re.match(self.FISHING_PATTERN, "钓鱼币兑换")

    def test_status_matches(self):
        assert re.match(self.STATUS_PATTERN, "钓鱼状态")

    def test_status_does_not_match_fishing(self):
        assert not re.match(self.STATUS_PATTERN, "钓鱼")


class TestConfigManagerMethods:
    def test_get_fish_exists(self):
        fish = ConfigManager.get_fish("小鲫鱼")
        assert fish is not None
        assert fish.id == "小鲫鱼"
        assert fish.base_price == 9

    def test_get_fish_not_exists(self):
        fish = ConfigManager.get_fish("不存在的鱼")
        assert fish is None

    def test_get_bait_by_id(self):
        bait = ConfigManager.get_bait(1)
        assert bait is not None
        assert bait.name == "蚯蚓鱼饵"
        assert bait.speed_bonus == 20

    def test_get_bait_not_exists(self):
        bait = ConfigManager.get_bait(999)
        assert bait is None

    def test_get_location_exists(self):
        loc = ConfigManager.get_location("1")
        assert loc is not None
        assert loc.name == "乡间浅溪"
        assert loc.difficulty == 0

    def test_get_location_not_exists(self):
        loc = ConfigManager.get_location("999")
        assert loc is None

    def test_rod_upgrade_price_max_level(self):
        price = ConfigManager.get_rod_upgrade_price(20)
        assert price == 0

    def test_hook_upgrade_price_max_level(self):
        price = ConfigManager.get_hook_upgrade_price(10)
        assert price == 0

    def test_rod_name(self):
        shop = ConfigManager.get_shop()
        assert shop.rod_names["0"] == "新手竹竿"
        assert shop.rod_names["10"] == "星辰钓竿"


class TestRarityCapping:
    def test_cap_rarity_ssr(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.fishing import _cap_rarity

        assert _cap_rarity(5, "SSR") == "SSR"
        assert _cap_rarity(4, "SSR") == "SSR"
        assert _cap_rarity(3, "SSR") == "SSR"
        assert _cap_rarity(2, "SSR") == "SR"
        assert _cap_rarity(0, "SSR") == "N"

    def test_cap_rarity_default(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.fishing import _cap_rarity

        assert _cap_rarity(5, "SSR") == "SSR"
        assert _cap_rarity(3, "SSR") == "SSR"
        assert _cap_rarity(2, "SSR") == "SR"


class TestBackpackPotionInventory:
    def test_build_potion_inventory_includes_time_duoduo_and_lucky(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.backpack.view import (
            build_potion_inventory,
        )

        potions = build_potion_inventory(
            [
                {"item_id": "time_potion", "item_type": "potion", "count": 2},
                {"item_id": "真多多药水", "item_type": "potion", "count": 3},
                {"item_id": "幸运药水", "item_type": "potion", "count": 4},
                {"item_id": "回档药水", "item_type": "potion", "count": 0},
                {"item_id": "1", "item_type": "bait", "count": 9},
            ]
        )

        assert potions == [
            {"item_id": "time_potion", "name": "时光药水", "count": 2},
            {"item_id": "真多多药水", "name": "真多多药水", "count": 3},
            {"item_id": "幸运药水", "name": "幸运药水", "count": 4},
        ]


class TestMeteorBackpackInventory:
    def test_build_meteor_inventory_excludes_exhibition_includes_legacy(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.backpack.view import (
            build_meteor_inventory,
        )

        items = build_meteor_inventory(
            starry_fish=[
                {"id": "000123", "display_score": 1, "score": 1.1},
                {"id": 45, "display_score": 0, "score": 0},
            ],
            items_list=[
                {"item_id": "87654321", "item_type": "meteor_fish", "count": 2},
                {"item_id": "x", "item_type": "bait", "count": 9},
            ],
        )

        numbers = [m["number"] for m in items]
        assert "111111" not in numbers  # exhibition never appears in backpack
        assert "000123" in numbers
        assert "000045" in numbers
        assert numbers.count("87654321") == 2

        backpack_item = next(m for m in items if m["number"] == "000123")
        assert backpack_item["in_exhibition"] is False
        assert backpack_item["display_score"] == 1

        legacy = next(m for m in items if m["number"] == "87654321")
        assert legacy["source"] == "legacy"
        assert legacy["display_score"] is None

        # starry first by score desc, then legacy
        assert numbers[0] == "000123"

    def test_coerce_starry_records_accepts_json_string(self):
        from zhenxun.plugins.zhenxun_plugin_fishing.backpack.view import (
            _coerce_starry_records,
        )

        rows = _coerce_starry_records(
            '[{"id": "12", "display_score": 3}]'
        )
        assert rows == [
            {
                "number": "000012",
                "count": 1,
                "display_score": 3,
                "source": "starry",
            }
        ]
