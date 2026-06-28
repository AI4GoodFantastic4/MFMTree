import base64
import json
import os
import re
import urllib.error
import urllib.request
from typing import Any


ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"
DEFAULT_VOICE_NAME = "Eric"
DEFAULT_MODEL_ID = "eleven_turbo_v2_5"
_cached_api_key: str | None = None
_cached_voice_id: str | None = None


class VoiceGenerationError(RuntimeError):
    pass


def generate_voice_audio(text: str) -> dict[str, Any]:
    cleaned = " ".join((text or "").split())
    if not cleaned:
        raise VoiceGenerationError("Text is required for voice generation.")
    if len(cleaned) > 1500:
        cleaned = cleaned[:1500]

    if os.environ.get("TTS_ENABLED", "true").lower() == "false":
        return _fallback_response(cleaned, "tts-disabled")

    audio: bytes | None = None
    alignment: list[dict[str, Any]]
    api_key = _elevenlabs_api_key()
    voice_name = os.environ.get("ELEVENLABS_VOICE_NAME", DEFAULT_VOICE_NAME)
    voice_id = os.environ.get("ELEVENLABS_VOICE_ID") or _resolve_voice_id(api_key, voice_name)
    try:
        audio, alignment = _post_audio_with_timestamps(api_key, voice_id, cleaned)
    except VoiceGenerationError:
        audio = _post_audio(api_key, voice_id, cleaned)
        alignment = _estimated_alignment(cleaned)

    return {
        "provider": "elevenlabs",
        "voiceName": voice_name,
        "contentType": "audio/mpeg",
        "mimeType": "audio/mpeg",
        "audioBase64": base64.b64encode(audio).decode("ascii"),
        "alignment": alignment,
        "normalizedText": cleaned,
        "fallback": False,
    }


def generate_voice_fallback(text: str, reason: str = "unavailable") -> dict[str, Any]:
    cleaned = " ".join((text or "").split())
    if len(cleaned) > 1500:
        cleaned = cleaned[:1500]
    return _fallback_response(cleaned, reason)


def _elevenlabs_api_key() -> str:
    global _cached_api_key
    if _cached_api_key:
        return _cached_api_key

    direct_key = os.environ.get("ELEVENLABS_API_KEY")
    if direct_key:
        _cached_api_key = direct_key
        return direct_key

    secret_name = os.environ.get("ELEVENLABS_SECRET_NAME")
    if not secret_name:
        raise VoiceGenerationError("ELEVENLABS_SECRET_NAME is not configured.")

    try:
        import boto3

        response = boto3.client("secretsmanager").get_secret_value(SecretId=secret_name)
        secret = response.get("SecretString") or ""
    except Exception as exc:
        raise VoiceGenerationError("Unable to read ElevenLabs API key secret.") from exc

    try:
        parsed = json.loads(secret)
        if isinstance(parsed, dict):
            secret = parsed.get("ELEVENLABS_API_KEY") or parsed.get("apiKey") or parsed.get("api_key") or ""
    except json.JSONDecodeError:
        pass

    if not secret:
        raise VoiceGenerationError("ElevenLabs API key secret is empty.")

    _cached_api_key = secret
    return secret


