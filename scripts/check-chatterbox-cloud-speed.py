#!/usr/bin/env python3
"""Benchmark the real Chatterbox HTTP contract against an interactive cloud target.

The script is deliberately non-invasive: it never starts, stops, or restarts the
worker.  It exercises only GET /health and POST /v1/synthesize, the same public
loopback interface used by FE Monster.  A fixed Chinese corpus and fixed seed
make before/after measurements comparable once the worker supports seeded
generation.

Exit status is 1 while any target is unmet, making this both a benchmark and a
RED/GREEN performance gate.  The JSON report is still written on RED.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import ctypes
from ctypes import wintypes
from dataclasses import dataclass
from datetime import datetime
import hashlib
import http.client
import io
import json
import math
import os
from pathlib import Path
import platform
import re
import statistics
import subprocess
import threading
import time
from urllib.parse import urlsplit
import wave


FIXED_SEED = 20_260_814
COLD_TEXT = "愿你今天从容坚定，事事顺心。"
WARM_UNCACHED_TEXT = "别着急，我们已经找到方向了，接下来一步一步把问题解决好。"
CONCURRENT_CASES = (
    ("cheerful", "太棒了，这次进步很明显！"),
    ("calm", "我会陪你慢慢来，别担心。"),
)
SEED_PROBE_TEXT = "固定随机种子探针。"
CACHED_CUE_TEXT = "嗯……我想一下。"

# These are end-user latency targets, not values derived from the current
# implementation.  They represent a cloud-like interactive local TTS budget.
TARGETS = {
    "coldStartupMs": 15_000.0,
    "uncachedRequestMs": 3_000.0,
    "uncachedRtf": 0.60,
    "cacheHitMs": 150.0,
    "cachedCueFirstAudioMs": 150.0,
    "concurrency2P95Ms": 5_000.0,
    "concurrency2MinRps": 0.50,
}


class BenchmarkError(RuntimeError):
    pass


class HttpStatusError(BenchmarkError):
    def __init__(self, status: int, payload: bytes):
        self.status = int(status)
        self.payload = payload
        try:
            parsed = json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            parsed = None
        self.response_json = parsed
        super().__init__(f"HTTP {status}: {payload[:300]!r}")


def _round(value: float | int | None, digits: int = 1):
    if value is None:
        return None
    return round(float(value), digits)


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    rank = max(0, min(len(ordered) - 1, math.ceil(percentile * len(ordered)) - 1))
    return ordered[rank]


def _health_url(synthesize_url: str) -> str:
    parsed = urlsplit(synthesize_url)
    return f"{parsed.scheme}://{parsed.netloc}/health"


def _request(
    url: str,
    method: str,
    *,
    token: str = "",
    payload: dict | None = None,
    timeout_seconds: float = 180.0,
) -> tuple[int, dict[str, str], bytes, dict[str, float]]:
    parsed = urlsplit(url)
    if parsed.scheme != "http" or not parsed.hostname:
        raise BenchmarkError("benchmark URL must be an http URL")
    body = None
    headers = {"Accept": "application/json, audio/wav", "Connection": "close"}
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    if token:
        headers["Authorization"] = f"Bearer {token}"

    connection = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=timeout_seconds)
    started = time.perf_counter()
    try:
        connection.request(method, parsed.path or "/", body=body, headers=headers)
        response = connection.getresponse()
        headers_at = time.perf_counter()
        first = response.read(1)
        first_byte_at = time.perf_counter()
        remainder = response.read()
        finished = time.perf_counter()
        response_headers = {key.lower(): value for key, value in response.getheaders()}
        return (
            response.status,
            response_headers,
            first + remainder,
            {
                "responseHeadersMs": (headers_at - started) * 1000.0,
                "firstBodyByteMs": (first_byte_at - started) * 1000.0,
                "totalMs": (finished - started) * 1000.0,
            },
        )
    finally:
        connection.close()


def get_health(url: str, timeout_seconds: float = 10.0) -> dict:
    status, _, body, _ = _request(_health_url(url), "GET", timeout_seconds=timeout_seconds)
    if status != 200:
        raise HttpStatusError(status, body)
    try:
        health = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise BenchmarkError("/health did not return UTF-8 JSON") from exc
    if not health.get("ready"):
        raise BenchmarkError("Chatterbox worker is not ready")
    return health


def make_payload(text: str, style: str, request_group: str, seed: int | None) -> dict:
    payload = {
        "engine": "chatterbox",
        "text": text,
        "voice": "default",
        "kind": "content",
        "style": style,
        "shortUtterance": len(text) <= 16,
        "outputFormat": "wav",
        "requestGroup": request_group,
    }
    if seed is not None:
        payload["seed"] = int(seed)
    return payload


def make_cached_cue_payload() -> dict:
    """Build the exact prewarmed cue identity used by the live voice queue."""

    return {
        "engine": "chatterbox",
        "text": CACHED_CUE_TEXT,
        "voice": "default",
        "kind": "thinking-cue",
        "style": "thoughtful",
        "shortUtterance": True,
        "outputFormat": "wav",
        "exaggeration": 0.45,
        "cfgWeight": 0.55,
        "requestGroup": "cloud-gate-cached-cue",
        "cacheOnly": True,
    }


def _wav_contract(body: bytes) -> dict:
    try:
        with wave.open(io.BytesIO(body), "rb") as wav_file:
            sample_rate = wav_file.getframerate()
            frames = wav_file.getnframes()
            channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
    except (EOFError, wave.Error) as exc:
        raise BenchmarkError("synthesis response is not a readable WAV") from exc
    if sample_rate <= 0 or frames <= 0:
        raise BenchmarkError("synthesis response contains no playable audio")
    return {
        "container": body[:4].decode("ascii", errors="replace"),
        "sampleRate": sample_rate,
        "channels": channels,
        "sampleWidthBytes": sample_width,
        "frames": frames,
        "audioSeconds": frames / sample_rate,
    }


def synthesize(url: str, token: str, payload: dict, timeout_seconds: float) -> dict:
    status, headers, body, timing = _request(
        url,
        "POST",
        token=token,
        payload=payload,
        timeout_seconds=timeout_seconds,
    )
    if status != 200:
        raise HttpStatusError(status, body)
    wav = _wav_contract(body)
    audio_seconds = wav["audioSeconds"]
    return {
        "status": status,
        # The current endpoint returns headers only after whole-utterance
        # generation.  Therefore firstAudioByteMs is request latency, not a
        # claim of true streaming TTFA.
        "responseHeadersMs": _round(timing["responseHeadersMs"]),
        "firstAudioByteMs": _round(timing["firstBodyByteMs"]),
        "totalMs": _round(timing["totalMs"]),
        "audioSeconds": _round(audio_seconds, 3),
        "realTimeFactor": _round(timing["totalMs"] / 1000.0 / audio_seconds, 3),
        "bytes": len(body),
        "sha256": hashlib.sha256(body).hexdigest(),
        "contentType": headers.get("content-type", ""),
        "wav": {
            **wav,
            "audioSeconds": _round(audio_seconds, 3),
        },
    }


def probe_seed_support(url: str, token: str, timeout_seconds: float) -> dict:
    payload = make_payload(SEED_PROBE_TEXT, "natural", "cloud-gate-seed-probe", FIXED_SEED)
    try:
        sample = synthesize(url, token, payload, timeout_seconds)
        return {"supported": True, "status": 200, "sample": sample}
    except HttpStatusError as exc:
        response_error = exc.response_json.get("error", {}) if isinstance(exc.response_json, dict) else {}
        return {
            "supported": False,
            "status": exc.status,
            "errorCode": response_error.get("code"),
            "message": response_error.get("message"),
        }


def _counter_delta(before: dict, after: dict, name: str) -> int:
    return int(after.get(name, 0)) - int(before.get(name, 0))


def _find_listener_pid(port: int) -> int | None:
    if os.name != "nt":
        return None
    command = (
        "$c=Get-NetTCPConnection -State Listen -LocalPort "
        f"{int(port)} -ErrorAction SilentlyContinue | Select-Object -First 1;"
        "if($c){[Console]::Write($c.OwningProcess)}"
    )
    try:
        completed = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
        return int(completed.stdout.strip()) if completed.returncode == 0 and completed.stdout.strip() else None
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


if os.name == "nt":
    class _ProcessMemoryCountersEx(ctypes.Structure):
        _fields_ = [
            ("cb", wintypes.DWORD),
            ("PageFaultCount", wintypes.DWORD),
            ("PeakWorkingSetSize", ctypes.c_size_t),
            ("WorkingSetSize", ctypes.c_size_t),
            ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPagedPoolUsage", ctypes.c_size_t),
            ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
            ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
            ("PagefileUsage", ctypes.c_size_t),
            ("PeakPagefileUsage", ctypes.c_size_t),
            ("PrivateUsage", ctypes.c_size_t),
        ]


def _read_process_memory(pid: int | None) -> dict | None:
    if os.name != "nt" or not pid:
        return None
    process_query_information = 0x0400
    process_vm_read = 0x0010
    handle = ctypes.windll.kernel32.OpenProcess(
        process_query_information | process_vm_read, False, int(pid)
    )
    if not handle:
        return None
    try:
        counters = _ProcessMemoryCountersEx()
        counters.cb = ctypes.sizeof(counters)
        ok = ctypes.windll.psapi.GetProcessMemoryInfo(
            handle, ctypes.byref(counters), counters.cb
        )
        if not ok:
            return None
        mib = 1024.0 * 1024.0
        return {
            "workingSetMiB": counters.WorkingSetSize / mib,
            "privateMiB": counters.PrivateUsage / mib,
            "lifetimePeakWorkingSetMiB": counters.PeakWorkingSetSize / mib,
        }
    finally:
        ctypes.windll.kernel32.CloseHandle(handle)


@dataclass
class ResourceSampler:
    pid: int | None
    worker_device: str
    interval_seconds: float = 0.05

    def __post_init__(self):
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._samples = 0
        self._working_set_peak = 0.0
        self._private_peak = 0.0
        self._lifetime_peak = 0.0

    def start(self) -> None:
        self._sample()
        self._thread = threading.Thread(target=self._run, name="chatterbox-resource-sampler", daemon=True)
        self._thread.start()

    def _sample(self) -> None:
        memory = _read_process_memory(self.pid)
        if memory is None:
            return
        self._samples += 1
        self._working_set_peak = max(self._working_set_peak, memory["workingSetMiB"])
        self._private_peak = max(self._private_peak, memory["privateMiB"])
        self._lifetime_peak = max(self._lifetime_peak, memory["lifetimePeakWorkingSetMiB"])

    def _run(self) -> None:
        while not self._stop.wait(self.interval_seconds):
            self._sample()

    def finish(self) -> dict:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2)
        self._sample()
        cpu_worker = self.worker_device.lower() == "cpu"
        return {
            "pid": self.pid,
            "samples": self._samples,
            "sampleIntervalMs": _round(self.interval_seconds * 1000.0),
            "workingSetPeakMiB": _round(self._working_set_peak),
            "privatePeakMiB": _round(self._private_peak),
            "lifetimePeakWorkingSetMiB": _round(self._lifetime_peak),
            "gpuPeakMiB": 0.0 if cpu_worker else None,
            "gpuMeasurement": (
                "zero by contract: /health reports device=cpu"
                if cpu_worker
                else "unavailable without a vendor process telemetry provider"
            ),
        }


_LOG_LINE_RE = re.compile(
    r"^(?P<stamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) INFO (?P<message>.+)$"
)


def _parse_timestamp(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S,%f")


def latest_cold_start(worker_log: Path | None) -> dict:
    if worker_log is None or not worker_log.is_file():
        return {"measured": False, "reason": "worker log was not found; running service was not restarted"}
    listening: tuple[datetime, str] | None = None
    configured: tuple[datetime, str] | None = None
    completed: list[dict] = []
    for raw_line in worker_log.read_text(encoding="utf-8", errors="replace").splitlines():
        match = _LOG_LINE_RE.match(raw_line)
        if not match:
            continue
        stamp = _parse_timestamp(match.group("stamp"))
        message = match.group("message")
        if "PyTorch runtime configured" in message:
            configured = (stamp, raw_line)
        elif "worker listening on 127.0.0.1:9977" in message:
            listening = (stamp, raw_line)
        elif "worker is ready" in message and listening is not None and stamp >= listening[0]:
            item = {
                "measured": True,
                "source": str(worker_log),
                "listenToReadyMs": _round((stamp - listening[0]).total_seconds() * 1000.0),
                "listeningAt": listening[0].isoformat(timespec="milliseconds"),
                "readyAt": stamp.isoformat(timespec="milliseconds"),
            }
            if configured is not None and configured[0] <= stamp:
                item["runtimeConfigureToReadyMs"] = _round(
                    (stamp - configured[0]).total_seconds() * 1000.0
                )
                item["runtimeConfiguredAt"] = configured[0].isoformat(timespec="milliseconds")
            completed.append(item)
            listening = None
    if not completed:
        return {"measured": False, "reason": "no completed 9977 startup was found in worker log"}
    return completed[-1]


def _default_worker_log() -> Path | None:
    repo = Path(__file__).resolve().parent.parent
    candidate = repo.parent / f"{repo.name} server" / "data" / "chatterbox-worker" / "logs" / "worker.log"
    return candidate if candidate.is_file() else None


def _default_output() -> Path:
    # Keep generated artifacts beside this E-drive workspace.  Do not inherit
    # the user's system TEMP, which may live on a full C drive.
    repo = Path(__file__).resolve().parent.parent
    return repo / "tmp" / "chatterbox-bench" / "latest.json"


def _machine_summary() -> dict:
    summary = {
        "platform": platform.platform(),
        "processor": platform.processor(),
        "logicalCpuCount": os.cpu_count(),
    }
    if os.name != "nt":
        return summary
    command = (
        "$cpu=Get-CimInstance Win32_Processor|Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors;"
        "$gpus=@(Get-CimInstance Win32_VideoController|ForEach-Object {$_.Name});"
        "$ram=(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory;"
        "[pscustomobject]@{cpu=$cpu;gpus=$gpus;totalPhysicalMemory=$ram}|ConvertTo-Json -Compress -Depth 4"
    )
    try:
        completed = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if completed.returncode == 0 and completed.stdout.strip():
            summary["windowsHardware"] = json.loads(completed.stdout)
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
        pass
    return summary


def _run_concurrency(
    url: str, token: str, seed: int | None, timeout_seconds: float
) -> dict:
    barrier = threading.Barrier(len(CONCURRENT_CASES))

    def one(index: int, style: str, text: str) -> dict:
        barrier.wait()
        return synthesize(
            url,
            token,
            make_payload(text, style, f"cloud-gate-concurrent-{index + 1}", seed),
            timeout_seconds,
        )

    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=len(CONCURRENT_CASES)) as executor:
        futures = [
            executor.submit(one, index, style, text)
            for index, (style, text) in enumerate(CONCURRENT_CASES)
        ]
        samples = [future.result() for future in futures]
    wall_ms = (time.perf_counter() - started) * 1000.0
    latencies = [float(sample["totalMs"]) for sample in samples]
    return {
        "level": len(samples),
        "wallMs": _round(wall_ms),
        "p50Ms": _round(statistics.median(latencies)),
        "p95Ms": _round(_percentile(latencies, 0.95)),
        "throughputRequestsPerSecond": _round(len(samples) / (wall_ms / 1000.0), 3),
        "samples": samples,
    }


def _evaluate(report: dict) -> list[dict]:
    startup = report["coldStartup"]
    cold = report["coldUncached"]
    cache_hot = report["cacheHot"]
    cached_cue = report["cachedCueFirstAudio"]
    warm = report["warmUncached"]
    concurrency = report["concurrency"]
    checks = [
        ("fixedSeedAccepted", report["seedContract"]["supported"], report["seedContract"]),
        ("fixedSeedReproducible", warm["deterministic"], warm["sha256"]),
        (
            "coldStartupWithinCloudBudget",
            startup.get("measured") is True
            and float(startup.get("listenToReadyMs", math.inf)) <= TARGETS["coldStartupMs"],
            startup.get("listenToReadyMs"),
        ),
        ("coldRequestWasUncached", cold["completedDelta"] == 1 and cold["shortCacheHitsDelta"] == 0, cold),
        (
            "coldUncachedRequestWithinBudget",
            float(cold["sample"]["totalMs"]) <= TARGETS["uncachedRequestMs"],
            cold["sample"]["totalMs"],
        ),
        (
            "coldUncachedRtfWithinBudget",
            float(cold["sample"]["realTimeFactor"]) <= TARGETS["uncachedRtf"],
            cold["sample"]["realTimeFactor"],
        ),
        ("repeatRequestWasCacheHit", cache_hot["shortCacheHitsDelta"] == 1, cache_hot),
        (
            "cacheHitWithinBudget",
            float(cache_hot["sample"]["totalMs"]) <= TARGETS["cacheHitMs"],
            cache_hot["sample"]["totalMs"],
        ),
        (
            "cachedCueWasPrewarmed",
            cached_cue["cueCacheHitsDelta"] == 1,
            cached_cue,
        ),
        (
            "cachedCueFirstAudioWithinCloudBudget",
            float(cached_cue["sample"]["firstAudioByteMs"])
            <= TARGETS["cachedCueFirstAudioMs"],
            cached_cue["sample"]["firstAudioByteMs"],
        ),
        (
            "warmUncachedMedianWithinBudget",
            float(warm["medianTotalMs"]) <= TARGETS["uncachedRequestMs"],
            warm["medianTotalMs"],
        ),
        (
            "warmUncachedMedianRtfWithinBudget",
            float(warm["medianRtf"]) <= TARGETS["uncachedRtf"],
            warm["medianRtf"],
        ),
        (
            "concurrency2P95WithinBudget",
            float(concurrency["p95Ms"]) <= TARGETS["concurrency2P95Ms"],
            concurrency["p95Ms"],
        ),
        (
            "concurrency2ThroughputWithinBudget",
            float(concurrency["throughputRequestsPerSecond"]) >= TARGETS["concurrency2MinRps"],
            concurrency["throughputRequestsPerSecond"],
        ),
    ]
    return [
        {"name": name, "passed": bool(passed), "actual": actual}
        for name, passed, actual in checks
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:9977/v1/synthesize")
    parser.add_argument("--token", default=os.environ.get("FE_CHATTERBOX_TOKEN", ""))
    parser.add_argument("--seed", type=int, default=FIXED_SEED)
    parser.add_argument("--pid", type=int)
    parser.add_argument("--timeout-seconds", type=float, default=180.0)
    parser.add_argument("--worker-log", type=Path, default=_default_worker_log())
    parser.add_argument("--output", type=Path, default=_default_output())
    args = parser.parse_args()
    if args.timeout_seconds < 10 or args.timeout_seconds > 300:
        parser.error("--timeout-seconds must be between 10 and 300")

    parsed = urlsplit(args.url)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost"}:
        parser.error("--url must target the local loopback worker")
    port = parsed.port or 80
    pid = args.pid or _find_listener_pid(port)
    initial_health = get_health(args.url)
    cold_start = latest_cold_start(args.worker_log)
    seed_contract = probe_seed_support(args.url, args.token, args.timeout_seconds)
    effective_seed = args.seed if seed_contract["supported"] else None

    sampler = ResourceSampler(pid=pid, worker_device=str(initial_health.get("device", "")))
    sampler.start()
    try:
        before_cold = get_health(args.url)
        before_cue = before_cold
        cached_cue_sample = synthesize(
            args.url,
            args.token,
            make_cached_cue_payload(),
            args.timeout_seconds,
        )
        after_cue = get_health(args.url)
        cached_cue = {
            "text": CACHED_CUE_TEXT,
            "cueCacheHitsDelta": _counter_delta(before_cue, after_cue, "cacheHits"),
            "sample": cached_cue_sample,
        }

        before_cold = after_cue
        cold_sample = synthesize(
            args.url,
            args.token,
            make_payload(COLD_TEXT, "warm", "cloud-gate-cold", effective_seed),
            args.timeout_seconds,
        )
        after_cold = get_health(args.url)
        cold = {
            "text": COLD_TEXT,
            "completedDelta": _counter_delta(before_cold, after_cold, "completed"),
            "shortCacheHitsDelta": _counter_delta(before_cold, after_cold, "shortCacheHits"),
            "sample": cold_sample,
        }

        before_hot = after_cold
        cache_sample = synthesize(
            args.url,
            args.token,
            make_payload(COLD_TEXT, "warm", "cloud-gate-cache-hot", effective_seed),
            args.timeout_seconds,
        )
        after_hot = get_health(args.url)
        cache_hot = {
            "text": COLD_TEXT,
            "completedDelta": _counter_delta(before_hot, after_hot, "completed"),
            "shortCacheHitsDelta": _counter_delta(before_hot, after_hot, "shortCacheHits"),
            "sample": cache_sample,
        }

        warm_samples = [
            synthesize(
                args.url,
                args.token,
                make_payload(
                    WARM_UNCACHED_TEXT,
                    "thoughtful",
                    f"cloud-gate-warm-{index + 1}",
                    effective_seed,
                ),
                args.timeout_seconds,
            )
            for index in range(2)
        ]
        warm_uncached = {
            "text": WARM_UNCACHED_TEXT,
            "samples": warm_samples,
            "medianTotalMs": _round(statistics.median(item["totalMs"] for item in warm_samples)),
            "medianFirstAudioByteMs": _round(
                statistics.median(item["firstAudioByteMs"] for item in warm_samples)
            ),
            "medianRtf": _round(statistics.median(item["realTimeFactor"] for item in warm_samples), 3),
            "sha256": [item["sha256"] for item in warm_samples],
            "deterministic": warm_samples[0]["sha256"] == warm_samples[1]["sha256"],
        }
        concurrency = _run_concurrency(args.url, args.token, effective_seed, args.timeout_seconds)
    finally:
        resources = sampler.finish()

    final_health = get_health(args.url)
    report = {
        "schemaVersion": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "url": args.url,
        "fixedSeed": args.seed,
        "fixedCorpus": {
            "cold": COLD_TEXT,
            "warmUncached": WARM_UNCACHED_TEXT,
            "concurrent": [text for _, text in CONCURRENT_CASES],
        },
        "measurementSemantics": {
            "streaming": False,
            "firstAudioByte": "request latency because the current WAV endpoint buffers synthesis before headers",
            "coldStartup": "latest completed 9977 startup parsed from the existing worker log; service was not restarted",
            "coldUncached": "first fixed short request, confirmed by /health counter deltas",
            "cacheHot": "immediate identical repeat, confirmed by /health short-cache counter delta",
            "cachedCueFirstAudio": "the exact prewarmed non-answer cue published before novel Chatterbox content",
            "gpuPeak": "0 MiB when /health declares CPU; accelerator workers require vendor process telemetry",
        },
        "machine": _machine_summary(),
        "worker": {
            "initialHealth": initial_health,
            "finalHealth": final_health,
        },
        "seedContract": seed_contract,
        "coldStartup": cold_start,
        "coldUncached": cold,
        "cacheHot": cache_hot,
        "cachedCueFirstAudio": cached_cue,
        "warmUncached": warm_uncached,
        "concurrency": concurrency,
        "resources": resources,
        "targets": TARGETS,
    }
    report["checks"] = _evaluate(report)
    report["interactiveFirstAudioPassed"] = all(
        item["passed"]
        for item in report["checks"]
        if item["name"] in {
            "cachedCueWasPrewarmed",
            "cachedCueFirstAudioWithinCloudBudget",
        }
    )
    report["passed"] = all(item["passed"] for item in report["checks"])

    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding="utf-8")
    print(encoded, end="")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
