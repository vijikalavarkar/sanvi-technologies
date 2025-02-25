from typing import Dict, Set, List
from fastapi import WebSocket
import json
from datetime import datetime
import base64
from pathlib import Path
import os

# Create chat uploads directory
CHAT_UPLOAD_DIR = Path("chat_uploads")
CHAT_UPLOAD_DIR.mkdir(exist_ok=True)

class ChatMessage:
    def __init__(
        self,
        message_type: str,
        user_id: str,
        content: str,
        timestamp: str = None,
        file_data: Dict = None,
        reply_to: str = None,
        reactions: Dict = None,
        is_rich_text: bool = False
    ):
        self.type = message_type
        self.user_id = user_id
        self.content = content
        self.timestamp = timestamp or datetime.now().isoformat()
        self.file_data = file_data
        self.reply_to = reply_to
        self.reactions = reactions or {}
        self.is_rich_text = is_rich_text

    def to_dict(self) -> Dict:
        return {
            "type": self.type,
            "user_id": self.user_id,
            "content": self.content,
            "timestamp": self.timestamp,
            "file_data": self.file_data,
            "reply_to": self.reply_to,
            "reactions": self.reactions,
            "is_rich_text": self.is_rich_text
        }

class ChatRoom:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.connections: Set[WebSocket] = set()
        self.messages: List[ChatMessage] = []
        self.typing_users: Dict[str, str] = {}  # user_id -> name

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                print(f"Error broadcasting message: {str(e)}")

    def add_message(self, message: ChatMessage):
        self.messages.append(message)
        # Keep only last 100 messages
        if len(self.messages) > 100:
            self.messages = self.messages[-100:]

class ChatManager:
    def __init__(self):
        self.rooms: Dict[str, ChatRoom] = {}
        self.user_rooms: Dict[WebSocket, str] = {}
        self.uploads_dir = Path("chat_uploads")
        self.uploads_dir.mkdir(exist_ok=True)

    def get_room(self, room_id: str) -> ChatRoom:
        if room_id not in self.rooms:
            self.rooms[room_id] = ChatRoom(room_id)
        return self.rooms[room_id]

    async def connect(self, websocket: WebSocket, room_id: str):
        room = self.get_room(room_id)
        await room.connect(websocket)
        self.user_rooms[websocket] = room_id

    def disconnect(self, websocket: WebSocket, room_id: str):
        room = self.get_room(room_id)
        room.disconnect(websocket)
        if websocket in self.user_rooms:
            del self.user_rooms[websocket]

    async def broadcast(self, message: str, room_id: str):
        try:
            data = json.loads(message)
            room = self.get_room(room_id)

            if data["type"] == "file":
                # Handle file upload
                file_content = data.pop("file_content", None)
                if file_content:
                    filename = data.pop("filename")
                    content_type = data.pop("content_type")
                    
                    # Save file
                    file_path = self.uploads_dir / f"{room_id}_{filename}"
                    file_bytes = base64.b64decode(file_content)
                    with open(file_path, "wb") as f:
                        f.write(file_bytes)
                    
                    # Add file data to message
                    data["file_data"] = {
                        "filename": filename,
                        "content_type": content_type,
                        "size": len(file_bytes)
                    }

            # Create and store message
            chat_message = ChatMessage(**data)
            room.add_message(chat_message)
            
            # Broadcast to all users in the room
            await room.broadcast(json.dumps(chat_message.to_dict()))

        except Exception as e:
            print(f"Error broadcasting message: {str(e)}")
            # Send error message back to sender
            error_message = {
                "type": "error",
                "message": f"Failed to process message: {str(e)}"
            }
            await websocket.send_text(json.dumps(error_message))

    async def handle_typing(self, websocket: WebSocket, data: Dict):
        room_id = self.user_rooms.get(websocket)
        if room_id:
            room = self.get_room(room_id)
            if data.get("is_typing"):
                room.typing_users[data["user_id"]] = data["user_name"]
            else:
                room.typing_users.pop(data["user_id"], None)
            
            # Broadcast typing status
            await room.broadcast(json.dumps({
                "type": "typing",
                "user_id": data["user_id"],
                "user_name": data["user_name"],
                "is_typing": data["is_typing"]
            }))

    def get_file_path(self, room_id: str, filename: str) -> Path:
        return self.uploads_dir / f"{room_id}_{filename}"

class ConnectionManager:
    def __init__(self):
        # Store active connections per room
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = set()
        self.active_connections[room_id].add(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            self.active_connections[room_id].discard(websocket)
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]

    async def broadcast(self, message: str, room_id: str):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                await connection.send_text(message)

manager = ChatManager()
manager_connection = ConnectionManager()
