"""真多多药水与幸运药水互斥测试。

测试维度：
1. AST 静态测试：验证互斥检查存在，且发生在扣减药水之前（避免道具误扣）
2. 行为测试：验证互斥场景下拒绝使用且不消耗道具，无 buff 时两者均可正常使用

运行：
    cd C:\\Users\\Administrator\\Desktop\\zhenxun_bot-420
    .venv\\Scripts\\python.exe -m pytest zhenxun/plugins/zhenxun_plugin_fishing/tests/test_potion_mutex.py -v
"""

import ast
from pathlib import Path

from zhenxun.plugins.zhenxun_plugin_fishing.models import BuffEffect
from zhenxun.plugins.zhenxun_plugin_fishing.shop.potion_use import (
    use_duoduo_potion,
    use_lucky_potion,
)

PLUGIN_ROOT = Path(__file__).resolve().parent.parent
USER_ID = "test_mutex_001"


def _read_source(rel_path: str) -> str:
    full = PLUGIN_ROOT / rel_path
    with open(full, encoding="utf-8") as f:
        return f.read()


def _get_func_node(source: str, func_name: str):
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)) and node.name == func_name:
            return node
    return None


def _calls_in_func(func_node, attr_name: str):
    """返回函数体内调用 attr_name 的 (lineno, 涉及的 BuffEffect 常量名集合) 列表。"""
    hits = []
    for sub in ast.walk(func_node):
        if isinstance(sub, ast.Call):
            cur = sub.func
            parts = []
            while isinstance(cur, ast.Attribute):
                parts.append(cur.attr)
                cur = cur.value
            if isinstance(cur, ast.Name):
                parts.append(cur.id)
            name = ".".join(reversed(parts))
            if attr_name in name:
                buff_args = set()
                for arg in sub.args:
                    if isinstance(arg, ast.Attribute):
                        buff_args.add(arg.attr)
                hits.append((sub.lineno, buff_args))
    return hits


# ────────────────────────────────────────────────────────────
# 1. AST 静态测试 —— 不依赖运行时，直接校验源码结构
# ────────────────────────────────────────────────────────────


class TestMutexAST:
    """静态验证互斥逻辑结构：检查存在且先于扣减。"""

    def test_lucky_checks_duoduo_before_remove(self):
        src = _read_source("shop/potion_use.py")
        func = _get_func_node(src, "use_lucky_potion")
        assert func is not None
        mutex_calls = _calls_in_func(func, "get_active_user_buff")
        remove_calls = _calls_in_func(func, "remove_item")
        assert any(
            "BUFF_TYPE_DUODUO" in args for _, args in mutex_calls
        ), "use_lucky_potion 应在扣减前检查 BUFF_TYPE_DUODUO"
        mutex_line = min(ln for ln, args in mutex_calls if "BUFF_TYPE_DUODUO" in args)
        assert remove_calls, "use_lucky_potion 应调用 remove_item"
        assert mutex_line < remove_calls[0][0], "互斥检查必须在扣减药水之前"

    def test_duoduo_checks_lucky_before_remove(self):
        src = _read_source("shop/potion_use.py")
        func = _get_func_node(src, "use_duoduo_potion")
        assert func is not None
        mutex_calls = _calls_in_func(func, "get_active_user_buff")
        remove_calls = _calls_in_func(func, "remove_item")
        assert any(
            "BUFF_TYPE_LUCKY_BOOST" in args for _, args in mutex_calls
        ), "use_duoduo_potion 应在扣减前检查 BUFF_TYPE_LUCKY_BOOST"
        mutex_line = min(
            ln for ln, args in mutex_calls if "BUFF_TYPE_LUCKY_BOOST" in args
        )
        assert remove_calls
        assert mutex_line < remove_calls[0][0], "互斥检查必须在扣减药水之前"

    def test_mutex_message_present(self):
        src = _read_source("shop/potion_use.py")
        assert "同一时间只有1种药水可以生效" in src


# ────────────────────────────────────────────────────────────
# 2. 行为测试 —— 通过内存 mock DB 验证互斥拒绝与道具不消耗
# ────────────────────────────────────────────────────────────


class TestMutexBehavior:
    async def test_lucky_blocked_when_duoduo_active(self, db):
        await db.user_get_or_create(USER_ID)
        await db.items_add(USER_ID, "幸运药水", "potion", 5)
        await db.buff_add_user_buff(
            USER_ID, BuffEffect.BUFF_TYPE_DUODUO, 480, 1, "真多多药水"
        )
        ok, msg = await use_lucky_potion(USER_ID)
        assert ok is False
        assert "同一时间只有1种药水可以生效" in msg
        item = await db.items_get_item(USER_ID, "幸运药水", "potion")
        assert item["count"] == 5  # 未消耗

    async def test_duoduo_blocked_when_lucky_active(self, db):
        await db.user_get_or_create(USER_ID)
        await db.items_add(USER_ID, "真多多药水", "potion", 3)
        await db.buff_add_user_buff(
            USER_ID, BuffEffect.BUFF_TYPE_LUCKY_BOOST, 480, 1, "幸运药水"
        )
        ok, msg = await use_duoduo_potion(USER_ID)
        assert ok is False
        assert "同一时间只有1种药水可以生效" in msg
        item = await db.items_get_item(USER_ID, "真多多药水", "potion")
        assert item["count"] == 3  # 未消耗

    async def test_lucky_usable_without_duoduo(self, db):
        await db.user_get_or_create(USER_ID)
        await db.items_add(USER_ID, "幸运药水", "potion", 1)
        ok, msg = await use_lucky_potion(USER_ID)
        assert ok is True
        item = await db.items_get_item(USER_ID, "幸运药水", "potion")
        assert item is None  # 消耗完

    async def test_duoduo_usable_without_lucky(self, db):
        await db.user_get_or_create(USER_ID)
        await db.items_add(USER_ID, "真多多药水", "potion", 1)
        ok, msg = await use_duoduo_potion(USER_ID)
        assert ok is True
        item = await db.items_get_item(USER_ID, "真多多药水", "potion")
        assert item is None  # 消耗完

    async def test_use_lucky_then_duoduo_blocked(self, db):
        await db.user_get_or_create(USER_ID)
        await db.items_add(USER_ID, "幸运药水", "potion", 1)
        await db.items_add(USER_ID, "真多多药水", "potion", 1)
        ok1, _ = await use_lucky_potion(USER_ID)
        assert ok1 is True
        # 幸运生效中，多多应被拒绝
        ok2, msg2 = await use_duoduo_potion(USER_ID)
        assert ok2 is False
        assert "同一时间只有1种药水可以生效" in msg2
        item = await db.items_get_item(USER_ID, "真多多药水", "potion")
        assert item["count"] == 1  # 未消耗

    async def test_use_duoduo_then_lucky_blocked(self, db):
        await db.user_get_or_create(USER_ID)
        await db.items_add(USER_ID, "幸运药水", "potion", 1)
        await db.items_add(USER_ID, "真多多药水", "potion", 1)
        ok1, _ = await use_duoduo_potion(USER_ID)
        assert ok1 is True
        # 多多生效中，幸运应被拒绝
        ok2, msg2 = await use_lucky_potion(USER_ID)
        assert ok2 is False
        assert "同一时间只有1种药水可以生效" in msg2
        item = await db.items_get_item(USER_ID, "幸运药水", "potion")
        assert item["count"] == 1  # 未消耗
