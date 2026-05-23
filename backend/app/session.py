from __future__ import annotations

import os
import re
import time
import asyncio
import logging
import pexpect
import pyte
from dataclasses import dataclass
from datetime import datetime, timezone
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ClaudeSession")

class PyteTerminal:
    def __init__(self, cols=120, lines=40):
        self.screen = pyte.Screen(cols, lines)
        self.stream = pyte.Stream(self.screen)
        
    def feed(self, data):
        self.stream.feed(data)
        
    def get_clean_lines(self):
        return [line.rstrip() for line in self.screen.display]

def is_ready(clean_lines):
    tail = "\n".join(clean_lines[-10:])
    if "❯" not in tail:
        return False
    if "esc to interrupt" in tail:
        return False
    if "for shortcuts" in tail:
        return True
    return False

def extract_response(clean_lines, user_prompt):
    prompt_idx = -1
    for idx, line in enumerate(clean_lines):
        if f"❯ {user_prompt}" in line or f"❯  {user_prompt}" in line or (line.strip().startswith("❯") and user_prompt in line):
            prompt_idx = idx
            
    if prompt_idx == -1:
        for idx in range(len(clean_lines) - 1, -1, -1):
            if clean_lines[idx].strip().startswith("❯") and user_prompt in clean_lines[idx]:
                prompt_idx = idx
                break
                
    if prompt_idx == -1:
        return ""
        
    sep_idx = -1
    for idx in range(prompt_idx + 1, len(clean_lines)):
        if "────" in clean_lines[idx]:
            sep_idx = idx
            break
            
    if sep_idx == -1:
        sep_idx = len(clean_lines)
        
    response_lines = clean_lines[prompt_idx + 1:sep_idx]
    
    final_lines = []
    for line in response_lines:
        sline = line.strip()
        if not sline:
            continue
        # Skip thinking indicators, warnings, tips, timing info
        skip_terms = [
            "thought for", "thinking with", "thinking more", "still thinking", "almost done",
            "Vibing…", "Germinating…", "Flibbertigibbeting…", "Tip:", "⎿", "Press up", "to interrupt"
        ]
        if any(term in sline for term in skip_terms):
            continue
        if sline.startswith("✻ Baked for") or sline.startswith("✻ Brewed for") or sline.startswith("✻ "):
            continue
        
        # Strip the `⏺ ` prefix if present
        if sline.startswith("⏺ "):
            sline = sline[2:]
        elif sline.startswith("⏺"):
            sline = sline[1:]
        final_lines.append(sline)
        
    return "\n".join(final_lines).strip()

@dataclass
class SessionStatus:
    alive: bool
    model_ready: bool
    persona_loaded: bool

class ClaudeSessionManager:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._started_at = datetime.now(timezone.utc)
        self._persona_loaded = False
        self._model_ready = False
        self._alive = False
        self._child = None
        self._term = None
        
        self._command = os.getenv("OLLAMA_COMMAND", "ollama launch claude")
        self._model = os.getenv("OLLAMA_MODEL", "gemma4:31b-cloud")
        self._persona = os.getenv("PERSONA_COMMAND", "/ex-skill")

    def is_process_alive(self) -> bool:
        return self._child is not None and self._child.isalive()

    async def _read_until_ready(self, timeout=60) -> str:
        start_time = time.time()
        last_data_time = time.time()
        buffer = ""
        while time.time() - start_time < timeout:
            try:
                data = await asyncio.to_thread(self._child.read_nonblocking, 10000, 0.05)
                if data:
                    buffer += data
                    self._term.feed(data)
                    last_data_time = time.time()
            except (pexpect.TIMEOUT, pexpect.exceptions.TIMEOUT):
                pass
            except pexpect.EOF:
                self._alive = False
                break
                
            clean_lines = self._term.get_clean_lines()
            if is_ready(clean_lines):
                if time.time() - last_data_time >= 0.5:
                    break
                    
            await asyncio.sleep(0.05)
        return buffer

    async def _start_locked(self) -> None:
        logger.info("Starting persistent terminal process...")
        if self._child and self._child.isalive():
            try:
                self._child.terminate(force=True)
            except Exception:
                pass
                
        self._child = pexpect.spawn(self._command, encoding="utf-8", dimensions=(40, 120))
        self._term = PyteTerminal(120, 40)
        
        # Wait for boot screen (either Select model or main prompt)
        boot_start = time.time()
        while time.time() - boot_start < 20:
            try:
                data = await asyncio.to_thread(self._child.read_nonblocking, 10000, 0.05)
                if data:
                    self._term.feed(data)
            except (pexpect.TIMEOUT, pexpect.exceptions.TIMEOUT):
                pass
            except pexpect.EOF:
                break
            
            clean_lines = self._term.get_clean_lines()
            screen_text = "\n".join(clean_lines)
            if "Select model" in screen_text or "for shortcuts" in screen_text:
                break
            await asyncio.sleep(0.05)
            
        screen_text = "\n".join(self._term.get_clean_lines())
        if "Select model" in screen_text:
            logger.info(f"Selecting model: {self._model}")
            await asyncio.to_thread(self._child.send, f"{self._model}\r")
            self._term = PyteTerminal(120, 40)
            await self._read_until_ready(timeout=30)
            
        self._model_ready = True
        logger.info("Model selection completed. Model is ready.")
        
        # Send Persona Command
        logger.info(f"Sending persona initialization command: {self._persona}")
        await asyncio.to_thread(self._child.send, f"{self._persona}\r")
        await self._read_until_ready(timeout=40)
        
        self._persona_loaded = True
        self._alive = True
        logger.info("Persona initialization completed. Session is alive and fully ready.")

    async def start(self) -> None:
        async with self._lock:
            await self._start_locked()

    async def send_message(self, text: str) -> str:
        async with self._lock:
            if not self.is_process_alive():
                logger.warning("Terminal process died. Auto-restarting...")
                self._alive = False
                self._model_ready = False
                self._persona_loaded = False
                await self._start_locked()
                
            logger.info(f"Sending message to persistent session: {text}")
            await asyncio.to_thread(self._child.send, f"{text}\r")
            await self._read_until_ready(timeout=120)
            
            clean_lines = self._term.get_clean_lines()
            response = extract_response(clean_lines, text)
            logger.info(f"Extracted response: {response}")
            return response

    async def health(self) -> SessionStatus:
        async with self._lock:
            process_alive = self.is_process_alive()
            return SessionStatus(
                alive=self._alive and process_alive,
                model_ready=self._model_ready and process_alive,
                persona_loaded=self._persona_loaded and process_alive,
            )
