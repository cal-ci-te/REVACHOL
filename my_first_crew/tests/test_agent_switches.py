# -*- coding: utf-8 -*-
"""Agent 级开关测试：CREW_DISABLE_<AGENT_ID> 语义、pass-through 行为矩阵与流程不中断保证。

覆盖点（对齐 Reviewer 的 P1 整改要求）：
1. 布尔语义统一：1/true/yes/on 表示禁用，0/false/no/off 与空值不禁用；
2. 每个 Agent 被禁用时其阶段被跳过，且不触碰 LLM；
3. 六个 Agent 全部禁用时流程仍能完整走通、不抛异常。
"""

import re
from pathlib import Path

import pytest

from flows.document_review_flow import (
    DocumentReviewFlow,
    _AGENT_DISABLE_TRUTHY,
    _agent_disabled,
)

ALL_AGENTS = ["planner", "text_processor", "coder", "csser", "reviewer", "document_admin"]


def _clear_env(monkeypatch):
    """清空所有 Agent 开关环境变量，避免宿主机环境污染断言。"""
    for agent_id in ALL_AGENTS:
        monkeypatch.delenv(f"CREW_DISABLE_{agent_id.upper()}", raising=False)


# ============================================================
# 布尔语义
# ============================================================


@pytest.mark.parametrize("value", ["1", "true", "yes", "on", "TRUE", "Yes", " 1 ", "ON"])
def test_truthy_values_disable_agent(monkeypatch, value):
    """真值字面量统一表示禁用。"""
    _clear_env(monkeypatch)
    monkeypatch.setenv("CREW_DISABLE_CODER", value)
    assert _agent_disabled("coder") is True


@pytest.mark.parametrize("value", ["0", "false", "no", "off", "FALSE"])
def test_falsy_values_keep_agent_enabled(monkeypatch, value):
    """假值字面量不构成禁用。"""
    _clear_env(monkeypatch)
    monkeypatch.setenv("CREW_DISABLE_CODER", value)
    assert _agent_disabled("coder") is False


def test_missing_or_empty_env_keeps_agent_enabled(monkeypatch):
    """未设置或空值即启用（Python 侧约定）。"""
    _clear_env(monkeypatch)
    assert _agent_disabled("coder") is False
    monkeypatch.setenv("CREW_DISABLE_CODER", "")
    assert _agent_disabled("coder") is False


def test_agent_ids_are_case_insensitive_in_env_name(monkeypatch):
    """环境变量名由 Agent ID 大写生成。"""
    _clear_env(monkeypatch)
    monkeypatch.setenv("CREW_DISABLE_TEXT_PROCESSOR", "1")
    assert _agent_disabled("text_processor") is True
    assert _agent_disabled("planner") is False


def test_disabled_agents_are_not_built(monkeypatch):
    """被禁用的 Agent 不构建，避免加载其凭据与客户端。"""
    _clear_env(monkeypatch)
    monkeypatch.setenv("CREW_DISABLE_CSSER", "1")
    flow = DocumentReviewFlow(emitter=None, save_snapshots=False)
    # 只验证 csser 被剔除；其余 Agent 的实际构建依赖各供应商凭据，此处不触发
    flow._agents = {}
    built = flow._ensure_agents()
    assert "csser" not in built


# ============================================================
# pass-through 行为矩阵
# ============================================================


def test_planner_disabled_falls_back_to_requirement(monkeypatch):
    """Planner 禁用时以需求原文兜底，保证下游 plan 非空。"""
    _clear_env(monkeypatch)
    monkeypatch.setenv("CREW_DISABLE_PLANNER", "1")
    flow = DocumentReviewFlow(emitter=None, save_snapshots=False)
    flow.state.requirement = "测试需求"
    flow._run_planning()
    assert flow.state.plan.strip()
    assert "测试需求" in flow.state.plan


def test_text_processor_disabled_passes_requirement_through(monkeypatch):
    """TextProcessor 禁用时把需求原文当作初稿。"""
    _clear_env(monkeypatch)
    monkeypatch.setenv("CREW_DISABLE_TEXT_PROCESSOR", "1")
    flow = DocumentReviewFlow(emitter=None, save_snapshots=False)
    flow.state.requirement = "原始需求文本"
    flow._run_drafting()
    assert flow.state.document == "原始需求文本"


