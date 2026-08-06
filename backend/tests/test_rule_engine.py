"""
Unit tests for declarative RuleEngine parsing in scripts/rule_engine.py
"""

from pathlib import Path
import sys

import pytest

# Ensure scripts directory is on sys.path
SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from rule_engine import RuleEngine  # noqa: E402


@pytest.fixture
def engine():
    rules_path = SCRIPTS_DIR / "import_rules.yaml"
    return RuleEngine(rules_path=rules_path)


def test_enako_japanese(engine):
    filename = "えなこ「極彩色の乙女が目指した風景」【月チャンデジグラ】 02.JPG"
    creators, title, auto = engine.parse(filename)
    assert creators == ["えなこ"]
    assert title == "極彩色の乙女が目指した風景"
    assert auto is True


def test_kitaro(engine):
    filename = "【Kitaro_绮太郎】少女前线云图计划—奇塔Mp7 - IMG_12345.jpg"
    creators, title, auto = engine.parse(filename)
    assert creators == ["Kitaro_绮太郎"]
    assert title == "少女前线云图计划—奇塔Mp7"
    assert auto is True


def test_jiuqi_miao(engine):
    filename = "九柒喵 pa15超高校级心跳物语 - 01_1.jpg"
    creators, title, auto = engine.parse(filename)
    assert creators == ["九柒喵"]
    assert title == "pa15超高校级心跳物语"
    assert auto is True


def test_aqua_no_prefix(engine):
    filename = "207 - Aqua Summer (55 Pics) 006.jpg"
    creators, title, auto = engine.parse(filename)
    assert creators == ["Aqua"]
    assert title == "207 - Aqua Summer"
    assert auto is True


def test_shimo_single(engine):
    filename = "霜月shimo High-leg Maid - a01.jpg"
    creators, title, auto = engine.parse(filename)
    assert creators == ["霜月shimo"]
    assert title == "High-leg Maid"
    assert auto is True


def test_xiuren(engine):
    filename = "XIUREN No.11152 Twins-桃桃 XIUREN-No.11152-Twins-Taotao-MissKON.com-017.jpg"
    creators, title, auto = engine.parse(filename)
    assert creators == ["Twins-桃桃"]
    assert title == "XIUREN No.11152"
    assert auto is True


def test_youmi(engine):
    filename = "YouMi Vol.1183 桃桃·夭夭twins - YouMi-Vol.1183-...-MissKON.com-013.jpg"
    creators, title, auto = engine.parse(filename)
    assert creators == ["桃桃·夭夭twins"]
    assert title == "YouMi Vol.1183"
    assert auto is True


def test_mtcos(engine):
    filename = "[MTCos] 喵糖映画 Vol.068 kitaro_绮太郎 阳光宅女 - MTCos-Vol.068-...-MrCong.com-003.jpg"
    creators, title, auto = engine.parse(filename)
    assert creators == ["kitaro_绮太郎"]
    assert title == "喵糖映画 Vol.068 阳光宅女"
    assert auto is True


def test_saint_slug(engine):
    filename = "SAINT-Photolife-Zenny-Romance-2- - SAINT-Photolife-Zenny-Romance-2-010.jpg"
    creators, title, auto = engine.parse(filename)
    assert creators == ["Zenny"]
    assert title == "SAINT Photolife - Romance 2"
    assert auto is True


def test_coser_space(engine):
    filename = "Coser 蜜汁猫裘 Vol.028 - Coser-Mi-zhi-mao-qiu-Vol.028-MrCong.com-001.jpg"
    creators, title, auto = engine.parse(filename)
    assert creators == ["蜜汁猫裘"]
    assert title == "Vol.028"
    assert auto is True


def test_a_yixuan(engine):
    filename = "A.Yixuan儀玄 - YS (11).jpg"
    creators, title, auto = engine.parse(filename)
    assert creators == ["A.Yixuan儀玄"]
    assert title == "YS"
    assert auto is True


def test_c_maoin(engine):
    filename = "C.Maoin Y2K貓音 - MN (1).jpg"
    creators, title, auto = engine.parse(filename)
    assert creators == ["C.Maoin"]
    assert title == "Y2K貓音"
    assert auto is True


def test_luna_bracket(engine):
    filename = "[尊みを感じて桜井] LUNA XXX - LUNA_s020.jpg"
    creators, title, auto = engine.parse(filename)
    assert creators == ["LUNA"]
    assert title == "XXX"
    assert auto is True


def test_zzyuri_gr(engine):
    filename = "Zzyuri_GR01 - Zzyuri_GR01_15.jpg"
    creators, title, auto = engine.parse(filename)
    assert creators == ["Zzyuri"]
    assert title == "GR01"
    assert auto is True


def test_g44(engine):
    filename = "G44不会受伤 - Bunny Girl [15P-200MB] - 01.jpg"
    creators, title, auto = engine.parse(filename)
    assert creators == ["G44不会受伤"]
    assert title == "Bunny Girl"
    assert auto is True


def test_coser_at(engine):
    filename = "Coser@Alice & Bob - Maid Special - Source-001.jpg"
    creators, title, auto = engine.parse(filename)
    assert creators == ["Alice", "Bob"]
    assert title == "Maid Special"
    assert auto is True


def test_unknown_fallback(engine):
    filename = "random_unmatched_file_name_12345.jpg"
    creators, title, auto = engine.parse(filename)
    assert creators == ["UNKNOWN"]
    assert title == filename
    assert auto is False
