#!/usr/bin/env python3
"""Run the pinned A38 review gate for one exact pull-request head.

The guard identity is read from the committed per-repository map next to this
file, which is always the trusted default-branch checkout. A repository
without a map entry, or a login the API cannot resolve as a bot, fails closed.
An otherwise passing gate also requires the first-review comment that the
gate itself selected to declare exactly ``--head`` in its JSON block.
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.parse
from pathlib import Path

from agent_cli import a38_guard, a38_review
from agent_cli.a38_guard import GuardError, GitHubApi
from agent_cli.a38_review import parse_review_block
from agent_cli.pr_guard_config import one_review_for


class GuardIdentityApi:
    """Delegate the guard API while naming the A38 guard bot as its own user."""

    def __init__(self, api: GitHubApi, login: str) -> None:
        self._api = api
        self._login = login

    def resolve_own_user(self) -> tuple[int, str]:
        status, data = self._api.get_optional(f"/users/{urllib.parse.quote(self._login)}")
        user_id = data.get("id") if isinstance(data, dict) else None
        if status != 200 or type(user_id) is not int or user_id <= 0:
            raise GuardError("A38 guard identity unavailable")
        if data.get("login") != self._login or data.get("type") != "Bot":
            raise GuardError("A38 guard identity mismatch")
        return user_id, self._login

    def __getattr__(self, name: str):
        return getattr(self._api, name)


def guard_login_for(repo: str) -> str:
    """Read the guard login for this repository from the trusted map."""
    path = Path(__file__).resolve().with_name("guard-identities.json")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - any read failure fails closed
        raise RuntimeError("guard identity map unavailable") from exc
    if not isinstance(data, dict):
        raise RuntimeError("guard identity map is not an object")
    login = data.get(repo)
    if (
        not isinstance(login, str)
        or not login
        or login != login.strip()
        or any(character in login for character in "/\\")
        or any(character.isspace() for character in login)
    ):
        raise RuntimeError("guard identity missing for this repository")
    return login


def _selected_review_head_reasons(api, repo: str, head: str, snap, comments) -> list[str]:
    """Require the comment the gate selected to declare this exact head."""
    helpers = ("select_review_comment", "review_rules_bound", "_head_committed_at", "_covering_review_heads")
    if any(not hasattr(a38_review, name) for name in helpers):
        raise RuntimeError("review gate helper unavailable")
    rules_bound = a38_review.review_rules_bound(api, repo, snap.base_sha)
    if rules_bound is None:
        return ["review rules unavailable"]
    committed_at = a38_review._head_committed_at(api, repo, head)
    if committed_at is None:
        return ["review commit time unavailable"]
    guard_user_id, _login = api.resolve_own_user()
    covered, unread = a38_review._covering_review_heads(
        api,
        repo,
        head,
        comments,
        base_sha=snap.base_sha,
        author_id=snap.author_id,
        guard_user_id=guard_user_id,
    )
    covered[head] = committed_at
    comment, selected = a38_review.select_review_comment(
        comments,
        author_id=snap.author_id,
        guard_user_id=guard_user_id,
        committed_at=committed_at,
        head=head,
        markdown_only=False,
        rules_bound=rules_bound,
        covered_at=covered,
        ancestry_unavailable=unread,
    )
    if selected:
        return [str(reason) for reason in selected]
    if not isinstance(comment, dict):
        return ["first review comment missing"]
    body = comment.get("body")
    try:
        payload = parse_review_block(body if isinstance(body, str) else "")
    except Exception:  # noqa: BLE001 - an unreadable record fails closed
        return ["first review comment head does not match the pull request head"]
    if not isinstance(payload, dict) or payload.get("head") != head:
        return ["first review comment head does not match the pull request head"]
    return []


def evaluate(repo: str, number: int, head: str, token: str, guard_login: str) -> tuple[bool, list[str]]:
    try:
        base_api = GitHubApi(token)
        api = GuardIdentityApi(base_api, guard_login)
        snap = a38_guard.fetch_pull(api, repo, number)
        if snap.state != "open":
            return False, ["pull request is not open"]
        if snap.head_sha != head:
            return False, ["pull request head changed"]
        trusted = a38_guard.resolve_trusted_guard_config(api, snap)
        comments = a38_guard.collect_comments(api, repo, number)
        ok, reasons = a38_review.evaluate_review_gate(
            api,
            repo=repo,
            number=number,
            head=head,
            base_sha=snap.base_sha,
            author_id=snap.author_id,
            comments=comments,
            markdown_only=False,
            one_review_author=one_review_for(trusted.config, snap.author_login),
        )
        if ok:
            exact_reasons = _selected_review_head_reasons(api, repo, head, snap, comments)
            if exact_reasons:
                return False, exact_reasons
        return ok, reasons
    except Exception as exc:  # noqa: BLE001 - unreadable review state must fail closed
        return False, [f"review gate error: {exc}"]


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--pr", required=True, type=int)
    parser.add_argument("--head", required=True)
    args = parser.parse_args(argv)
    try:
        token = os.environ.get("GH_TOKEN", "")
        if not token:
            raise RuntimeError("GH_TOKEN unavailable")
        ok, reasons = evaluate(args.repo, args.pr, args.head, token, guard_login_for(args.repo))
    except Exception as exc:  # noqa: BLE001 - every gate failure must be a closed verdict
        ok, reasons = False, [f"review gate error: {exc}"]
    print(json.dumps({"ok": bool(ok), "reasons": [str(reason) for reason in reasons]}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
