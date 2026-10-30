# -*- coding: utf-8 -*-
"""
Publish the app to a Hugging Face Space (Streamlit SDK, free CPU).

    HF_TOKEN=hf_...  python tool/push_space.py [owner/space-name]

- Creates the Space if needed (public), uploads the repo minus heavy/ignored paths,
  and prepends the Space front-matter to README.md on the Hub copy only.
- Set NEBIUS_API_KEY (and optionally TAVILY_API_KEY) as Space *secrets* in the
  Space settings — this script does that too when the env vars are present.
"""
from __future__ import annotations

import os
import pathlib
import sys
import tempfile

from dotenv import load_dotenv
from huggingface_hub import HfApi

ROOT = pathlib.Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

repo_id = sys.argv[1] if len(sys.argv) > 1 else "ItMaj/rehab-copilot"
token = os.environ.get("HF_TOKEN")
if not token:
    sys.exit("HF_TOKEN missing (write token from https://huggingface.co/settings/tokens)")

api = HfApi(token=token)
api.create_repo(repo_id, repo_type="space", space_sdk="streamlit", exist_ok=True, private=False)

FRONT = """---
title: Rehab Copilot
emoji: 🦶
colorFrom: indigo
colorTo: purple
sdk: streamlit
sdk_version: "1.58.0"
app_file: app/app.py
pinned: false
license: mit
short_description: Evidence Q&A + daily routine after ankle cartilage surgery
---

"""
with tempfile.TemporaryDirectory() as tmp:
    readme = pathlib.Path(tmp) / "README.md"
    readme.write_text(FRONT + (ROOT / "README.md").read_text(encoding="utf-8"), encoding="utf-8")
    api.upload_folder(
        repo_id=repo_id, repo_type="space", folder_path=str(ROOT),
        ignore_patterns=[".venv/*", ".git/*", "corpus/raw/*", "corpus/index/*", "eval/_reports/*",
                         "README.md", ".env", "*.pyc", "__pycache__/*", ".DS_Store", "build/*"],
        commit_message="Deploy Rehab Copilot",
    )
    api.upload_file(path_or_fileobj=str(readme), path_in_repo="README.md",
                    repo_id=repo_id, repo_type="space", commit_message="Space front-matter")

for key in ("NEBIUS_API_KEY", "TAVILY_API_KEY"):
    if os.environ.get(key):
        api.add_space_secret(repo_id, key, os.environ[key])
        print("secret set:", key)
print(f"https://huggingface.co/spaces/{repo_id}")
