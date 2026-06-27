import base64
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


API_DIR = Path(__file__).resolve().parents[1] / "services" / "api"
sys.path.insert(0, str(API_DIR))

from app import lambda_handler  # noqa: E402
from voice import generate_voice_audio  # noqa: E402


def invoke(route_key: str, method: str, path: str, body: dict | None = None) -> dict:
    response = lambda_handler(
        {
            "routeKey": route_key,
            "rawPath": path,
            "requestContext": {"http": {"method": method}},
            "body": json.dumps(body or {}),
        },
        None,
    )
    return {"statusCode": response["statusCode"], "body": json.loads(response["body"])}


class VoiceTest(unittest.TestCase):
    def test_voice_route_returns_audio_payload(self) -> None:
        payload = {
            "provider": "elevenlabs",
            "voiceName": "Eric",
            "contentType": "audio/mpeg",
            "audioBase64": base64.b64encode(b"mp3").decode("ascii"),
        }
        with patch("app.generate_voice_audio", return_value=payload):
            response = invoke("POST /voice", "POST", "/voice", {"text": "hello"})

        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(response["body"]["provider"], "elevenlabs")
        self.assertEqual(response["body"]["voiceName"], "Eric")

    def test_generate_voice_audio_encodes_audio(self) -> None:
        with (
            patch.dict("os.environ", {"ELEVENLABS_API_KEY": "test-key", "ELEVENLABS_VOICE_NAME": "Eric"}, clear=False),
            patch("voice._resolve_voice_id", return_value="voice-id"),
            patch("voice._post_audio", return_value=b"fake-mp3"),
        ):
            payload = generate_voice_audio("hello world")

        self.assertEqual(payload["provider"], "elevenlabs")
        self.assertEqual(payload["contentType"], "audio/mpeg")
        self.assertEqual(base64.b64decode(payload["audioBase64"]), b"fake-mp3")


if __name__ == "__main__":
    unittest.main()
