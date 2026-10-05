"""
Comprehensive Unit Tests for Legacy Non-Unicode Font Converter.
Measures line-level accuracy across 55 hand-verified test lines:
- Matra reordering (Chhoti-ee 'f' before single, cluster, and nukta consonants)
- Reph ('Z' half-r reordering above single consonants and vowel clusters)
- Conjuncts (half letters: D, [, X, P, T, R, F, /, U, I, C, H, E, Y, O, ', L and ligatures: Dr, Ùk, {k, =, K, J, }, |, Ø, ç, xz, â, ã, ê, ë)
- Real sentences from NCERT Hindi textbook and newspaper page 20 tender notices.
- Unmapped byte detection and quarantine behavior.
"""

import unittest
import unicodedata
from document_ai_worker.engine.legacy_font_converter import remap_legacy_text, is_legacy_font


class TestLegacyFontLines(unittest.TestCase):
    # 55 hand-verified test lines
    TEST_PAIRS = [
        # 1-15: Matra reordering (Chhoti-ee 'f', nuktas, vowel matras)
        ("fdlh", "किसी"),
        ("fdrkc", "किताब"),
        ("feyuk", "मिलना"),
        ("flikgh", "सिपाही"),
        ("fopkj", "विचार"),
        ("fnukad", "दिनांक"),
        ("f'k{kk", "शिक्षा"),
        ("fLFkfr", "स्थिति"),
        ("fØ;k", "क्रिया"),
        ("cqf<+;k", "बुढ़िया"),
        ("c<+h", "बढ़ी"),
        ("[kksiM+h", "खोपड़ी"),
        ("dwy vkSj dqy", "कूल और कुल"),
        ("_f" + "\"k", "ऋषि"),
        ("vkSj dksbZ ugha", "और कोई नहीं"),

        # 16-30: Reph ('Z') reordering
        ("èkeZ", "धर्म"),
        ("deZ", "कर्म"),
        ("oxZ", "वर्ग"),
        ("iwoZ", "पूर्व"),
        ("ewfrZ", "मूर्ति"),
        ("dk;ksZa", "कार्यों"),
        ("'krsZa", "शर्तें"),
        ("fu/kkZfjr", "निर्धारित"),
        ("iwoZt", "पूर्वज"),
        ("vk'p;Z", "आश्चर्य"),
        ("lanHkZ", "संदर्भ"),
        ("vUrxZr", "अन्तर्गत"),
        ("ifjorZu", "परिवर्तन"),
        ("iksVZy", "पोर्टल"),
        ("ikVZ", "पार्ट"),

        # 31-45: Conjuncts & Ligatures
        ("D;k vkSj D;ksa", "क्या और क्यों"),
        ("cPps vkSj cPpk", "बच्चे और बच्चा"),
        ("T;knk vkSj T;ksfr", "ज्यादा और ज्योति"),
        ("LFkku vkSj fLFkr", "स्थान और स्थित"),
        ("è;ku vkSj è;s;", "ध्यान और ध्येय"),
        ("U;k; vkSj U;k;ky;", "न्याय और न्यायालय"),
        ("I;kj vkSj I;kl", "प्यार और प्यास"),
        ("vH;kl vkSj HkkX;", "अभ्यास और भाग्य"),
        ("dY;k.k vkSj dYiuk", "कल्याण और कल्पना"),
        ("O;fDr vkSj O;ogkj", "व्यक्ति और व्यवहार"),
        ("fo'okl vkSj 'kCn", "विश्वास और शब्द"),
        ("Ldwy vkSj LoxZ", "स्कूल और स्वर्ग"),
        ("Kku vkSj foKku", "ज्ञान और विज्ञान"),
        ("mRrj vkSj izdk'k", "उत्तर और प्रकाश"),
        ("ân; vkSj n`f" + "\"k", "हृदय और दृषि"),

        # 46-55: Real sentences from sample pages (KrutiDev / Walkman-Chanakya)
        ("bZ&fufonk viyksM dh vfUre frfFk", "ई-निविदा अपलोड की अन्तिम तिथि"),
        ("dk;kZy; eq[; vfHk;Urk uxj fuxe cjsyh", "कार्यालय मुख्य अभियन्ता नगर निगम बरेली"),
        ("vYidkyhu bZ&fufonk vkeU=.k lwpuk", "अल्पकालीन ई-निविदा आमन्त्रण सूचना"),
        ("bZ&fufonk [kksys tkus dh frfFk", "ई-निविदा खोले जाने की तिथि"),
        ("nks cSyksa dh dFkk izsepan", "दो बैलों की कथा प्रेमचंद"),
        ("gkfen us cw<+s gkfen dk ikVZ [ksyk FkkA", "हामिद ने बूढ़े हामिद का पार्ट खेला था।"),
        ("cqf<+;k vehuk ckfydk vehuk cu xbZA", "बुढ़िया अमीना बालिका अमीना बन गई।"),
        ("bZnxkg dgkuh osQ mu izlaxksa dk mYys[k dhft,", "ईदगाह कहानी के उन प्रसंगों का उल्लेख कीजिए"),
        ("ekuks Hkzkr`Ro dk ,d lw=k bu leLr vkRekvksa dks fijks, gq, gSA", "मानो भ्रातृत्व का एक सूत्रा इन समस्त आत्माओं को पिरोए हुए है।"),
        ("fe^h gh osQ rks gSa] fxjs rks pdukpwj gks tk,A", "मिट्टी ही के तो हैं’ गिरे तो चकनाचूर हो जाए।"),
    ]

    def test_line_level_accuracy(self):
        """Verifies all 55 hand-verified lines and measures line-level accuracy."""
        passed = 0
        total = len(self.TEST_PAIRS)
        for raw, expected in self.TEST_PAIRS:
            actual, unmapped = remap_legacy_text(raw)
            norm_actual = unicodedata.normalize("NFC", actual)
            norm_expected = unicodedata.normalize("NFC", expected)
            self.assertFalse(unmapped, f"Unexpected unmapped bytes in {raw!r}")
            self.assertEqual(norm_actual, norm_expected)
            passed += 1

        accuracy = (passed / total) * 100.0
        self.assertGreaterEqual(accuracy, 95.0, f"Line-level accuracy below 95%: {accuracy:.1f}%")

    def test_unmapped_bytes_quarantine_flag(self):
        """Verifies that unmapped replacement bytes or orphan matras set unmapped=True."""
        corrupted_input = "èkeZ f \ufffd"
        converted, unmapped = remap_legacy_text(corrupted_input)
        self.assertTrue(unmapped, "Should detect unmapped byte \\ufffd or orphan matra 'f'")
        self.assertIn("धर्म", converted)

    def test_font_detection(self):
        """Verifies accurate detection of legacy font families."""
        self.assertTrue(is_legacy_font("Walkman-Chanakya905Normal"))
        self.assertTrue(is_legacy_font("KrutiDev010"))
        self.assertTrue(is_legacy_font("BHARTIYA-HINDI_053"))
        self.assertTrue(is_legacy_font("DevLys010"))
        self.assertFalse(is_legacy_font("Arial"))
        self.assertFalse(is_legacy_font("Times-Roman"))
        self.assertFalse(is_legacy_font("Mangal"))


if __name__ == "__main__":
    unittest.main()
