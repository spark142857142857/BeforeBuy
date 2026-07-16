from __future__ import annotations

import io
import re
import time
import warnings
import zipfile
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

import requests
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning


DART_BASE = "https://opendart.fss.or.kr/api"
ANNUAL_REPORT = re.compile(r"사업보고서")
REPORT_PERIOD = re.compile(r"\((\d{4})\.(\d{2})\)")
ATTACHMENT_ONLY_MARKERS = ("[첨부정정]", "[첨부추가]")
BUSINESS_START = re.compile(r"^(?:Ⅱ|II|2)[.\s]*사업의\s*내용", re.IGNORECASE)
BUSINESS_END = re.compile(r"^(?:Ⅲ|III|3)[.\s]*(?:재무에\s*관한\s*사항|재무정보)", re.IGNORECASE)


@dataclass(frozen=True)
class DartCorp:
    corp_code: str
    corp_name: str
    corp_eng_name: str
    stock_code: str
    modify_date: str


class DartError(RuntimeError):
    pass


def report_period(report: dict[str, Any]) -> tuple[int, int]:
    match = REPORT_PERIOD.search(str(report.get("report_nm", "")))
    return (int(match.group(1)), int(match.group(2))) if match else (0, 0)


def annual_report_candidates(reports: list[dict[str, Any]]) -> list[dict[str, Any]]:
    eligible = [
        report
        for report in reports
        if (
            ANNUAL_REPORT.search(str(report.get("report_nm", "")))
            and not any(
                marker in str(report.get("report_nm", ""))
                for marker in ATTACHMENT_ONLY_MARKERS
            )
        )
    ]
    ordered: list[dict[str, Any]] = []
    for period in sorted({report_period(report) for report in eligible}, reverse=True):
        same_period = [report for report in eligible if report_period(report) == period]
        same_period.sort(
            key=lambda report: (
                0 if "[기재정정]" in str(report.get("report_nm", "")) else 1,
                -int(str(report.get("rcept_dt", "0")) or "0"),
                -int(str(report.get("rcept_no", "0")) or "0"),
            )
        )
        ordered.extend(same_period)
    return ordered


class DartClient:
    def __init__(self, api_key: str, *, delay: float = 0.18) -> None:
        if not api_key:
            raise DartError("DART_API_KEY is missing")
        self.api_key = api_key
        self.delay = delay
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "BeforeBuy/0.1 data-pipeline"})

    def _pause(self) -> None:
        if self.delay:
            time.sleep(self.delay)

    def corp_codes(self) -> list[DartCorp]:
        response = self.session.get(
            f"{DART_BASE}/corpCode.xml",
            params={"crtfc_key": self.api_key},
            timeout=60,
        )
        response.raise_for_status()
        try:
            archive = zipfile.ZipFile(io.BytesIO(response.content))
        except zipfile.BadZipFile as error:
            raise DartError("DART corp code response is not a ZIP file") from error

        xml_name = next((name for name in archive.namelist() if name.lower().endswith(".xml")), None)
        if not xml_name:
            raise DartError("DART corp code ZIP does not contain XML")

        root = ElementTree.fromstring(archive.read(xml_name))
        corps: list[DartCorp] = []
        for item in root.findall("list"):
            stock_code = (item.findtext("stock_code") or "").strip().upper()
            if not stock_code:
                continue
            corps.append(
                DartCorp(
                    corp_code=(item.findtext("corp_code") or "").strip(),
                    corp_name=(item.findtext("corp_name") or "").strip(),
                    corp_eng_name=(item.findtext("corp_eng_name") or "").strip(),
                    stock_code=stock_code,
                    modify_date=(item.findtext("modify_date") or "").strip(),
                )
            )
        return corps

    def annual_reports(self, corp_code: str) -> list[dict[str, Any]]:
        begin = (date.today() - timedelta(days=850)).strftime("%Y%m%d")
        response = self.session.get(
            f"{DART_BASE}/list.json",
            params={
                "crtfc_key": self.api_key,
                "corp_code": corp_code,
                "bgn_de": begin,
                "pblntf_ty": "A",
                "sort": "date",
                "sort_mth": "desc",
                "page_count": 100,
            },
            timeout=30,
        )
        self._pause()
        response.raise_for_status()
        payload = response.json()
        if payload.get("status") == "013":
            return []
        if payload.get("status") != "000":
            raise DartError(f"DART list failed: {payload.get('status')} {payload.get('message')}")

        return annual_report_candidates(payload.get("list", []))

    def document_files(self, receipt_no: str) -> list[tuple[str, bytes]]:
        response = self.session.get(
            f"{DART_BASE}/document.xml",
            params={"crtfc_key": self.api_key, "rcept_no": receipt_no},
            timeout=60,
        )
        self._pause()
        response.raise_for_status()
        try:
            archive = zipfile.ZipFile(io.BytesIO(response.content))
        except zipfile.BadZipFile as error:
            try:
                root = ElementTree.fromstring(response.content)
                status = (root.findtext("status") or "unknown").strip()
                message = (root.findtext("message") or "not a ZIP file").strip()
                detail = f"{status} {message}"
            except ElementTree.ParseError:
                detail = "not a ZIP file"
            raise DartError(f"DART document {receipt_no} failed: {detail}") from error
        return [
            (name, archive.read(name))
            for name in archive.namelist()
            if Path(name).suffix.lower() in {".xml", ".xhtml", ".html", ".htm"}
        ]


def decode_document(content: bytes) -> str:
    for encoding in ("utf-8", "cp949", "euc-kr"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="ignore")


def clean_lines(markup: str) -> list[str]:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", XMLParsedAsHTMLWarning)
        soup = BeautifulSoup(markup, "lxml")
    for element in soup(["script", "style"]):
        element.decompose()
    raw = soup.get_text("\n")
    lines = []
    for line in raw.splitlines():
        value = re.sub(r"\s+", " ", line).strip()
        if value:
            lines.append(value)
    return lines


def extract_business_section(files: list[tuple[str, bytes]], *, max_chars: int = 30_000) -> str:
    candidates: list[str] = []
    for _, content in files:
        lines = clean_lines(decode_document(content))
        starts = [index for index, line in enumerate(lines) if BUSINESS_START.search(line)]
        for start in starts:
            end = next(
                (index for index in range(start + 1, len(lines)) if BUSINESS_END.search(lines[index])),
                min(len(lines), start + 1_500),
            )
            section = "\n".join(lines[start:end]).strip()
            if len(section) >= 500:
                candidates.append(section)

    if not candidates:
        return ""
    return max(candidates, key=len)[:max_chars]
