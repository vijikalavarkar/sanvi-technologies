from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from pydantic import validator
from datetime import datetime
from fastapi import UploadFile

# User schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    is_active: bool = True

    class Config:
        from_attributes = True

# Token schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# Attachment schemas
class AttachmentBase(BaseModel):
    filename: str
    content_type: str
    size: int

class AttachmentCreate(AttachmentBase):
    pass

class Attachment(AttachmentBase):
    id: int
    email_id: int
    file_path: str
    created_at: Optional[str] = None

    @validator("created_at", pre=True)
    def parse_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        from_attributes = True

# Email schemas
class EmailRecipient(BaseModel):
    id: int
    user_id: int
    type: str
    user_email: Optional[str] = None

    class Config:
        from_attributes = True

class EmailBase(BaseModel):
    subject: str
    content: str

class EmailCreate(EmailBase):
    recipient_email: EmailStr
    cc_emails: Optional[List[EmailStr]] = []
    bcc_emails: Optional[List[EmailStr]] = []
    status: Optional[str] = "sent"
    scheduled_for: Optional[datetime] = None
    category: Optional[str] = "primary"
    priority: Optional[int] = 0
    in_reply_to: Optional[int] = None
    labels: Optional[str] = None
    is_draft: Optional[bool] = False

class Email(EmailBase):
    id: int
    sender_id: int
    recipient_id: int
    sender_email: Optional[str] = None
    recipient_email: Optional[str] = None
    is_read: bool = False
    status: str = "inbox"
    created_at: Optional[str] = None
    scheduled_for: Optional[str] = None
    category: str = "primary"
    priority: int = 0
    thread_id: Optional[str] = None
    in_reply_to: Optional[int] = None
    labels: Optional[str] = None
    is_draft: bool = False
    attachments: List[Attachment] = []
    cc_recipients: List[EmailRecipient] = []
    bcc_recipients: List[EmailRecipient] = []
    replies: List["Email"] = []

    @validator("created_at", "scheduled_for", pre=True)
    def parse_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 1,
                "subject": "Hello",
                "content": "Hello World",
                "sender_id": 1,
                "recipient_id": 2,
                "sender_email": "sender@example.com",
                "recipient_email": "recipient@example.com",
                "is_read": False,
                "status": "inbox",
                "created_at": "2024-02-19T08:52:47",
                "category": "primary",
                "priority": 0,
                "thread_id": "thread123",
                "attachments": [],
                "cc_recipients": [],
                "bcc_recipients": []
            }
        }

# Meeting schemas
class MeetingBase(BaseModel):
    title: str
    scheduled_time: datetime
    invited_emails: list[str] = []

    @validator('title')
    def validate_title(cls, v):
        if not v or not v.strip():
            raise ValueError('Meeting title is required')
        return v.strip()
    
    @validator('scheduled_time')
    def validate_scheduled_time(cls, v):
        if not v:
            raise ValueError('Meeting time is required')
        try:
            if isinstance(v, str):
                return datetime.fromisoformat(v.replace('Z', '+00:00'))
            return v
        except Exception as e:
            raise ValueError('Invalid datetime format')

class MeetingCreate(MeetingBase):
    pass

class Meeting(MeetingBase):
    id: int
    room_id: str
    host_id: int
    created_at: Optional[datetime] = None
    is_active: bool = True

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 1,
                "room_id": "123e4567-e89b-12d3-a456-426614174000",
                "title": "Team Meeting",
                "scheduled_time": "2024-02-20T10:00:00Z",
                "host_id": 1,
                "created_at": "2024-02-19T08:52:47Z",
                "is_active": True,
                "invited_emails": ["user1@example.com", "user2@example.com"]
            }
        }

# Chat schemas
class ChatMessageBase(BaseModel):
    content: Optional[str] = ""
    is_rich_text: Optional[bool] = False
    reply_to_id: Optional[int] = None
    is_voice_message: Optional[bool] = False

class ChatMessageCreate(ChatMessageBase):
    recipient_id: Optional[int] = None
    group_id: Optional[int] = None
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    voice_duration: Optional[int] = None

class ChatMessage(ChatMessageBase):
    id: int
    sender_id: int
    recipient_id: Optional[int] = None
    group_id: Optional[int] = None
    created_at: Optional[str] = None
    is_read: bool = False
    sender_email: Optional[str] = None
    recipient_email: Optional[str] = None
    reactions: Optional[str] = None
    file_path: Optional[str] = None
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    file_size: Optional[int] = None
    voice_message_path: Optional[str] = None
    voice_duration: Optional[int] = None
    replies: List["ChatMessage"] = []

    @validator("created_at", pre=True)
    def parse_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": 1,
                "content": "Hello!",
                "sender_id": 1,
                "recipient_id": 2,
                "group_id": None,
                "created_at": "2024-02-19T08:52:47",
                "is_read": False,
                "sender_email": "sender@example.com",
                "recipient_email": "recipient@example.com",
                "is_rich_text": False,
                "reactions": "{}",
                "reply_to_id": None,
                "is_voice_message": False
            }
        }

class ChatGroupBase(BaseModel):
    name: str
    description: Optional[str] = None

class ChatGroupCreate(ChatGroupBase):
    member_ids: List[int] = []

class ChatGroupMember(BaseModel):
    id: int
    user_id: int
    joined_at: Optional[str] = None
    is_admin: bool = False
    user_email: Optional[str] = None
    user_full_name: Optional[str] = None

    @validator("joined_at", pre=True)
    def parse_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        from_attributes = True

class ChatGroup(ChatGroupBase):
    id: int
    created_by: int
    created_at: Optional[str] = None
    members: List[ChatGroupMember] = []
    creator_email: Optional[str] = None

    @validator("created_at", pre=True)
    def parse_datetime(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    class Config:
        from_attributes = True
