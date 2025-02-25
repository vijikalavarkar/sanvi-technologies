from typing import Set, List, Dict
import json
import uuid
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime

class Room:
    def __init__(self):
        self.connections: Dict[str, WebSocket] = {}  # user_id -> websocket
        self.messages: List[Dict] = []
        self.polls: Dict[str, Dict] = {}
        self.media_states: Dict[str, Dict] = {}  # user_id -> media state
        self.room_metadata: Dict = {
            "created_at": datetime.now().isoformat(),
            "participants": {}
        }

    async def connect(self, websocket: WebSocket, user_id: str, user_data: Dict):
        await websocket.accept()
        self.connections[user_id] = websocket
        self.room_metadata["participants"][user_id] = user_data
        self.media_states[user_id] = {
            "video": True,
            "audio": True,
            "screen": False
        }

    def disconnect(self, user_id: str):
        if user_id in self.connections:
            del self.connections[user_id]
        if user_id in self.room_metadata["participants"]:
            del self.room_metadata["participants"][user_id]
        if user_id in self.media_states:
            del self.media_states[user_id]

    async def broadcast(self, message: Dict, exclude_user: str = None):
        message["timestamp"] = datetime.now().isoformat()
        
        if message["type"] in ["chat", "system"]:
            self.messages.append(message)
            if len(self.messages) > 100:  # Keep last 100 messages
                self.messages.pop(0)
        
        elif message["type"] == "media_state":
            user_id = message["user_id"]
            self.media_states[user_id].update(message["state"])
            
        elif message["type"] == "poll":
            poll_id = str(uuid.uuid4())
            poll_data = message["content"]
            self.polls[poll_id] = {
                "question": poll_data["question"],
                "options": poll_data["options"],
                "votes": [0] * len(poll_data["options"]),
                "voters": {}
            }
            message["poll_id"] = poll_id
            
        elif message["type"] == "vote":
            poll_id = message["poll_id"]
            if poll_id in self.polls:
                user_id = message["user_id"]
                option_index = message["option_index"]
                
                if user_id in self.polls[poll_id]["voters"]:
                    prev_vote = self.polls[poll_id]["voters"][user_id]
                    self.polls[poll_id]["votes"][prev_vote] -= 1
                
                self.polls[poll_id]["votes"][option_index] += 1
                self.polls[poll_id]["voters"][user_id] = option_index
                
                message = {
                    "type": "poll_update",
                    "poll_id": poll_id,
                    "votes": self.polls[poll_id]["votes"]
                }

        for user_id, connection in self.connections.items():
            if exclude_user and user_id == exclude_user:
                continue
            try:
                await connection.send_json(message)
            except WebSocketDisconnect:
                self.disconnect(user_id)

    async def send_to_user(self, user_id: str, message: Dict):
        if user_id in self.connections:
            try:
                await self.connections[user_id].send_json(message)
            except WebSocketDisconnect:
                self.disconnect(user_id)

    def get_room_state(self) -> Dict:
        return {
            "participants": self.room_metadata["participants"],
            "media_states": self.media_states,
            "messages": self.messages[-100:],  # Last 100 messages
            "polls": self.polls
        }

class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    def create_room(self, room_id: str) -> Room:
        if room_id not in self.rooms:
            self.rooms[room_id] = Room()
        return self.rooms[room_id]

    def get_room(self, room_id: str) -> Room:
        return self.rooms.get(room_id)

    def delete_room(self, room_id: str):
        if room_id in self.rooms:
            del self.rooms[room_id]

room_manager = RoomManager() 