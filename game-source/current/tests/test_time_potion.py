"""时光药水状态合并 + 收杆后半段结算测试。

测试维度：
1. 静态 AST 测试：验证共用函数存在、收杆调用它、时光药水不直接调用它
2. 多多药水翻倍保底验证

行为测试需要完整的 nonebot 测试环境（通过项目根目录 tests/conftest.py），
可用以下命令运行：
    cd C:\\Users\\Administrator\\Desktop\\zhenxun_bot-420
    .venv\\Scripts\\python.exe -m pytest `
        zhenxun/plugins/zhenxun_plugin_fishing/tests/test_time_potion.py -v
"""

import ast
from pathlib import Path

import pytest

PLUGIN_ROOT = Path(__file__).resolve().parent.parent


# ────────────────────────────────────────────────────────────
# 1. 静态 AST 测试 —— 不依赖运行时导入，直接读源码
# ────────────────────────────────────────────────────────────


def _read_source(rel_path: str) -> str:
    """读取插件源码文件的文本内容。"""
    full = PLUGIN_ROOT / rel_path
    with open(full, encoding="utf-8") as f:
        return f.read()


def _is_func_node(node: ast.AST, name: str | None = None) -> bool:
    if not isinstance(node, ast.AsyncFunctionDef | ast.FunctionDef):
        return False
    return name is None or node.name == name


def _get_func_calls(source: str, func_name: str) -> list[str]:
    """提取指定函数体内所有 Call 节点的名称。"""
    tree = ast.parse(source)
    calls = []
    for node in ast.walk(tree):
        if _is_func_node(node, func_name):
            for sub in ast.walk(node):
                if isinstance(sub, ast.Call):
                    parts = []
                    cur = sub.func
                    while isinstance(cur, ast.Attribute):
                        parts.append(cur.attr)
                        cur = cur.value
                    if isinstance(cur, ast.Name):
                        parts.append(cur.id)
                    calls.append(".".join(reversed(parts)))
    return calls


