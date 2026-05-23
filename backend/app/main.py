from __future__ import annotations

from datetime import datetime, timezone
from typing import Union

from fastapi import FastAPI, Header, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware

from .schemas import ChatRequest, ChatResponse
from .session import ClaudeSessionManager
from .storage import initialize_storage, open_connection

import os
import json
import logging
from dotenv import load_dotenv
from pywebpush import webpush, WebPushException
from pydantic import BaseModel

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ClaudeBackend")

app = FastAPI(title='Claude Mobile Backend', version='0.1.0')
session_manager = ClaudeSessionManager()

API_TOKEN = os.getenv('API_TOKEN', 'change-me')
allowed_origins_str = os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000,https://localhost:3000')
ALLOWED_ORIGINS = [origin.strip() for origin in allowed_origins_str.split(',') if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=['GET', 'POST', 'OPTIONS'],
    allow_headers=['Authorization', 'Content-Type'],
)


@app.on_event('startup')
async def on_startup() -> None:
    initialize_storage()
    await session_manager.start()


@app.get('/api/health')
async def health() -> dict[str, object]:
    status = await session_manager.health()
    return {
        'backend': 'running',
        'cliSessionAlive': status.alive,
        'modelConnected': status.model_ready,
        'personaLoaded': status.persona_loaded,
    }


@app.get('/api/history')
async def history() -> dict[str, object]:
    with open_connection() as connection:
        rows = connection.execute(
            'SELECT id, sender, text, timestamp, delivered, reaction FROM messages ORDER BY id ASC'
        ).fetchall()
    return {
        'messages': [dict(row) for row in rows],
    }


PRIVATE_KEY_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "private_key.pem")

def send_web_push(message_text: str):
    if not os.path.exists(PRIVATE_KEY_PATH):
        logger.warning(f"VAPID private key not found at {PRIVATE_KEY_PATH}. Skipping push notification.")
        return

    with open_connection() as connection:
        rows = connection.execute('SELECT id, subscription_json FROM subscriptions').fetchall()

    for row in rows:
        sub_id = row['id']
        sub_data = json.loads(row['subscription_json'])
        try:
            webpush(
                subscription_info=sub_data,
                data=json.dumps({
                    "title": "Ex-Skill",
                    "body": message_text
                }),
                vapid_private_key=PRIVATE_KEY_PATH,
                vapid_claims={"sub": "mailto:admin@example.com"}
            )
            logger.info(f"Successfully sent push notification to subscription {sub_id}")
        except WebPushException as ex:
            logger.warning(f"Failed to send push to subscription {sub_id}: {ex}")
            if ex.response is not None and ex.response.status_code in [404, 410]:
                logger.info(f"Removing invalid/expired subscription {sub_id}")
                with open_connection() as connection:
                    connection.execute('DELETE FROM subscriptions WHERE id = ?', (sub_id,))
        except Exception as e:
            logger.error(f"Unexpected error sending push: {e}")

async def generate_response_in_background(user_text: str):
    try:
        response_text = await session_manager.send_message(user_text)
        assistant_timestamp = datetime.now(timezone.utc).isoformat()

        with open_connection() as connection:
            connection.execute(
                'INSERT INTO messages (sender, text, timestamp, delivered, reaction) VALUES (?, ?, ?, ?, ?)',
                ('assistant', response_text, assistant_timestamp, 1, None),
            )

        send_web_push(response_text)

    except Exception as e:
        logger.error(f"Error in background generation: {e}")
        error_timestamp = datetime.now(timezone.utc).isoformat()
        with open_connection() as connection:
            connection.execute(
                'INSERT INTO messages (sender, text, timestamp, delivered, reaction) VALUES (?, ?, ?, ?, ?)',
                ('assistant', f"⚠️ Connection Error: {str(e)}", error_timestamp, 1, None),
            )

@app.post('/api/chat')
async def chat(
    request: ChatRequest,
    background_tasks: BackgroundTasks,
    authorization: Union[str, None] = Header(default=None)
) -> dict[str, str]:
    if authorization != f'Bearer {API_TOKEN}':
        raise HTTPException(status_code=401, detail='Unauthorized')

    now = datetime.now(timezone.utc).isoformat()

    with open_connection() as connection:
        connection.execute(
            'INSERT INTO messages (sender, text, timestamp, delivered, reaction) VALUES (?, ?, ?, ?, ?)',
            ('user', request.text, now, 1, None),
        )

    background_tasks.add_task(generate_response_in_background, request.text)

    return {"status": "queued", "message": "User message recorded, generation started in background"}


@app.delete('/api/history')
async def clear_history(authorization: Union[str, None] = Header(default=None)) -> dict[str, str]:
    if authorization != f'Bearer {API_TOKEN}':
        raise HTTPException(status_code=401, detail='Unauthorized')

    with open_connection() as connection:
        connection.execute('DELETE FROM messages')

    await session_manager.start()
    return {'status': 'success', 'message': 'Chat history cleared and session restarted'}


@app.post('/api/session/restart')
async def restart_session(authorization: Union[str, None] = Header(default=None)) -> dict[str, str]:
    if authorization != f'Bearer {API_TOKEN}':
        raise HTTPException(status_code=401, detail='Unauthorized')

    await session_manager.start()
    return {'status': 'success', 'message': 'Session restarted successfully'}


class SubscriptionPayload(BaseModel):
    subscription: dict

@app.post('/api/subscription')
async def save_subscription(payload: SubscriptionPayload) -> dict[str, str]:
    sub_json = json.dumps(payload.subscription)
    try:
        with open_connection() as connection:
            connection.execute(
                'INSERT OR IGNORE INTO subscriptions (subscription_json) VALUES (?)',
                (sub_json,)
            )
        return {'status': 'success', 'message': 'Subscription saved'}
    except Exception as e:
        logger.error(f"Failed to save subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))

