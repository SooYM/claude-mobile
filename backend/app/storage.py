from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / 'data'
DB_PATH = DATA_DIR / 'chat.sqlite3'


def initialize_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            '''
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sender TEXT NOT NULL,
                text TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                delivered INTEGER NOT NULL DEFAULT 1,
                reaction TEXT
            )
            '''
        )
        connection.execute(
            '''
            CREATE TABLE IF NOT EXISTS subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subscription_json TEXT NOT NULL UNIQUE
            )
            '''
        )
        connection.commit()


@contextmanager
def open_connection() -> Iterator[sqlite3.Connection]:
    initialize_storage()
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()