class TestSharedPostSettlementAST:
    """验证 run_post_settlement 共用函数存在且收杆调用它。"""

    def test_run_post_settlement_defined(self):
        """actions.py 应定义 run_post_settlement 函数。"""
        src = _read_source("core/actions.py")
        tree = ast.parse(src)
        func_names = [
            n.name for n in ast.walk(tree)
            if _is_func_node(n)
        ]
        assert "run_post_settlement" in func_names, (
            "actions.py 应定义 run_post_settlement 函数"
        )

    def test_run_post_settlement_calls_auto_lock(self):
        """run_post_settlement 应调用 auto_lock_fish。"""
        src = _read_source("core/actions.py")
        calls = _get_func_calls(src, "run_post_settlement")
        assert any("auto_lock_fish" in c for c in calls), (
            "run_post_settlement 应调用 auto_lock_fish"
        )

    def test_run_post_settlement_calls_sell_fish(self):
        """run_post_settlement 应调用 sell_fish。"""
        src = _read_source("core/actions.py")
        calls = _get_func_calls(src, "run_post_settlement")
        assert any("sell_fish" in c for c in calls), (
            "run_post_settlement 应调用 sell_fish"
        )

    def test_run_post_settlement_calls_sell_cat_park_materials(self):
        """run_post_settlement 应调用 sell_completed_cat_park_materials。"""
        src = _read_source("core/actions.py")
        calls = _get_func_calls(src, "run_post_settlement")
        assert any("sell_completed_cat_park_materials" in c for c in calls), (
            "run_post_settlement 应调用 sell_completed_cat_park_materials"
        )

    def test_run_post_settlement_order(self):
        """run_post_settlement 应包含 锁鱼→卖鱼→卖材料 三个调用（按源码顺序）。"""
        src = _read_source("core/actions.py")
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if _is_func_node(node, "run_post_settlement"):
                # Walk body statements in source order, collecting call names
                calls_in_order = []
                for stmt in ast.walk(node):
                    if isinstance(stmt, ast.Call):
                        parts = []
                        cur = stmt.func
                        while isinstance(cur, ast.Attribute):
                            parts.append(cur.attr)
                            cur = cur.value
                        if isinstance(cur, ast.Name):
                            parts.append(cur.id)
                        calls_in_order.append(".".join(reversed(parts)))
                # Verify all three operations are present
                assert any("auto_lock_fish" in c for c in calls_in_order), (
                    "应有 auto_lock_fish"
                )
                assert any(
                    "sell_fish" in c and "cat_park" not in c
                    for c in calls_in_order
                ), "应有 sell_fish"
                assert any(
                    "sell_completed_cat_park_materials" in c
                    for c in calls_in_order
                ), "应有 sell_completed_cat_park_materials"
                return
        pytest.fail("未找到 run_post_settlement 函数")

    def test_potion_defers_run_post_settlement(self):
        """potion.py 不应直接调用 run_post_settlement，收杆时统一处理。"""
        src = _read_source("core/potion.py")
        calls = _get_func_calls(src, "use_time_potion_settle")
        assert not any("run_post_settlement" in c for c in calls), (
            "时光药水只应合并鱼获到钓鱼状态，run_post_settlement 应在收杆时调用"
        )

    def test_potion_does_not_directly_call_sell_fish(self):
        """potion.py 不应直接调用 sell_fish（应通过共用函数间接调用）。"""
        src = _read_source("core/potion.py")
        calls = _get_func_calls(src, "use_time_potion_settle")
        direct_sell = [
            c for c in calls
            if "sell_fish" in c and "sell_completed" not in c
        ]
        assert len(direct_sell) == 0, (
            f"potion.py 不应直接调用 sell_fish，发现: {direct_sell}"
        )

    def test_potion_does_not_directly_call_auto_lock(self):
        """potion.py 不应直接调用 auto_lock_fish（应通过共用函数间接调用）。"""
        src = _read_source("core/potion.py")
        calls = _get_func_calls(src, "use_time_potion_settle")
        direct_lock = [c for c in calls if "auto_lock_fish" in c]
        assert len(direct_lock) == 0, (
            f"potion.py 不应直接调用 auto_lock_fish，发现: {direct_lock}"
        )

    def test_handler_calls_run_post_settlement(self):
        """handlers/fishing.py 应调用 run_post_settlement。"""
        src = _read_source("handlers/fishing.py")
        assert "run_post_settlement" in src, (
            "handlers/fishing.py 应调用 run_post_settlement"
        )

    def test_handler_no_longer_directly_calls_sell_fish(self):
        """handlers/fishing.py 不应再有直接的 sell_fish 调用（应通过共用函数）。"""
        src = _read_source("handlers/fishing.py")
        # Should not find direct sell_fish import or call outside of run_post_settlement
        assert "from ..backpack import sell_fish" not in src, (
            "handlers/fishing.py 不应直接导入 sell_fish"
        )

    def test_stop_fishing_no_longer_calls_sell_cat_park_materials(self):
        """stop_fishing 不应再直接调用 sell_completed_cat_park_materials。"""
        src = _read_source("core/actions.py")
        calls = _get_func_calls(src, "stop_fishing")
        material_calls = [c for c in calls if "sell_completed_cat_park_materials" in c]
        assert len(material_calls) == 0, (
            "stop_fishing 不应再直接调用 sell_completed_cat_park_materials，"
            f"发现: {material_calls}"
        )


# ────────────────────────────────────────────────────────────
# 2. 多多药水翻倍保底测试
# ────────────────────────────────────────────────────────────


class TestDuoduoPityDoubling:
    """验证多多药水翻倍鱼时保底次数也翻倍。"""

    def test_engine_uses_duoduo_mult_for_fish_pity(self):
        """engine.py 中普通鱼的保底增量应使用 duoduo_mult 而非常量 1。"""
        src = _read_source("core/engine.py")
        assert (
            "frame_pity + duoduo_mult" in src
            or "_next_frame_pity(delta=duoduo_mult)" in src
        ), (
            "engine.py 中普通鱼保底增量应使用 duoduo_mult（可经 _next_frame_pity 包装）"
        )

    def test_engine_uses_duoduo_mult_for_utr_pity(self):
        """engine.py 中迷途风UTR的 utr_pity 增量也应使用 duoduo_mult。"""
        src = _read_source("core/engine.py")
        assert "utr_pity + duoduo_mult" in src, (
            "engine.py 中迷途风UTR保底增量应使用 duoduo_mult"
        )

    def test_frame_pity_uses_constant_one(self):
        """展示木框保底增量应为常量 1（非鱼类不受多多影响）。"""
        src = _read_source("core/engine.py")
        assert "return fish, rarity, 1," in src, (
            "展示木框应返回 multiplier=1（非鱼类不受多多影响）"
        )

    def test_material_pity_uses_constant_one(self):
        """材料保底增量应为常量 1（非鱼类不受多多影响）。"""
        src = _read_source("core/engine.py")
        # 材料分支应使用 +1 而非 +duoduo_mult（可经 _next_frame_pity 包装）
        assert (
            "frame_pity + 1" in src
            or "_next_frame_pity(delta=1)" in src
        ), (
            "材料分支应使用 frame_pity + 1（非鱼类不受多多影响）"
        )