def test_coder_disabled_keeps_upstream_document(monkeypatch):
    """Coder 禁用时保留上游文档原样。"""
    _clear_env(monkeypatch)
    monkeypatch.setenv("CREW_DISABLE_CODER", "1")
    flow = DocumentReviewFlow(emitter=None, save_snapshots=False)
    flow.state.document = "上游文档"
    flow._run_coding()
    assert flow.state.document == "上游文档"


def test_reviewer_disabled_records_approved_entry(monkeypatch):
    """Reviewer 禁用时写入显式批准记录，使路由判定为通过。"""
    _clear_env(monkeypatch)
    monkeypatch.setenv("CREW_DISABLE_REVIEWER", "1")
    flow = DocumentReviewFlow(emitter=None, save_snapshots=False)
    flow._run_reviewing()
    assert len(flow.state.review_history) == 1
    entry = flow.state.review_history[-1]
    assert entry["approved"] is True
    assert entry["review_standard"] == "reviewer-disabled"
    assert flow.state.review_feedback == ""


def test_document_admin_disabled_does_not_raise(monkeypatch):
    """Document_Admin 禁用时合入阶段直接返回，不抛异常。"""
    _clear_env(monkeypatch)
    monkeypatch.setenv("CREW_DISABLE_DOCUMENT_ADMIN", "1")
    flow = DocumentReviewFlow(emitter=None, save_snapshots=False)
    flow.state.document = "文档"
    flow._run_merging()  # 不抛异常即通过


# ============================================================
# 全禁用不中断
# ============================================================


def test_all_agents_disabled_flow_still_completes(monkeypatch):
    """六个 Agent 全禁用时各阶段依序走通，且不构建任何 Agent。"""
    _clear_env(monkeypatch)
    for agent_id in ALL_AGENTS:
        monkeypatch.setenv(f"CREW_DISABLE_{agent_id.upper()}", "1")

    flow = DocumentReviewFlow(emitter=None, save_snapshots=False)
    flow.state.requirement = "全禁用测试需求"

    assert flow._ensure_agents() == {}

    flow._run_planning()
    flow._run_drafting()
    flow._run_coding()
    flow._run_reviewing()
    flow._run_merging()

    assert flow.state.plan.strip()
    assert flow.state.document.strip()
    assert flow.state.review_history[-1]["approved"] is True


def test_partial_disable_only_skips_disabled_agent(monkeypatch):
    """仅禁用部分 Agent 时，未禁用者的阶段守卫不应误跳过。"""
    _clear_env(monkeypatch)
    monkeypatch.setenv("CREW_DISABLE_CODER", "1")
    monkeypatch.setenv("CREW_DISABLE_REVIEWER", "1")

    flow = DocumentReviewFlow(emitter=None, save_snapshots=False)
    flow.state.requirement = "部分禁用"
    flow.state.document = "部分禁用"

    # 未禁用的 Agent 守卫必须返回 False（本用例不实际执行其阶段，避免真实 LLM 调用）
    assert flow._agent_off("planner") is False
    assert flow._agent_off("text_processor") is False
    assert flow._agent_off("coder") is True
    assert flow._agent_off("reviewer") is True

    flow._run_coding()
    flow._run_reviewing()

    # coder 与 reviewer 走了 pass-through
    assert flow.state.document == "部分禁用"
    assert flow.state.review_history[-1]["review_standard"] == "reviewer-disabled"


def test_node_and_python_truthy_sets_stay_in_sync():
    """Python 与 Node 两侧的禁用字面量集合必须一致。"""
    node_source = (
        Path(__file__).resolve().parents[2] / "backend" / "agent-state.cjs"
    ).read_text(encoding="utf-8")
    match = re.search(r"const TRUTHY = \[(.*?)\];", node_source, re.S)
    assert match, "未在 backend/agent-state.cjs 中找到 TRUTHY 定义"
    node_truthy = set(re.findall(r"'([^']+)'", match.group(1)))
    assert node_truthy == _AGENT_DISABLE_TRUTHY
