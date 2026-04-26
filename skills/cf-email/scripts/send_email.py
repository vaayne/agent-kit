#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "click",
#     "rich",
#     "requests",
# ]
# ///

import base64
import json
import logging
import mimetypes
import os
from pathlib import Path

import click
import requests
from rich.console import Console
from rich.logging import RichHandler

LOG_DIR = Path(".agents/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    datefmt="[%X]",
    handlers=[
        RichHandler(console=Console(stderr=True)),
        logging.FileHandler(LOG_DIR / "cf-email.log"),
    ],
)
logger = logging.getLogger(__name__)

CF_API_BASE = "https://api.cloudflare.com/client/v4"


def _build_attachment(path: str) -> dict:
    p = Path(path)
    if not p.exists():
        raise click.BadParameter(f"Attachment not found: {path}")
    mime, _ = mimetypes.guess_type(str(p))
    mime = mime or "application/octet-stream"
    content = base64.b64encode(p.read_bytes()).decode()
    return {
        "content": content,
        "filename": p.name,
        "type": mime,
        "disposition": "attachment",
    }


def _send(account_id: str, token: str, payload: dict) -> dict:
    url = f"{CF_API_BASE}/accounts/{account_id}/email/sending/send"
    resp = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


@click.command()
@click.option(
    "--to",
    "recipients",
    multiple=True,
    required=True,
    help="Recipient address (repeatable)",
)
@click.option("--cc", "cc_list", multiple=True, help="CC address (repeatable)")
@click.option("--bcc", "bcc_list", multiple=True, help="BCC address (repeatable)")
@click.option("--from-address", required=True, help="Sender address")
@click.option("--from-name", default="", help="Sender display name")
@click.option("--reply-to", "reply_to", default="", help="Reply-to address")
@click.option("--subject", required=True, help="Email subject")
@click.option("--text", "body_text", default="", help="Plain text body")
@click.option(
    "--html", "body_html", default="", help="HTML body or @file.html to read from file"
)
@click.option(
    "--attach", "attachments", multiple=True, help="File path to attach (repeatable)"
)
@click.option(
    "--header",
    "headers",
    multiple=True,
    help="Custom header as 'Key: Value' (repeatable)",
)
@click.option("--dry-run", is_flag=True, help="Print payload without sending")
def main(
    recipients: tuple,
    cc_list: tuple,
    bcc_list: tuple,
    from_address: str,
    from_name: str,
    reply_to: str,
    subject: str,
    body_text: str,
    body_html: str,
    attachments: tuple,
    headers: tuple,
    dry_run: bool,
) -> None:
    if not body_text and not body_html:
        raise click.UsageError("At least one of --text or --html is required.")

    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not dry_run:
        if not account_id:
            raise click.UsageError(
                "CLOUDFLARE_ACCOUNT_ID environment variable is required."
            )
        if not token:
            raise click.UsageError(
                "CLOUDFLARE_API_TOKEN environment variable is required."
            )

    # Read HTML from file if prefixed with @
    html_body = body_html
    if html_body.startswith("@"):
        html_file = Path(html_body[1:])
        if not html_file.exists():
            raise click.BadParameter(f"HTML file not found: {html_file}")
        html_body = html_file.read_text()

    sender: str | dict = from_address
    if from_name:
        sender = {"address": from_address, "name": from_name}

    payload: dict = {
        "to": list(recipients) if len(recipients) > 1 else recipients[0],
        "from": sender,
        "subject": subject,
    }

    if body_text:
        payload["text"] = body_text
    if html_body:
        payload["html"] = html_body
    if cc_list:
        payload["cc"] = list(cc_list) if len(cc_list) > 1 else cc_list[0]
    if bcc_list:
        payload["bcc"] = list(bcc_list) if len(bcc_list) > 1 else bcc_list[0]
    if reply_to:
        payload["reply_to"] = reply_to

    if attachments:
        payload["attachments"] = [_build_attachment(a) for a in attachments]

    if headers:
        parsed_headers: dict = {}
        for h in headers:
            if ":" not in h:
                raise click.BadParameter(f"Header must be 'Key: Value', got: {h!r}")
            k, _, v = h.partition(":")
            parsed_headers[k.strip()] = v.strip()
        payload["headers"] = parsed_headers

    if dry_run:
        logger.info("[DRY RUN] Payload that would be sent:")
        click.echo(json.dumps(payload, indent=2))
        return

    logger.info("Sending email to %s via Cloudflare...", recipients)
    try:
        result = _send(account_id, token, payload)
    except requests.HTTPError as exc:
        logger.error("HTTP error: %s — %s", exc.response.status_code, exc.response.text)
        raise SystemExit(1) from exc

    if not result.get("success"):
        for err in result.get("errors", []):
            logger.error("API error %s: %s", err.get("code"), err.get("message"))
        raise SystemExit(1)

    r = result.get("result", {})
    delivered = r.get("delivered", [])
    queued = r.get("queued", [])
    bounced = r.get("permanent_bounces", [])

    if delivered:
        logger.info("Delivered: %s", ", ".join(delivered))
    if queued:
        logger.info("Queued: %s", ", ".join(queued))
    if bounced:
        logger.warning("Permanent bounces: %s", ", ".join(bounced))


if __name__ == "__main__":
    main()
