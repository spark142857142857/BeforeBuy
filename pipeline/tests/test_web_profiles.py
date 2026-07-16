from __future__ import annotations

import sys
import unittest
from pathlib import Path


PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE))

from prepare_web_profiles import preferred_base_name  # noqa: E402


class WebProfileTest(unittest.TestCase):
    def test_normalizes_preferred_share_names(self) -> None:
        self.assertEqual(preferred_base_name("CJ4우(전환)"), "CJ")
        self.assertEqual(preferred_base_name("DL이앤씨2우(전환)"), "DL이앤씨")
        self.assertEqual(preferred_base_name("JW중외제약2우B"), "JW중외제약")
        self.assertEqual(preferred_base_name("LG전자우"), "LG전자")
