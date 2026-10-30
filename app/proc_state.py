# -*- coding: utf-8 -*-
"""Process-wide state that must survive Streamlit's per-run script re-execution.

app.py is re-executed on every interaction and ui/i18n are reloaded on purpose, so a lock
defined there would be a fresh object each time. This module is imported once per server
process and never reloaded.
"""
import threading

# Serialises the heavy library load (FAISS index + chunk store + embedding model) and the
# reload-on-deploy of the endpoint modules. Without it, every open browser tab that hit
# the app right after a deploy loaded its own copy of the ~400 MB index concurrently,
# which pushed the 1 GB Streamlit Cloud container over its memory limit ("Oh no").
LIBRARY_LOCK = threading.Lock()