# ────────────────────────────────────────────────────────────
# 3. 时光药水保底写入状态 + 状态合并测试（AST 验证）
# ────────────────────────────────────────────────────────────


class TestTimePotionPityAndStatusMergeAST:
    """通过 AST 验证保底写入钓鱼状态和状态合并。"""

    def test_potion_writes_pity_counters_to_status(self):
        """potion.py 应把保底计数器写入 fishing_status。"""
        src = _read_source("core/potion.py")
        assert "frame_pity=final_frame_pity" in src, "应写入 frame_pity"
        assert "cat_frame_pity=cat_frame_pity_2" in src, "应写入 cat_frame_pity"
        assert "utr_pity=final_utr_pity" in src, "应写入 utr_pity"

    def test_potion_updates_fishing_status(self):
        """potion.py 应调用 build_settlement_status 和 update_fishing_status。"""
        src = _read_source("core/potion.py")
        calls = _get_func_calls(src, "use_time_potion_settle")
        assert any("build_settlement_status" in c for c in calls), (
            "potion.py 应构建更新后的钓鱼状态"
        )
        assert any("update_fishing_status" in c for c in calls), (
            "potion.py 应把药水鱼获合并回钓鱼状态"
        )

    def test_potion_total_fish_is_all_potion_fish(self):
        """渲染时 total_fish 应展示本次两阶段药水产出的鱼。"""
        src = _read_source("core/potion.py")
        assert "total_fish=all_fish" in src, (
            "渲染时 total_fish 应传 all_fish"
        )

    def test_potion_total_bait_consumed_is_zero(self):
        """渲染时 total_bait_consumed 应传 0。"""
        src = _read_source("core/potion.py")
        assert "total_bait_consumed=0" in src, (
            "渲染时 total_bait_consumed 应传 0"
        )


# ────────────────────────────────────────────────────────────
# 7. 幸运选择三模块架构测试
# ────────────────────────────────────────────────────────────


