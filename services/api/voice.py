import base64
import json
import os
import urllib.error
import urllib.request
from typing import Any


ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"
DEFAULT_VOICE_NAME = "Eric"
DEFAULT_MODEL_ID = "eleven_multilingual_v2"
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

    api_key = _elevenlabs_api_key()
    voice_name = os.environ.get("ELEVENLABS_VOICE_NAME", DEFAULT_VOICE_NAME)
    voice_id = os.environ.get("ELEVENLABS_VOICE_ID") or _resolve_voice_id(api_key, voice_name)
    audio = _post_audio(api_key, voice_id, cleaned)
    return {
        "provider": "elevenlabs",
        "voiceName": voice_name,
        "contentType": "audio/mpeg",
        "audioBase64": base64.b64encode(audio).decode("ascii"),
    }


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