def _resolve_voice_id(api_key: str, voice_name: str) -> str:
    global _cached_voice_id
    if _cached_voice_id:
        return _cached_voice_id

    request = urllib.request.Request(
        f"{ELEVENLABS_API_BASE}/voices",
        headers={"xi-api-key": api_key, "accept": "application/json"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise VoiceGenerationError("Unable to list ElevenLabs voices.") from exc

    voices = payload.get("voices", []) if isinstance(payload, dict) else []
    lowered_name = voice_name.lower()
    exact = next((voice for voice in voices if str(voice.get("name", "")).lower() == lowered_name), None)
    contains = next((voice for voice in voices if lowered_name in str(voice.get("name", "")).lower()), None)
    eric = next((voice for voice in voices if "eric" in str(voice.get("name", "")).lower()), None)
    selected = exact or contains or eric
    if not selected or not selected.get("voice_id"):
        raise VoiceGenerationError(f"ElevenLabs voice not found: {voice_name}")

    _cached_voice_id = str(selected["voice_id"])
    return _cached_voice_id


def _post_audio(api_key: str, voice_id: str, text: str) -> bytes:
    payload = json.dumps(
        {
            "text": text,
            "model_id": os.environ.get("ELEVENLABS_MODEL_ID", DEFAULT_MODEL_ID),
            "voice_settings": {
                "stability": 0.48,
                "similarity_boost": 0.82,
                "style": 0.18,
                "use_speaker_boost": True,
            },
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{ELEVENLABS_API_BASE}/text-to-speech/{voice_id}?output_format=mp3_44100_128",
        data=payload,
        headers={
            "xi-api-key": api_key,
            "accept": "audio/mpeg",
            "content-type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")[:300]
        raise VoiceGenerationError(f"ElevenLabs voice generation failed: HTTP {exc.code} {detail}") from exc
    except Exception as exc:
        raise VoiceGenerationError("ElevenLabs voice generation failed.") from exc


def _post_audio_with_timestamps(api_key: str, voice_id: str, text: str) -> tuple[bytes, list[dict[str, Any]]]:
    payload = json.dumps(
        {
            "text": text,
            "model_id": os.environ.get("ELEVENLABS_MODEL_ID", DEFAULT_MODEL_ID),
            "voice_settings": {
                "stability": 0.48,
                "similarity_boost": 0.82,
                "style": 0.18,
                "use_speaker_boost": True,
            },
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{ELEVENLABS_API_BASE}/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128",
        data=payload,
        headers={
            "xi-api-key": api_key,
            "accept": "application/json",
            "content-type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")[:300]
        raise VoiceGenerationError(f"ElevenLabs timestamped voice failed: HTTP {exc.code} {detail}") from exc
    except Exception as exc:
        raise VoiceGenerationError("ElevenLabs timestamped voice generation failed.") from exc

    audio_base64 = payload.get("audio_base64") or payload.get("audioBase64")
    if not audio_base64:
        raise VoiceGenerationError("ElevenLabs timestamped voice response did not include audio.")

    audio = base64.b64decode(audio_base64)
    raw_alignment = payload.get("normalized_alignment") or payload.get("alignment") or {}
    alignment = _word_alignment_from_elevenlabs(text, raw_alignment) or _estimated_alignment(text)
    return audio, alignment


def _word_alignment_from_elevenlabs(text: str, raw_alignment: dict[str, Any]) -> list[dict[str, Any]]:
    characters = raw_alignment.get("characters")
    starts = (
        raw_alignment.get("character_start_times_seconds")
        or raw_alignment.get("character_start_times_ms")
        or raw_alignment.get("char_start_times_ms")
        or []
    )
    ends = (
        raw_alignment.get("character_end_times_seconds")
        or raw_alignment.get("character_end_times_ms")
        or raw_alignment.get("char_end_times_ms")
        or []
    )
    if not isinstance(characters, list) or not isinstance(starts, list) or not isinstance(ends, list):
        return []
    if not characters or len(starts) < len(characters) or len(ends) < len(characters):
        return []

    timing_is_seconds = any("seconds" in str(key) for key in raw_alignment.keys())
    segments: list[dict[str, Any]] = []
    for match in re.finditer(r"\S+", text):
        start_index = match.start()
        end_index = match.end() - 1
        if start_index >= len(starts) or end_index >= len(ends):
            continue
        start_ms = _timing_to_ms(starts[start_index], timing_is_seconds)
        end_ms = _timing_to_ms(ends[end_index], timing_is_seconds)
        if end_ms <= start_ms:
            end_ms = start_ms + 200
        segments.append({"startMs": start_ms, "endMs": end_ms, "text": match.group(0)})
    return segments


def _timing_to_ms(value: Any, seconds: bool) -> int:
    numeric = float(value or 0)
    return int(round(numeric * 1000 if seconds else numeric))


def _estimated_alignment(text: str) -> list[dict[str, Any]]:
    words = list(re.finditer(r"\S+", text))
    ms_per_word = 60000 / 155
    return [
        {
            "startMs": int(round(index * ms_per_word)),
            "endMs": int(round((index + 1) * ms_per_word)),
            "text": match.group(0),
        }
        for index, match in enumerate(words)
    ]


def _fallback_response(text: str, reason: str) -> dict[str, Any]:
    return {
        "provider": "fallback",
        "voiceName": os.environ.get("ELEVENLABS_VOICE_NAME", DEFAULT_VOICE_NAME),
        "contentType": "audio/mpeg",
        "mimeType": "audio/mpeg",
        "audioBase64": "",
        "alignment": _estimated_alignment(text),
        "normalizedText": text,
        "fallback": True,
        "reason": reason,
    }
