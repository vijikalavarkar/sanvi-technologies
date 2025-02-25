from fastapi import WebSocket
from typing import Dict, Set, Optional
import json
import uuid
from datetime import datetime

class Participant:
    def __init__(self, user_id: str, name: str, websocket: WebSocket):
        self.user_id = user_id
        self.name = name
        self.websocket = websocket
        self.audio_enabled = True
        self.video_enabled = True
        self.screen_sharing = False

class MeetingRoom:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.participants: Dict[str, Participant] = {}
        self.created_at = datetime.now()
        self.is_active = True

    async def broadcast(self, message: Dict, exclude_websocket: WebSocket = None):
        for participant in self.participants.values():
            if exclude_websocket and participant.websocket == exclude_websocket:
                continue
            try:
                await participant.websocket.send_json(message)
            except Exception as e:
                print(f"Error broadcasting to participant {participant.user_id}: {str(e)}")

class MeetingManager:
    def __init__(self):
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        self.user_names: Dict[str, Dict[str, str]] = {}

    def create_meeting(self, host_id: str, title: str) -> str:
        room_id = str(uuid.uuid4())
        return room_id

    async def connect(self, websocket: WebSocket, room_id: str, user_id: str, name: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = {}
            self.user_names[room_id] = {}
        
        self.active_connections[room_id][user_id] = websocket
        self.user_names[room_id][user_id] = name

        # Send current participants to the new user
        await websocket.send_json({
            "type": "participants",
            "participants": [
                {"id": uid, "name": uname}
                for uid, uname in self.user_names[room_id].items()
                if uid != user_id
            ]
        })

    def disconnect(self, websocket: WebSocket, room_id: str, user_id: str):
        if room_id in self.active_connections:
            if user_id in self.active_connections[room_id]:
                del self.active_connections[room_id][user_id]
            if user_id in self.user_names[room_id]:
                del self.user_names[room_id][user_id]
            
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
                del self.user_names[room_id]

    async def broadcast_signal(self, message: dict, room_id: str, sender_socket: WebSocket):
        if room_id in self.active_connections:
            for user_id, connection in self.active_connections[room_id].items():
                if connection != sender_socket:  # Don't send back to sender
                    await connection.send_json(message)

    async def handle_offer(self, offer: dict, room_id: str, sender_socket: WebSocket, sender_id: str):
        message = {
            "type": "offer",
            "offer": offer,
            "userId": sender_id
        }
        await self.broadcast_signal(message, room_id, sender_socket)

    async def handle_answer(self, answer: dict, room_id: str, sender_socket: WebSocket, sender_id: str):
        message = {
            "type": "answer",
            "answer": answer,
            "userId": sender_id
        }
        await self.broadcast_signal(message, room_id, sender_socket)

    async def handle_ice_candidate(self, candidate: dict, room_id: str, sender_socket: WebSocket, sender_id: str):
        message = {
            "type": "ice-candidate",
            "candidate": candidate,
            "userId": sender_id
        }
        await self.broadcast_signal(message, room_id, sender_socket)

    async def handle_media_status(self, status: dict, room_id: str, sender_socket: WebSocket, sender_id: str):
        message = {
            "type": "media-status",
            "status": status,
            "userId": sender_id
        }
        await self.broadcast_signal(message, room_id, sender_socket)

meeting_manager = MeetingManager()