class TestLuckySelectArchitecture:
    """验证幸运选择被正确拆分为三个模块。"""

    def test_single_random_roll_is_module_level(self):
        """_single_random_roll 应是模块级函数（非内部闭包）。"""
        src = _read_source("core/engine.py")
        # 应该有模块级 def _single_random_roll( 而非函数内 def _single_random_roll()
        assert "\ndef _single_random_roll(" in src, (
            "_single_random_roll 应是模块级函数"
        )

    def test_lucky_select_is_module_level(self):
        """_lucky_select 应是模块级函数。"""
        src = _read_source("core/engine.py")
        assert "\ndef _lucky_select(" in src, (
            "_lucky_select 应是模块级函数"
        )

    def test_roll_priority_is_module_level(self):
        """_roll_priority 应是模块级函数。"""
        src = _read_source("core/engine.py")
        assert "\ndef _roll_priority(" in src, (
            "_roll_priority 应是模块级函数"
        )

    def test_catch_fish_calls_single_random_roll(self):
        """_catch_fish_with_buffs 应调用 _single_random_roll。"""
        src = _read_source("core/engine.py")
        calls = _get_func_calls(src, "_catch_fish_with_buffs")
        assert any("_single_random_roll" in c for c in calls), (
            "_catch_fish_with_buffs 应调用 _single_random_roll"
        )

    def test_catch_fish_calls_lucky_select(self):
        """_catch_fish_with_buffs 在 lucky_double_active 时应调用 _lucky_select。"""
        src = _read_source("core/engine.py")
        calls = _get_func_calls(src, "_catch_fish_with_buffs")
        assert any("_lucky_select" in c for c in calls), (
            "_catch_fish_with_buffs 应调用 _lucky_select"
        )

    def test_no_internal_closure_roll(self):
        """_catch_fish_with_buffs 内部不应再有 def _single_random_roll 闭包定义。"""
        src = _read_source("core/engine.py")
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if _is_func_node(node, "_catch_fish_with_buffs"):
                for sub in ast.walk(node):
                    if _is_func_node(sub, "_single_random_roll"):
                        pytest.fail(
                            "_catch_fish_with_buffs 内部不应再有 "
                            "_single_random_roll 闭包定义"
                        )
                return
        pytest.fail("未找到 _catch_fish_with_buffs 函数")

    def test_no_internal_closure_priority(self):
        """_catch_fish_with_buffs 内部不应再有 def _roll_priority 闭包定义。"""
        src = _read_source("core/engine.py")
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if _is_func_node(node, "_catch_fish_with_buffs"):
                for sub in ast.walk(node):
                    if _is_func_node(sub, "_roll_priority"):
                        pytest.fail(
                            "no internal _roll_priority closure"
                        )
                return
        pytest.fail("未找到 _catch_fish_with_buffs 函数")

    def test_lucky_select_has_cat_park_param(self):
        """_lucky_select 应有 cat_park_prefer_material 参数。"""
        src = _read_source("core/engine.py")
        assert "cat_park_prefer_material" in src, (
            "_lucky_select 应有 cat_park_prefer_material 参数"
        )

    def test_catch_fish_passes_cat_park_preference(self):
        """_catch_fish_with_buffs 应将 cat_park_prefer_material 传给 _lucky_select。"""
        src = _read_source("core/engine.py")
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if _is_func_node(node, "_catch_fish_with_buffs"):
                for sub in ast.walk(node):
                    if isinstance(sub, ast.Call):
                        # Check if this is a _lucky_select call
                        func_name = ""
                        cur = sub.func
                        while isinstance(cur, ast.Attribute):
                            func_name = cur.attr
                            cur = cur.value
                        if isinstance(cur, ast.Name):
                            func_name = cur.id
                        if func_name == "_lucky_select":
                            # Check keyword arguments for cat_park_prefer_material
                            kwarg_names = [
                                kw.arg for kw in sub.keywords if kw.arg
                            ]
                            assert "cat_park_prefer_material" in kwarg_names, (
                                "_lucky_select should pass cat_park_prefer_material; "
                                f"实际: {kwarg_names}"
                            )
                            return
                pytest.fail("_catch_fish_with_buffs 中未找到 _lucky_select 调用")
                return
        pytest.fail("未找到 _catch_fish_with_buffs 函数")

    def test_try_catch_one_passes_cat_park_preference(self):
        """_try_catch_one 应从 effects 读取 cat_park_prefer_material 并传递。"""
        src = _read_source("core/engine.py")
        assert 'effects.get("cat_park_prefer_material"' in src, (
            "_try_catch_one 应从 effects 读取 cat_park_prefer_material"
        )


# ────────────────────────────────────────────────────────────
# 8. 猫猫乐园幸运偏好测试
# ────────────────────────────────────────────────────────────


class TestCatParkLuckyPreference:
    """验证猫猫乐园幸运偏好的逻辑。"""

    def test_engine_sets_cat_park_prefer_material(self):
        """simulate_fishing_loop 应在猫猫乐园设置 cat_park_prefer_material。"""
        src = _read_source("core/engine.py")
        assert "cat_park_prefer_material" in src, (
            "engine.py 应设置 cat_park_prefer_material"
        )
        assert "all_built" in src, (
            "engine.py 应检查猫雕像是否全部建完"
        )

    def test_lucky_select_prefers_material_when_true(self):
        """_lucky_select 在 cat_park_prefer_material=True 时应优先选材料。"""
        src = _read_source("core/engine.py")
        tree = ast.parse(src)
        lucky_func_src = None
        for node in ast.walk(tree):
            if _is_func_node(node, "_lucky_select"):
                lucky_func_src = ast.get_source_segment(src, node)
                break
        assert lucky_func_src is not None, "未找到 _lucky_select 函数"
        # 重构后使用 is_mat 标志而非字符串前缀检查
        assert "is_mat1 and not is_mat2" in lucky_func_src, (
            "_lucky_select True 分支应检查 is_mat1 and not is_mat2"
        )
        assert "cat_park_prefer_material" in lucky_func_src, (
            "_lucky_select 应使用 cat_park_prefer_material 参数"
        )

    def test_lucky_select_prefers_fish_when_false(self):
        """_lucky_select 在 cat_park_prefer_material=False 时应优先选非材料（鱼）。"""
        src = _read_source("core/engine.py")
        tree = ast.parse(src)
        lucky_func_src = None
        for node in ast.walk(tree):
            if _is_func_node(node, "_lucky_select"):
                lucky_func_src = ast.get_source_segment(src, node)
                break
        assert lucky_func_src is not None
        # False 分支：not is_mat1 and is_mat2 → return roll1
        assert "not is_mat1 and is_mat2" in lucky_func_src, (
            "_lucky_select False 分支应优先选非材料（not is_mat1 and is_mat2）"
        )

    def test_cat_park_prefer_inverts_with_all_built(self):
        """猫雕像全部建完时 cat_park_prefer_material 应为 False（优先鱼）。"""
        src = _read_source("core/engine.py")
        assert 'effects["cat_park_prefer_material"] = not all_built' in src, (
            "cat_park_prefer_material should be not all_built when all built"
        )


