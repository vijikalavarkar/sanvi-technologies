from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime, Text
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    full_name = Column(String)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    sent_emails = relationship("Email", back_populates="sender_user", foreign_keys="[Email.sender_id]")
    received_emails = relationship("Email", back_populates="recipient_user", foreign_keys="[Email.recipient_id]")
    created_groups = relationship("ChatGroup", back_populates="creator", foreign_keys="[ChatGroup.created_by]")
    group_memberships = relationship("ChatGroupMember", back_populates="user")
    sent_messages = relationship("ChatMessage", back_populates="sender", foreign_keys="[ChatMessage.sender_id]")
    received_messages = relationship("ChatMessage", back_populates="recipient", foreign_keys="[ChatMessage.recipient_id]")

class Attachment(Base):
    __tablename__ = "attachments"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String)
    content_type = Column(String)
    file_path = Column(String)
    size = Column(Integer)
    email_id = Column(Integer, ForeignKey("emails.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    email = relationship("Email", back_populates="attachments")

class Email(Base):
    __tablename__ = "emails"

    id = Column(Integer, primary_key=True, index=True)
    subject = Column(String)
    content = Column(Text)
    sender_id = Column(Integer, ForeignKey("users.id"))
    recipient_id = Column(Integer, ForeignKey("users.id"))
    is_read = Column(Boolean, default=False)
    status = Column(String, default="inbox")  # Values: inbox, spam, trash, sent
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    scheduled_for = Column(DateTime(timezone=True), nullable=True)
    category = Column(String, default="primary")  # Values: primary, social, promotions, updates
    priority = Column(Integer, default=0)  # 0: normal, 1: important, 2: urgent
    thread_id = Column(String, index=True)  # For grouping conversations
    in_reply_to = Column(Integer, ForeignKey("emails.id"), nullable=True)  # For threading
    is_draft = Column(Boolean, default=False)
    labels = Column(String)  # Comma-separated list of labels

    # Relationships
    sender_user = relationship("User", back_populates="sent_emails", foreign_keys=[sender_id])
    recipient_user = relationship("User", back_populates="received_emails", foreign_keys=[recipient_id])
    attachments = relationship("Attachment", back_populates="email", cascade="all, delete-orphan")
    parent = relationship("Email", remote_side=[id], backref=backref("replies", lazy="dynamic"), foreign_keys=[in_reply_to])
    cc_recipients = relationship("EmailRecipient", back_populates="email", foreign_keys="[EmailRecipient.email_id]", cascade="all, delete-orphan")
    bcc_recipients = relationship("EmailRecipient", back_populates="email", foreign_keys="[EmailRecipient.email_id]", cascade="all, delete-orphan")

class EmailRecipient(Base):
    __tablename__ = "email_recipients"

    id = Column(Integer, primary_key=True, index=True)
    email_id = Column(Integer, ForeignKey("emails.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    type = Column(String)  # cc or bcc
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    email = relationship("Email", foreign_keys=[email_id])
    user = relationship("User")

class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String, unique=True, index=True)
    host_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    scheduled_time = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_active = Column(Boolean, default=True)

    # Relationships
    host = relationship("User", backref="hosted_meetings")
    invited_users = relationship("User", secondary="meeting_invites", backref="invited_meetings")

# Add a new table for meeting invites
class MeetingInvite(Base):
    __tablename__ = "meeting_invites"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    email = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ChatGroup(Base):
    __tablename__ = "chat_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    creator = relationship("User", back_populates="created_groups", foreign_keys=[created_by])
    members = relationship("ChatGroupMember", back_populates="group", cascade="all, delete-orphan")
    messages = relationship("ChatMessage", back_populates="group", cascade="all, delete-orphan")

class ChatGroupMember(Base):
    __tablename__ = "chat_group_members"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("chat_groups.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    is_admin = Column(Boolean, default=False)

    # Relationships
    group = relationship("ChatGroup", back_populates="members")
    user = relationship("User", back_populates="group_memberships")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"))
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # For private messages
    group_id = Column(Integer, ForeignKey("chat_groups.id"), nullable=True)  # For group messages
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_read = Column(Boolean, default=False)
    is_rich_text = Column(Boolean, default=False)
    reactions = Column(String)  # JSON string of reactions
    reply_to_id = Column(Integer, ForeignKey("chat_messages.id"), nullable=True)
    
    # File attachments
    file_path = Column(String, nullable=True)
    file_type = Column(String, nullable=True)  # mime type
    file_name = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)  # in bytes
    
    # Voice messages
    voice_message_path = Column(String, nullable=True)
    voice_duration = Column(Integer, nullable=True)  # duration in seconds
    is_voice_message = Column(Boolean, default=False)

    # Relationships
    sender = relationship("User", foreign_keys=[sender_id])
    recipient = relationship("User", foreign_keys=[recipient_id])
    group = relationship("ChatGroup", back_populates="messages")
    reply_to = relationship("ChatMessage", remote_side=[id], backref="replies")
