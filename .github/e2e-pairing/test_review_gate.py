import importlib.util
import io
import json
import sys
import types
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
MODULE_PATH = HERE / "review-gate.py"
APP_REPO = "DFXswiss/app"
BACKEND_REPO = "DFXswiss/backend"
HEAD = "a" * 40
BASE = "b" * 40


class GuardError(Exception):
    pass


class Snapshot:
    def __init__(self, *, state="open", head_sha=HEAD, base_sha=BASE, author_id=7, author_login="author"):
        self.state = state
        self.head_sha = head_sha
        self.base_sha = base_sha
        self.author_id = author_id
        self.author_login = author_login


class FakeApi:
    def __init__(self, token=None, *, user_status=200, user=None, comments=None):
        self.token = token
        self.user_status = user_status
        self.user = user if user is not None else {"id": 99, "login": "github-actions[bot]", "type": "Bot"}
        self.comments = comments if comments is not None else [{"body": '{"head":"' + HEAD + '"}'}]
        self.optional_calls = []
        self.closed = False

    def get_optional(self, path):
        self.optional_calls.append(path)
        if path.startswith("/users/"):
            return self.user_status, self.user if self.user_status == 200 else None
        return 404, None

    def close(self):
        self.closed = True


def install_fake_modules(*, ok=True, reasons=None, config=None):
    gate_calls = []
    selected = {"comment": {"body": '{"head":"' + HEAD + '"}'}, "reasons": []}

    a38_guard = types.ModuleType("agent_cli.a38_guard")
    a38_guard.GuardError = GuardError
    a38_guard.GitHubApi = FakeApi
    a38_guard.collect_comments = lambda api, repo, number: api.comments
    a38_guard.fetch_pull = lambda api, repo, number: Snapshot()
    a38_guard.resolve_trusted_guard_config = lambda api, snap: types.SimpleNamespace(config=config or {"repo": "cfg"})

    a38_review = types.ModuleType("agent_cli.a38_review")

    def evaluate_review_gate(api, **kwargs):
        gate_calls.append(kwargs)
        return ok, list(reasons or [])

    a38_review.evaluate_review_gate = evaluate_review_gate
    a38_review.parse_review_block = lambda body: json.loads(body)
    a38_review.review_rules_bound = lambda api, repo, base_sha: {"rules": True}
    a38_review._head_committed_at = lambda api, repo, head: "2026-01-01T00:00:00Z"
    a38_review._covering_review_heads = lambda api, repo, head, comments, **kwargs: ({}, False)
    a38_review.select_review_comment = lambda comments, **kwargs: (selected["comment"], list(selected["reasons"]))

    pr_guard_config = types.ModuleType("agent_cli.pr_guard_config")
    pr_guard_config.one_review_for = lambda config, login: {"login": login}

    agent_cli = types.ModuleType("agent_cli")
    agent_cli.a38_guard = a38_guard
    agent_cli.a38_review = a38_review
    agent_cli.pr_guard_config = pr_guard_config

    sys.modules["agent_cli"] = agent_cli
    sys.modules["agent_cli.a38_guard"] = a38_guard
    sys.modules["agent_cli.a38_review"] = a38_review
    sys.modules["agent_cli.pr_guard_config"] = pr_guard_config
    return {"gate_calls": gate_calls, "selected": selected}


