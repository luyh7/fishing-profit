import re

from zhenxun.plugins.zhenxun_plugin_fishing.commands import (
    COMMAND_DEFS,
    COMMAND_PATTERN_MAP,
)


FISHING_PATTERN = r"^(?:钓鱼|抛竿|抛杆)(?:\s+(-?\d+(?:\.\d+)?(?=\s|$)))?$"
GIFT_FISH_PATTERN = r"^(?:赠送|送鱼)(?:\s*((?:[sS]1\d{2})|-?\d+))?"


class TestFishingPattern:
    def test_fishing_no_param(self):
        pattern = re.compile(FISHING_PATTERN)
        match = pattern.match("钓鱼")
        assert match is not None
        assert match.group(1) is None

    def test_fishing_with_positive_int(self):
        pattern = re.compile(FISHING_PATTERN)
        match = pattern.match("钓鱼 1")
        assert match is not None
        assert match.group(1) == "1"

    def test_fishing_with_negative_int(self):
        pattern = re.compile(FISHING_PATTERN)
        match = pattern.match("钓鱼 -1")
        assert match is not None
        assert match.group(1) == "-1"

    def test_fishing_with_positive_float(self):
        pattern = re.compile(FISHING_PATTERN)
        match = pattern.match("钓鱼 1.5")
        assert match is not None
        assert match.group(1) == "1.5"

    def test_fishing_with_negative_float(self):
        pattern = re.compile(FISHING_PATTERN)
        match = pattern.match("钓鱼 -1.5")
        assert match is not None
        assert match.group(1) == "-1.5"

    def test_fishing_with_large_number(self):
        pattern = re.compile(FISHING_PATTERN)
        match = pattern.match("钓鱼 12000")
        assert match is not None
        assert match.group(1) == "12000"

    def test_fishing_not_match_text_after_number(self):
        pattern = re.compile(FISHING_PATTERN)
        match = pattern.match("钓鱼12000行代码")
        assert match is None

    def test_fishing_not_match_chinese_after_number(self):
        pattern = re.compile(FISHING_PATTERN)
        match = pattern.match("钓鱼 12000行代码")
        assert match is None

    def test_fishing_not_match_mixed_content(self):
        pattern = re.compile(FISHING_PATTERN)
        match = pattern.match("钓鱼 abc123")
        assert match is None

    def test_paogan_no_param(self):
        pattern = re.compile(FISHING_PATTERN)
        match = pattern.match("抛竿")
        assert match is not None
        assert match.group(1) is None

    def test_paogan_with_number(self):
        pattern = re.compile(FISHING_PATTERN)
        match = pattern.match("抛竿 1")
        assert match is not None
        assert match.group(1) == "1"

    def test_paogan_with_negative_number(self):
        pattern = re.compile(FISHING_PATTERN)
        match = pattern.match("抛竿 -1.5")
        assert match is not None
        assert match.group(1) == "-1.5"


class TestGiftFishPattern:
    def test_gift_no_param(self):
        pattern = re.compile(GIFT_FISH_PATTERN)
        match = pattern.match("赠送")
        assert match is not None
        assert match.group(1) is None

    def test_gift_with_fish_id(self):
        pattern = re.compile(GIFT_FISH_PATTERN)
        match = pattern.match("赠送 111")
        assert match is not None
        assert match.group(1) == "111"

    def test_gift_not_match_at_info(self):
        pattern = re.compile(GIFT_FISH_PATTERN)
        match = pattern.match("赠送 111@淡写东阳")
        assert match is not None
        assert match.group(1) == "111"

    def test_gift_not_match_cq_code(self):
        pattern = re.compile(GIFT_FISH_PATTERN)
        match = pattern.match("赠送 111[CQ:at,qq=470103427,name=淡写东阳]")
        assert match is not None
        assert match.group(1) == "111"

    def test_songyu_no_param(self):
        pattern = re.compile(GIFT_FISH_PATTERN)
        match = pattern.match("送鱼")
        assert match is not None
        assert match.group(1) is None

    def test_songyu_with_fish_id(self):
        pattern = re.compile(GIFT_FISH_PATTERN)
        match = pattern.match("送鱼 111")
        assert match is not None
        assert match.group(1) == "111"

    def test_songyu_not_match_at_info(self):
        pattern = re.compile(GIFT_FISH_PATTERN)
        match = pattern.match("送鱼 111@淡写东阳")
        assert match is not None
        assert match.group(1) == "111"

    def test_gift_not_match_non_numeric(self):
        pattern = re.compile(GIFT_FISH_PATTERN)
        match = pattern.match("赠送 abc")
        assert match is not None
        assert match.group(1) is None

    def test_gift_match_s1(self):
        """S1 猫猫乐园鱼ID使用 s1 前缀，旧 -1 前缀仍兼容。"""
        pattern = re.compile(GIFT_FISH_PATTERN)
        match = pattern.match("赠送 s101")
        assert match is not None
        assert match.group(1) == "s101"

        match_upper = pattern.match("赠送 S101")
        assert match_upper is not None
        assert match_upper.group(1) == "S101"

        match_legacy = pattern.match("赠送 -101")
        assert match_legacy is not None
        assert match_legacy.group(1) == "-101"