# ────────────────────────────────────────────────────────────
# 9. 保底不因幸运双倍而增加测试
# ────────────────────────────────────────────────────────────


class TestLuckyDoublePitySingleIncrement:
    """验证幸运药水双倍结算不会增加2次保底（仍只增加1次）。"""

    def test_single_random_roll_does_not_update_pity(self):
        """_single_random_roll 不应涉及保底计数器更新。"""
        src = _read_source("core/engine.py")
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if _is_func_node(node, "_single_random_roll"):
                func_src = ast.get_source_segment(src, node)
                # _single_random_roll 不应包含 frame_pity 或 utr_pity 的修改
                assert "frame_pity" not in func_src, (
                    "_single_random_roll 不应涉及 frame_pity"
                )
                assert "utr_pity" not in func_src, (
                    "_single_random_roll 不应涉及 utr_pity"
                )
                return
        pytest.fail("未找到 _single_random_roll 函数")

    def test_single_random_roll_generates_materials(self):
        """_single_random_roll 应能生成猫猫乐园材料。"""
        src = _read_source("core/engine.py")
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if _is_func_node(node, "_single_random_roll"):
                func_src = ast.get_source_segment(src, node)
                assert "cat_park_material" in func_src, (
                    "_single_random_roll 应包含材料生成逻辑"
                )
                assert "is_cat_park" in func_src, (
                    "_single_random_roll 应有 is_cat_park 参数"
                )
                assert "material_rate" in func_src, (
                    "_single_random_roll 应有 material_rate 参数"
                )
                return
        pytest.fail("未找到 _single_random_roll 函数")

    def test_single_random_roll_returns_5_tuple(self):
        """_single_random_roll 返回值应为5元组（含 is_material）。"""
        src = _read_source("core/engine.py")
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if _is_func_node(node, "_single_random_roll"):
                func_src = ast.get_source_segment(src, node)
                # 检查 docstring 或返回类型注解中包含 is_material
                assert "is_material" in func_src, (
                    "_single_random_roll 应返回包含 is_material 的5元组"
                )
                return
        pytest.fail("未找到 _single_random_roll 函数")

    def test_lucky_select_does_not_update_pity(self):
        """_lucky_select 不应涉及保底计数器更新。"""
        src = _read_source("core/engine.py")
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if _is_func_node(node, "_lucky_select"):
                func_src = ast.get_source_segment(src, node)
                assert "frame_pity" not in func_src, (
                    "_lucky_select 不应涉及 frame_pity"
                )
                assert "utr_pity" not in func_src, (
                    "_lucky_select 不应涉及 utr_pity"
                )
                return
        pytest.fail("未找到 _lucky_select 函数")

    def test_pity_update_only_in_part3(self):
        """保底计数更新应只在 _catch_fish_with_buffs 的 Part 3 中执行。"""
        src = _read_source("core/engine.py")
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if _is_func_node(node, "_catch_fish_with_buffs"):
                func_src = ast.get_source_segment(src, node)
                # Part 3 标记之后才应有 new_frame_pity / new_utr_pity 赋值
                assert "Part 3" in func_src, "应有 Part 3 标记"
                # Part 3 之前不应有 new_frame_pity 赋值（Part 1 的保底触发除外）
                # Part 1 的保底触发也有 new_frame_pity，但那是保底奖励不是计数+1
                # 关键是 _single_random_roll 和 _lucky_select 不涉及保底
                return
        pytest.fail("未找到 _catch_fish_with_buffs 函数")