def load_review_gate():
    spec = importlib.util.spec_from_file_location("review_gate_under_test", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ReviewGateTests(unittest.TestCase):
    def setUp(self):
        self.fakes = install_fake_modules()
        self.gate = load_review_gate()

    def test_gate_ok(self):
        ok, reasons = self.gate.evaluate(APP_REPO, 12, HEAD, "token", "github-actions[bot]")
        self.assertTrue(ok)
        self.assertEqual(reasons, [])
        self.assertEqual(self.fakes["gate_calls"][0]["repo"], APP_REPO)
        self.assertEqual(self.fakes["gate_calls"][0]["one_review_author"], {"login": "author"})

    def test_gate_fails_with_reasons(self):
        sys.modules["agent_cli.a38_review"].evaluate_review_gate = lambda api, **kwargs: (False, ["missing review", "wrong head"])
        ok, reasons = self.gate.evaluate(APP_REPO, 12, HEAD, "token", "github-actions[bot]")
        self.assertFalse(ok)
        self.assertEqual(reasons, ["missing review", "wrong head"])

    def test_selected_comment_head_must_match(self):
        self.fakes["selected"]["comment"] = {"body": '{"head":"' + "c" * 40 + '"}'}
        ok, reasons = self.gate.evaluate(APP_REPO, 12, HEAD, "token", "github-actions[bot]")
        self.assertFalse(ok)
        self.assertEqual(reasons, ["first review comment head does not match the pull request head"])

        self.fakes["selected"]["comment"] = {"body": "not json"}
        ok, reasons = self.gate.evaluate(APP_REPO, 12, HEAD, "token", "github-actions[bot]")
        self.assertFalse(ok)
        self.assertEqual(reasons, ["first review comment head does not match the pull request head"])

    def test_unknown_guard_login_fails(self):
        with mock.patch.object(self.gate, "GitHubApi", lambda token: FakeApi(user_status=404)):
            ok, reasons = self.gate.evaluate(APP_REPO, 12, HEAD, "token", "unknown[bot]")
        self.assertFalse(ok)
        self.assertEqual(reasons, ["review gate error: A38 guard identity unavailable"])

    def test_guard_login_for_each_repository(self):
        self.assertEqual(self.gate.guard_login_for(APP_REPO), "github-actions[bot]")
        self.assertEqual(self.gate.guard_login_for(BACKEND_REPO), "dfxswiss-pr-guard[bot]")

    def test_missing_or_invalid_identity_map_fails_closed(self):
        with mock.patch.object(Path, "read_text", side_effect=OSError("missing")):
            with self.assertRaisesRegex(RuntimeError, "guard identity map unavailable"):
                self.gate.guard_login_for(APP_REPO)
        with mock.patch.object(Path, "read_text", return_value="[]"):
            with self.assertRaisesRegex(RuntimeError, "not an object"):
                self.gate.guard_login_for(APP_REPO)
        for value in (None, "", " bot", "bo t", "bo/t", "bo\\t", "bot\nname", 1):
            with mock.patch.object(Path, "read_text", return_value=json.dumps({APP_REPO: value})):
                with self.assertRaisesRegex(RuntimeError, "guard identity missing"):
                    self.gate.guard_login_for(APP_REPO)
        with mock.patch.object(Path, "read_text", return_value=json.dumps({BACKEND_REPO: "bot"})):
            with self.assertRaisesRegex(RuntimeError, "guard identity missing"):
                self.gate.guard_login_for(APP_REPO)

    def test_guard_identity_api_validates_user_shape(self):
        api = FakeApi()
        wrapper = self.gate.GuardIdentityApi(api, "github-actions[bot]")
        self.assertEqual(wrapper.resolve_own_user(), (99, "github-actions[bot]"))
        self.assertEqual(api.optional_calls, ["/users/github-actions%5Bbot%5D"])
        self.assertIs(wrapper.comments, api.comments)

        cases = [
            (FakeApi(user_status=404), "unavailable"),
            (FakeApi(user={"id": 0, "login": "github-actions[bot]", "type": "Bot"}), "unavailable"),
            (FakeApi(user={"id": "99", "login": "github-actions[bot]", "type": "Bot"}), "unavailable"),
            (FakeApi(user={"id": 99, "login": "other", "type": "Bot"}), "mismatch"),
            (FakeApi(user={"id": 99, "login": "github-actions[bot]", "type": "User"}), "mismatch"),
        ]
        for fake, message in cases:
            with self.assertRaisesRegex(GuardError, message):
                self.gate.GuardIdentityApi(fake, "github-actions[bot]").resolve_own_user()

    def test_closed_or_moved_pull_fails_before_the_gate(self):
        sys.modules["agent_cli.a38_guard"].fetch_pull = lambda api, repo, number: Snapshot(state="closed")
        self.assertEqual(self.gate.evaluate(APP_REPO, 12, HEAD, "token", "github-actions[bot]"), (False, ["pull request is not open"]))
        sys.modules["agent_cli.a38_guard"].fetch_pull = lambda api, repo, number: Snapshot(head_sha="c" * 40)
        self.assertEqual(self.gate.evaluate(APP_REPO, 12, HEAD, "token", "github-actions[bot]"), (False, ["pull request head changed"]))

    def test_missing_helpers_and_rules_fail_closed(self):
        review = sys.modules["agent_cli.a38_review"]
        for name in ("select_review_comment", "review_rules_bound", "_head_committed_at", "_covering_review_heads"):
            saved = getattr(review, name)
            delattr(review, name)
            ok, reasons = self.gate.evaluate(APP_REPO, 12, HEAD, "token", "github-actions[bot]")
            self.assertFalse(ok)
            self.assertEqual(reasons, ["review gate error: review gate helper unavailable"])
            setattr(review, name, saved)

        review.review_rules_bound = lambda api, repo, base_sha: None
        ok, reasons = self.gate.evaluate(APP_REPO, 12, HEAD, "token", "github-actions[bot]")
        self.assertEqual((ok, reasons), (False, ["review rules unavailable"]))

        review.review_rules_bound = lambda api, repo, base_sha: {}
        review._head_committed_at = lambda api, repo, head: None
        ok, reasons = self.gate.evaluate(APP_REPO, 12, HEAD, "token", "github-actions[bot]")
        self.assertEqual((ok, reasons), (False, ["review commit time unavailable"]))

    def test_selection_failures_and_missing_comment(self):
        review = sys.modules["agent_cli.a38_review"]
        review.select_review_comment = lambda comments, **kwargs: (None, ["selected reason"])
        ok, reasons = self.gate.evaluate(APP_REPO, 12, HEAD, "token", "github-actions[bot]")
        self.assertEqual((ok, reasons), (False, ["selected reason"]))

        review.select_review_comment = lambda comments, **kwargs: (None, [])
        ok, reasons = self.gate.evaluate(APP_REPO, 12, HEAD, "token", "github-actions[bot]")
        self.assertEqual((ok, reasons), (False, ["first review comment missing"]))

        review.select_review_comment = lambda comments, **kwargs: ({"body": "{}"}, [])
        ok, reasons = self.gate.evaluate(APP_REPO, 12, HEAD, "token", "github-actions[bot]")
        self.assertEqual((ok, reasons), (False, ["first review comment head does not match the pull request head"]))

    def test_main_prints_verdict_and_handles_missing_token(self):
        output = io.StringIO()
        with mock.patch.dict(self.gate.os.environ, {"GH_TOKEN": "token"}, clear=True), mock.patch.object(
            self.gate,
            "GitHubApi",
            lambda token: FakeApi(token),
        ), mock.patch.object(
            self.gate, "guard_login_for", return_value="github-actions[bot]"
        ), redirect_stdout(output):
            self.assertEqual(self.gate.main(["--repo", APP_REPO, "--pr", "12", "--head", HEAD]), 0)
        self.assertEqual(json.loads(output.getvalue()), {"ok": True, "reasons": []})

        output = io.StringIO()
        with mock.patch.dict(self.gate.os.environ, {}, clear=True), redirect_stdout(output):
            self.assertEqual(self.gate.main(["--repo", APP_REPO, "--pr", "12", "--head", HEAD]), 0)
        self.assertEqual(json.loads(output.getvalue()), {"ok": False, "reasons": ["review gate error: GH_TOKEN unavailable"]})


if __name__ == "__main__":
    unittest.main()