class TestMarketAliasPattern:
    def test_starry_exhibition_alias(self):
        pattern = re.compile(rf"^{COMMAND_PATTERN_MAP['星空鱼展馆']}$")

        assert pattern.match("星空鱼展馆") is not None
        assert pattern.match("星空展馆") is not None
        assert pattern.match("星鱼展馆") is not None
        assert pattern.match("流星鱼展馆") is not None
        assert pattern.match("星空起源展馆") is not None
        assert pattern.match("星空祈愿展馆") is not None

    def test_black_market_alias(self):
        pattern = re.compile(rf"^{COMMAND_PATTERN_MAP['黑商交换']}$")

        match = pattern.match("黑市交换 鲤鱼UR 草鱼SSR")

        assert match is not None
        assert match.group(1) == "鲤鱼UR 草鱼SSR"

        loose_match = pattern.match("黑商 鲤鱼UR草鱼SSR")
        assert loose_match is not None
        assert loose_match.group(1) == "鲤鱼UR草鱼SSR"

    def test_white_market_list_alias(self):
        pattern = re.compile(rf"^{COMMAND_PATTERN_MAP['白商']}$")

        assert pattern.match("白市") is not None
        assert pattern.match("白市交换 鲤鱼UR 草鱼SSR") is None

    def test_white_market_exchange_alias(self):
        pattern = re.compile(rf"^{COMMAND_PATTERN_MAP['白商交换']}$")

        match = pattern.match("白市交换 鲤鱼UR 草鱼SSR")

        assert match is not None
        assert match.group(1) == "鲤鱼UR 草鱼SSR"

        loose_match = pattern.match("白商 鲤鱼UR草鱼SSR")
        assert loose_match is not None
        assert loose_match.group(1) == "鲤鱼UR草鱼SSR"


class TestCommandDefsConsistency:
    def test_command_router_uses_same_patterns_as_commands_py(self):
        """command_router 的正则必须与 commands.py 一致。"""
        from zhenxun.plugins.zhenxun_plugin_fishing.web.command_router import (
            _import_matchers,
            _COMMAND_TABLE,
        )

        _import_matchers()

        # 构建 commands.py 的 pattern 集合（无锚点）
        expected = {pat for pat, _ in COMMAND_DEFS}

        # command_router 的正则去掉 ^ $ 锚点后应与 commands.py 一致
        for compiled, _, _ in _COMMAND_TABLE:
            raw = compiled.pattern
            # 去掉 ^ 和 $ 锚点
            stripped = raw.lstrip("^").rstrip("$")
            assert stripped in expected, (
                f"command_router 正则 '{raw}' 去锚点后 '{stripped}' 不在 commands.py 中"
            )

    def test_commands_py_has_no_duplicate_patterns(self):
        patterns = [pat for pat, _ in COMMAND_DEFS]
        assert len(patterns) == len(set(patterns))

    def test_display_upgrade_aliases(self):
        """万能升级入口：升级展示栏 / 强化 / 星空木框 等均应匹配。"""
        pattern = re.compile(rf"^\s*{COMMAND_PATTERN_MAP['升级展示栏']}\s*$")
        for cmd in (
            "升级展示栏",
            "增加展示栏位",
            "强化展示栏位",
            "升级星空木框",
            "星空木框",
            "  升级星空木框  ",
        ):
            assert pattern.match(cmd) is not None, cmd
        assert pattern.match("升级星空木框啊") is None
        assert pattern.match("卖出星空木框") is None
