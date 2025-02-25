from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Form, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from . import models, schemas, crud
from .database import SessionLocal, engine, get_db
from .auth import (
    get_current_user,
    create_access_token,
    get_password_hash,
    verify_password,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from datetime import timedelta, datetime
from typing import List, Optional
from .chat import manager as chat_manager
from .meeting import meeting_manager
from .tasks import cleanup_old_trash
import json
import os
from app.email_utils import send_email
import shutil
from pathlib import Path
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import asyncio
from sqlalchemy import or_, and_, func
import uuid
import logging
from .websocket import room_manager

# Configure logging
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    # Start the background task for cleaning up trash
    asyncio.create_task(cleanup_old_trash())

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
    expose_headers=["Content-Type", "Authorization"],
    max_age=3600
)

# Dependency
# def get_db():
#     db = SessionLocal()
#     try:
#         yield db
#     finally:
#         db.close()

# Authentication endpoints
@app.post("/api/register", response_model=schemas.User)
async def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )
    
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        email=user.email,
        full_name=user.full_name,
        hashed_password=hashed_password
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/api/token")
async def login_for_access_token(
    credentials: dict,
    db: Session = Depends(get_db)
):
    try:
        username = credentials.get("username")
        password = credentials.get("password")
        
        if not username or not password:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Username and password are required"
            )

        print(f"Login attempt for username: {username}")
        user = db.query(models.User).filter(models.User.email == username).first()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
        if not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.email}, expires_delta=access_token_expires
        )
        
        response_data = {
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "email": user.email,
                "full_name": user.full_name
            }
        }
        
        return response_data
    except Exception as e:
        print(f"Login error: {str(e)}")
        raise

# Create directories if they don't exist
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

CHAT_GIFS_DIR = Path("chat_gifs")
CHAT_GIFS_DIR.mkdir(exist_ok=True)

# Configure uploads directory
CHAT_UPLOADS_DIR = Path("/app/chat_uploads")
CHAT_UPLOADS_DIR.mkdir(exist_ok=True, parents=True)

# Mount static directories
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/chat_gifs", StaticFiles(directory="chat_gifs"), name="chat_gifs")
app.mount("/chat_uploads", StaticFiles(directory="chat_uploads"), name="chat_uploads")

# Email endpoints - Specific routes first
@app.get("/api/emails/cleanup/trash")
async def cleanup_trash(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Find emails in trash older than 30 days
    thirty_days_ago = datetime.now() - timedelta(days=30)
    old_trash = db.query(models.Email).filter(
        models.Email.recipient_id == current_user.id,
        models.Email.status == "trash",
        models.Email.created_at < thirty_days_ago
    ).all()

    deleted_count = 0
    for email in old_trash:
        # Delete attachments from storage
        for attachment in email.attachments:
            try:
                if os.path.exists(attachment.file_path):
                    os.remove(attachment.file_path)
            except Exception as e:
                print(f"Error deleting attachment file: {str(e)}")

        # Delete email from database
        db.delete(email)
        deleted_count += 1

    db.commit()
    return {"message": f"Cleaned up {deleted_count} old emails from trash"}

@app.get("/api/emails/inbox", response_model=List[schemas.Email])
async def read_inbox_emails(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    emails = db.query(models.Email).filter(
        models.Email.recipient_id == current_user.id,
        models.Email.status == "inbox"
    ).offset(skip).limit(limit).all()
    
    for email in emails:
        email.sender_email = email.sender_user.email
        email.recipient_email = email.recipient_user.email
    return emails

@app.get("/api/emails/sent", response_model=List[schemas.Email])
async def read_sent_emails(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    emails = db.query(models.Email).filter(
        models.Email.sender_id == current_user.id,
        models.Email.status == "sent"
    ).offset(skip).limit(limit).all()
    
    for email in emails:
        email.sender_email = email.sender_user.email
        email.recipient_email = email.recipient_user.email
    return emails

# Folder routes
@app.get("/api/folders/{folder}", response_model=List[schemas.Email])
async def get_folder_emails(
    folder: str,
    category: Optional[str] = None,
    priority: Optional[int] = None,
    labels: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        # Validate folder parameter
        valid_folders = ["inbox", "sent", "spam", "trash", "draft"]
        if folder not in valid_folders:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid folder. Must be one of: {', '.join(valid_folders)}"
            )

        # Build base query
        query = db.query(models.Email)
        
        # Apply folder filter
        if folder == "sent":
            query = query.filter(
                models.Email.sender_id == current_user.id,
                models.Email.status == "sent"
            )
        elif folder == "draft":
            query = query.filter(
                models.Email.sender_id == current_user.id,
                models.Email.is_draft == True
            )
        elif folder in ["spam", "trash"]:
            query = query.filter(
                or_(
                    and_(
                        models.Email.recipient_id == current_user.id,
                        models.Email.status == folder
                    ),
                    and_(
                        models.Email.sender_id == current_user.id,
                        models.Email.status == folder
                    )
                )
            )
        else:  # inbox
            query = query.filter(
                models.Email.recipient_id == current_user.id,
                models.Email.status == "inbox"
            )

        # Apply category filter
        if category:
            query = query.filter(models.Email.category == category)

        # Apply priority filter
        if priority is not None:
            query = query.filter(models.Email.priority == priority)

        # Apply labels filter
        if labels:
            label_list = labels.split(",")
            for label in label_list:
                query = query.filter(models.Email.labels.like(f"%{label}%"))

        # Apply search filter
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    models.Email.subject.ilike(search_term),
                    models.Email.content.ilike(search_term)
                )
            )

        # Order by priority and created_at
        query = query.order_by(
            models.Email.priority.desc(),
            models.Email.created_at.desc()
        )
        
        # Execute query with pagination
        emails = query.offset(skip).limit(limit).all()
        
        # Add email addresses and ensure attachments are loaded
        for email in emails:
            email.sender_email = email.sender_user.email if email.sender_user else None
            email.recipient_email = email.recipient_user.email if email.recipient_user else None
            
            # Load CC and BCC recipients
            for cc in email.cc_recipients:
                cc.user_email = cc.user.email if cc.user else None
            for bcc in email.bcc_recipients:
                bcc.user_email = bcc.user.email if bcc.user else None
        
        return emails

    except Exception as e:
        logging.error(f"Error in get_folder_emails: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while fetching emails: {str(e)}"
        )

# Email CRUD routes with ID parameter
@app.post("/api/emails", response_model=schemas.Email)
async def create_email(
    subject: str = Form(...),
    content: str = Form(...),
    recipient_email: str = Form(...),
    cc_emails: str = Form(default="[]"),
    bcc_emails: str = Form(default="[]"),
    scheduled_for: Optional[str] = Form(None),
    category: str = Form(default="primary"),
    priority: int = Form(default=0),
    in_reply_to: Optional[int] = Form(None),
    labels: Optional[str] = Form(None),
    is_draft: bool = Form(default=False),
    attachments: List[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        # Parse CC and BCC emails
        try:
            cc_list = json.loads(cc_emails)
            bcc_list = json.loads(bcc_emails)
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid format for CC or BCC emails"
            )

        # Validate recipient email
        recipient = db.query(models.User).filter(models.User.email == recipient_email).first()
        if not recipient:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Recipient with email {recipient_email} not found"
            )

        # Generate thread ID or use existing one
        thread_id = None
        if in_reply_to:
            parent_email = db.query(models.Email).filter(models.Email.id == in_reply_to).first()
            if parent_email:
                thread_id = parent_email.thread_id
        
        if not thread_id:
            thread_id = str(uuid.uuid4())

        try:
            # Create sent email for sender
            sent_email = models.Email(
                subject=subject,
                content=content,
                sender_id=current_user.id,
                recipient_id=recipient.id,
                status="sent" if not is_draft else "draft",
                scheduled_for=datetime.fromisoformat(scheduled_for) if scheduled_for else None,
                category=category,
                priority=priority,
                thread_id=thread_id,
                in_reply_to=in_reply_to,
                labels=labels,
                is_draft=is_draft
            )
            db.add(sent_email)
            db.flush()  # Get the ID without committing

            # Create inbox email for recipient (only if not draft)
            if not is_draft:
                inbox_email = models.Email(
                    subject=subject,
                    content=content,
                    sender_id=current_user.id,
                    recipient_id=recipient.id,
                    status="inbox",
                    category=category,
                    priority=priority,
                    thread_id=thread_id,
                    in_reply_to=in_reply_to,
                    labels=labels
                )
                db.add(inbox_email)
                db.flush()

            # Save attachments
            if attachments:
                for attachment in attachments:
                    try:
                        # Create unique filename
                        file_path = UPLOAD_DIR / f"{sent_email.id}_{attachment.filename}"
                        
                        # Save file
                        with file_path.open("wb") as buffer:
                            shutil.copyfileobj(attachment.file, buffer)
                        
                        # Create attachment records
                        sent_attachment = models.Attachment(
                            filename=attachment.filename,
                            content_type=attachment.content_type,
                            file_path=str(file_path),
                            size=os.path.getsize(file_path),
                            email_id=sent_email.id
                        )
                        db.add(sent_attachment)

                        if not is_draft:
                            inbox_attachment = models.Attachment(
                                filename=attachment.filename,
                                content_type=attachment.content_type,
                                file_path=str(file_path),
                                size=os.path.getsize(file_path),
                                email_id=inbox_email.id
                            )
                            db.add(inbox_attachment)
                    except Exception as e:
                        logger.error(f"Error processing attachment {attachment.filename}: {str(e)}")
                        continue

            # Commit all changes
            db.commit()
            db.refresh(sent_email)
            
            # Add email addresses for response
            sent_email.sender_email = current_user.email
            sent_email.recipient_email = recipient.email

            # Send actual email using SMTP (only if not draft and not scheduled)
            if not is_draft and not scheduled_for:
                try:
                    success, error_msg = send_email(
                        to_email=recipient.email,
                        subject=subject,
                        content=content,
                        attachments=[
                            {
                                "filename": attachment.filename,
                                "path": str(UPLOAD_DIR / f"{sent_email.id}_{attachment.filename}")
                            }
                            for attachment in (attachments or [])
                        ],
                        cc_list=cc_list
                    )
                    
                    if not success:
                        logger.warning(f"Email saved to database but SMTP delivery failed: {error_msg}")
                        # Don't raise an exception, just log the warning
                        # The email is still saved in the database
                except Exception as smtp_error:
                    logger.warning(f"Email saved to database but SMTP delivery failed: {str(smtp_error)}")
                    # Don't raise an exception, just log the warning
                    # The email is still saved in the database
            
            return sent_email

        except Exception as db_error:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(db_error)}"
            )

    except HTTPException as http_error:
        raise http_error
    except Exception as e:
        logger.error(f"Error creating email: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create email: {str(e)}"
        )

@app.get("/api/emails/{email_id}", response_model=schemas.Email)
async def read_email(
    email_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    try:
        email_id_int = int(email_id)
        email = db.query(models.Email).filter(models.Email.id == email_id_int).first()
        if email is None:
            raise HTTPException(status_code=404, detail="Email not found")
        if email.recipient_id != current_user.id and email.sender_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to view this email")
        
        # Add email addresses and attachments
        email.sender_email = email.sender_user.email
        email.recipient_email = email.recipient_user.email
        return email
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="Invalid email ID format. Must be an integer."
        )

@app.put("/api/emails/{email_id}/status")
async def update_email_status(
    email_id: int,
    status_update: dict,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if "status" not in status_update or status_update["status"] not in ["inbox", "spam", "trash", "sent"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    email = db.query(models.Email).filter(
        models.Email.id == email_id,
        or_(
            models.Email.recipient_id == current_user.id,
            models.Email.sender_id == current_user.id
        )
    ).first()

    if not email:
        raise HTTPException(status_code=404, detail="Email not found")

    # If restoring from spam/trash, check if it was originally a sent email
    if status_update["status"] == "inbox" and email.sender_id == current_user.id:
        email.status = "sent"  # Restore to sent folder if user was the sender
    else:
        email.status = status_update["status"]

    db.commit()

    return {"message": "Email status updated successfully"}

@app.delete("/api/emails/{email_id}")
async def delete_email_permanently(
    email_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Get the email
    email = db.query(models.Email).filter(
        models.Email.id == email_id,
        models.Email.recipient_id == current_user.id,
        models.Email.status.in_(["trash", "spam"])  # Allow deletion from both trash and spam
    ).first()

    if not email:
        raise HTTPException(status_code=404, detail="Email not found in trash or spam")

    # Delete attachments from storage
    for attachment in email.attachments:
        try:
            # Delete the file from storage
            if os.path.exists(attachment.file_path):
                os.remove(attachment.file_path)
        except Exception as e:
            print(f"Error deleting attachment file: {str(e)}")

    # Delete email from database (this will cascade delete attachments)
    db.delete(email)
    db.commit()

    return {"message": "Email permanently deleted"}

@app.get("/api/emails/inbox", response_model=List[schemas.Email])
async def read_inbox_emails(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    emails = db.query(models.Email).filter(
        models.Email.recipient_id == current_user.id,
        models.Email.status == "inbox"
    ).offset(skip).limit(limit).all()
    
    for email in emails:
        email.sender_email = email.sender_user.email
        email.recipient_email = email.recipient_user.email
    return emails

@app.get("/api/emails/sent", response_model=List[schemas.Email])
async def read_sent_emails(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    emails = db.query(models.Email).filter(
        models.Email.sender_id == current_user.id,
        models.Email.status == "sent"
    ).offset(skip).limit(limit).all()
    
    for email in emails:
        email.sender_email = email.sender_user.email
        email.recipient_email = email.recipient_user.email
    return emails

@app.get("/api/emails/sent")
async def get_sent_emails(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    emails = (
        db.query(models.Email)
        .filter(models.Email.sender_id == current_user.id)
        .order_by(models.Email.created_at.desc())
        .all()
    )
    
    return [
        {
            "id": email.id,
            "subject": email.subject,
            "content": email.content,
            "recipient_email": email.recipient_user.email,
            "created_at": email.created_at,
            "is_read": email.is_read
        }
        for email in emails
    ]

# Chat WebSocket endpoint
@app.websocket("/ws/chat/{room_id}")
async def chat_websocket(
    websocket: WebSocket,
    room_id: str,
    user_id: str = None,
    user_name: str = None
):
    if not user_id or not user_name:
        await websocket.close(code=4000)
        return

    room = room_manager.create_room(room_id)
    user_data = {
        "id": user_id,
        "name": user_name,
        "joined_at": datetime.now().isoformat()
    }

    try:
        await room.connect(websocket, user_id, user_data)
        
        # Send room state to the new user
        await websocket.send_json({
            "type": "room_state",
            "data": room.get_room_state()
        })
        
        # Notify others about the new user
        await room.broadcast(
            {
                "type": "user_joined",
                "user": user_data
            },
            exclude_user=user_id
        )

        while True:
            try:
                data = await websocket.receive_json()
                await room.broadcast(data)
            except WebSocketDisconnect:
                break

    except WebSocketDisconnect:
        room.disconnect(user_id)
        await room.broadcast(
            {
                "type": "user_left",
                "user_id": user_id
            },
            exclude_user=user_id
        )
        
        if len(room.connections) == 0:
            room_manager.delete_room(room_id)

@app.get("/api/chat/files/{room_id}/{filename}")
async def get_chat_file(
    room_id: str,
    filename: str,
    current_user: models.User = Depends(get_current_user)
):
    file_path = UPLOAD_DIR / f"{room_id}_{filename}"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        str(file_path),
        filename=filename,
        media_type="application/octet-stream"
    )

# Meeting WebSocket endpoint
@app.websocket("/ws/meeting/{room_id}")
async def meeting_websocket(
    websocket: WebSocket,
    room_id: str,
    user_id: str = None,
    user_name: str = None
):
    if not user_id or not user_name:
        await websocket.close(code=4000)
        return

    room = room_manager.create_room(room_id)
    user_data = {
        "id": user_id,
        "name": user_name,
        "joined_at": datetime.now().isoformat()
    }

    try:
        await room.connect(websocket, user_id, user_data)
        
        # Send room state to the new user
        await websocket.send_json({
            "type": "room_state",
            "data": room.get_room_state()
        })
        
        # Notify others about the new user
        await room.broadcast(
            {
                "type": "user_joined",
                "user": user_data
            },
            exclude_user=user_id
        )

        while True:
            try:
                data = await websocket.receive_json()
                
                # Handle WebRTC signaling
                if data["type"] in ["offer", "answer", "ice-candidate"]:
                    target_user_id = data.get("target_user_id")
                    if target_user_id:
                        await room.send_to_user(target_user_id, data)
                # Handle media state updates
                elif data["type"] == "media_state":
                    await room.broadcast(data)
                # Handle chat messages and other updates
                else:
                    await room.broadcast(data)
                    
            except WebSocketDisconnect:
                break

    except WebSocketDisconnect:
        room.disconnect(user_id)
        await room.broadcast(
            {
                "type": "user_left",
                "user_id": user_id
            },
            exclude_user=user_id
        )
        
        if len(room.connections) == 0:
            room_manager.delete_room(room_id)

# Meeting management endpoints
@app.post("/api/meetings", response_model=schemas.Meeting)
async def create_meeting(
    meeting: schemas.MeetingCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        if not meeting.title or not meeting.title.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Meeting title is required"
            )
            
        room_id = meeting_manager.create_meeting(str(current_user.id), meeting.title.strip())
        
        # Create meeting record in database
        db_meeting = models.Meeting(
            room_id=room_id,
            host_id=current_user.id,
            title=meeting.title.strip(),
            scheduled_time=meeting.scheduled_time,
            is_active=True
        )
        db.add(db_meeting)
        db.commit()
        db.refresh(db_meeting)

        # Create meeting invites
        for email in meeting.invited_emails:
            # Check if user exists
            invited_user = db.query(models.User).filter(models.User.email == email).first()
            if invited_user:
                invite = models.MeetingInvite(
                    meeting_id=db_meeting.id,
                    user_id=invited_user.id,
                    email=email
                )
                db.add(invite)

                # Create an email notification
                email_notification = models.Email(
                    subject=f"Meeting Invitation: {meeting.title}",
                    content=f"""
                    You have been invited to a meeting:
                    
                    Title: {meeting.title}
                    Time: {meeting.scheduled_time}
                    Join Link: {os.getenv('FRONTEND_URL', 'http://localhost:3000')}/dashboard/meeting/{room_id}
                    
                    Click the link above to join the meeting at the scheduled time.
                    """,
                    sender_id=current_user.id,
                    recipient_id=invited_user.id,
                    status="inbox"
                )
                db.add(email_notification)
        
        db.commit()
        return db_meeting
    except Exception as e:
        db.rollback()
        print(f"Error creating meeting: {str(e)}")  # Add logging
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )

@app.get("/api/meetings/{room_id}")
async def get_meeting(
    room_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    meeting = db.query(models.Meeting).filter(models.Meeting.room_id == room_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    return {
        "room_id": meeting.room_id,
        "title": meeting.title,
        "host_id": meeting.host_id,
        "created_at": meeting.created_at,
        "is_active": meeting.is_active
    }

@app.get("/api/meetings")
async def get_meetings(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        # Get meetings where user is either host or invited
        meetings = db.query(models.Meeting).filter(
            or_(
                models.Meeting.host_id == current_user.id,
                models.Meeting.id.in_(
                    db.query(models.MeetingInvite.meeting_id).filter(
                        models.MeetingInvite.user_id == current_user.id
                    )
                )
            )
        ).order_by(models.Meeting.scheduled_time.desc()).all()

        # Format response
        response = []
        for meeting in meetings:
            invites = db.query(models.MeetingInvite).filter(
                models.MeetingInvite.meeting_id == meeting.id
            ).all()
            
            meeting_data = {
                "id": meeting.id,
                "room_id": meeting.room_id,
                "title": meeting.title,
                "scheduled_time": meeting.scheduled_time,
                "host_id": meeting.host_id,
                "created_at": meeting.created_at,
                "is_active": meeting.is_active,
                "invited_emails": [invite.email for invite in invites]
            }
            response.append(meeting_data)

        return response
    except Exception as e:
        print(f"Error fetching meetings: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@app.delete("/api/meetings/{meeting_id}")
async def delete_meeting(
    meeting_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        # Get the meeting
        meeting = db.query(models.Meeting).filter(
            models.Meeting.id == meeting_id,
            models.Meeting.host_id == current_user.id  # Only host can delete
        ).first()
        
        if not meeting:
            raise HTTPException(
                status_code=404,
                detail="Meeting not found or you don't have permission to delete it"
            )

        # Delete meeting invites first (due to foreign key constraints)
        db.query(models.MeetingInvite).filter(
            models.MeetingInvite.meeting_id == meeting_id
        ).delete()

        # Delete the meeting
        db.delete(meeting)
        db.commit()

        return {"message": "Meeting deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete meeting: {str(e)}"
        )

# Chat endpoints
@app.post("/api/chat/groups", response_model=schemas.ChatGroup)
async def create_chat_group(
    group: schemas.ChatGroupCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db_group = models.ChatGroup(
        name=group.name,
        description=group.description,
        created_by=current_user.id
    )
    db.add(db_group)
    db.commit()
    db.refresh(db_group)

    # Add creator as admin member
    admin_member = models.ChatGroupMember(
        group_id=db_group.id,
        user_id=current_user.id,
        is_admin=True
    )
    db.add(admin_member)

    # Add other members
    for member_id in group.member_ids:
        if member_id != current_user.id:
            member = models.ChatGroupMember(
                group_id=db_group.id,
                user_id=member_id
            )
            db.add(member)

    db.commit()
    return db_group

@app.get("/api/chat/groups", response_model=List[schemas.ChatGroup])
async def get_user_chat_groups(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    memberships = db.query(models.ChatGroupMember).filter(
        models.ChatGroupMember.user_id == current_user.id
    ).all()
    group_ids = [m.group_id for m in memberships]
    groups = db.query(models.ChatGroup).filter(models.ChatGroup.id.in_(group_ids)).all()
    
    # Add creator email to each group
    for group in groups:
        group.creator_email = group.creator.email
        for member in group.members:
            member.user_email = member.user.email
            member.user_full_name = member.user.full_name
    
    return groups

@app.post("/api/chat/messages", response_model=schemas.ChatMessage)
async def create_chat_message(
    content: str = Form(""),  # Make content optional with empty string as default
    recipient_id: Optional[int] = Form(None),
    group_id: Optional[int] = Form(None),
    is_rich_text: Optional[bool] = Form(False),
    reply_to_id: Optional[int] = Form(None),
    is_voice_message: Optional[bool] = Form(False),
    voice_duration: Optional[int] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not recipient_id and not group_id:
        raise HTTPException(status_code=400, detail="Either recipient_id or group_id must be provided")

    # Validate that at least one of content, file, or voice message is provided
    if not content and not file and not is_voice_message:
        raise HTTPException(status_code=400, detail="Message must contain either text content, a file, or a voice message")

    # Validate recipient or group exists
    if recipient_id:
        recipient = db.query(models.User).filter(models.User.id == recipient_id).first()
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient not found")
    elif group_id:
        group = db.query(models.ChatGroup).filter(models.ChatGroup.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

    file_path = None
    file_name = None
    file_type = None
    file_size = None
    voice_message_path = None

    try:
        # Ensure upload directory exists
        os.makedirs(CHAT_UPLOADS_DIR, exist_ok=True)

        if file and file.filename:
            # Generate safe filename with timestamp and user ID
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            original_filename = file.filename
            safe_filename = f"{current_user.id}_{timestamp}_{original_filename}"
            
            # Determine the full file path
            full_path = CHAT_UPLOADS_DIR / safe_filename
            
            try:
                # Save the file using a buffer to handle large files efficiently
                with open(full_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
                
                # Get file size after saving
                file_size = os.path.getsize(full_path)
                
                if is_voice_message:
                    voice_message_path = str(full_path)
                else:
                    file_path = str(full_path)
                
                file_name = safe_filename
                file_type = file.content_type

            except Exception as e:
                # If file saving fails, log the error and clean up
                logger.error(f"Error saving file {safe_filename}: {str(e)}")
                if os.path.exists(full_path):
                    os.remove(full_path)
                raise HTTPException(
                    status_code=500,
                    detail="Failed to save file"
                )

        # Create chat message
        chat_message = models.ChatMessage(
            content=content,
            sender_id=current_user.id,
            recipient_id=recipient_id,
            group_id=group_id,
            is_rich_text=is_rich_text,
            reply_to_id=reply_to_id,
            reactions="{}",
            file_path=file_path,
            file_name=file_name,
            file_type=file_type,
            file_size=file_size,
            is_voice_message=is_voice_message,
            voice_message_path=voice_message_path,
            voice_duration=voice_duration
        )

        db.add(chat_message)
        db.commit()
        db.refresh(chat_message)

        # Add sender and recipient emails to response
        chat_message.sender_email = current_user.email
        if recipient_id:
            chat_message.recipient_email = recipient.email

        return chat_message

    except Exception as e:
        # If anything fails, clean up any saved files
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
        if voice_message_path and os.path.exists(voice_message_path):
            os.remove(voice_message_path)
            
        logger.error(f"Error creating chat message: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create message: {str(e)}"
        )

@app.put("/api/chat/messages/{message_id}/reaction")
async def add_reaction(
    message_id: int,
    reaction: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    message = db.query(models.ChatMessage).filter(models.ChatMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    # Load existing reactions
    reactions = json.loads(message.reactions or "{}")
    user_id = str(current_user.id)
    
    # Toggle reaction
    if user_id in reactions.get(reaction, []):
        reactions[reaction].remove(user_id)
        if not reactions[reaction]:
            del reactions[reaction]
    else:
        if reaction not in reactions:
            reactions[reaction] = []
        reactions[reaction].append(user_id)

    # Save reactions
    message.reactions = json.dumps(reactions)
    db.commit()
    
    return {"message": "Reaction updated successfully"}

@app.get("/api/chat/files/{filename}")
async def get_chat_file(filename: str, current_user: models.User = Depends(get_current_user)):
    try:
        # Determine content type based on file extension
        content_type = "application/octet-stream"
        if filename.endswith('.webm'):
            content_type = "audio/webm"
        elif filename.endswith('.mp3'):
            content_type = "audio/mpeg"
        elif filename.endswith('.wav'):
            content_type = "audio/wav"
        elif filename.endswith('.ogg'):
            content_type = "audio/ogg"
        elif filename.endswith('.m4a'):
            content_type = "audio/mp4"

        file_path = os.path.join("uploads", filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(
            file_path,
            media_type=content_type,
            filename=filename
        )
    except Exception as e:
        logger.error(f"Error serving file {filename}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chat/messages/{user_id}", response_model=List[schemas.ChatMessage])
async def get_private_chat_messages(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Get messages between current user and specified user
    messages = db.query(models.ChatMessage).filter(
        or_(
            and_(
                models.ChatMessage.sender_id == current_user.id,
                models.ChatMessage.recipient_id == user_id
            ),
            and_(
                models.ChatMessage.sender_id == user_id,
                models.ChatMessage.recipient_id == current_user.id
            )
        )
    ).order_by(models.ChatMessage.created_at.asc()).all()

    # Add sender and recipient emails
    for msg in messages:
        msg.sender_email = msg.sender.email
        if msg.recipient_id:
            msg.recipient_email = msg.recipient.email

    return messages

@app.get("/api/chat/groups/{group_id}/messages", response_model=List[schemas.ChatMessage])
async def get_group_chat_messages(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check if user is member of the group
    is_member = db.query(models.ChatGroupMember).filter(
        models.ChatGroupMember.group_id == group_id,
        models.ChatGroupMember.user_id == current_user.id
    ).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="You are not a member of this group")

    # Get all messages in the group
    messages = db.query(models.ChatMessage).filter(
        models.ChatMessage.group_id == group_id
    ).order_by(models.ChatMessage.created_at.asc()).all()

    # Add sender emails
    for msg in messages:
        msg.sender_email = msg.sender.email

    return messages

@app.post("/api/chat/groups/{group_id}/members")
async def add_group_members(
    group_id: int,
    member_ids: List[int],
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Check if user is admin of the group
    is_admin = db.query(models.ChatGroupMember).filter(
        models.ChatGroupMember.group_id == group_id,
        models.ChatGroupMember.user_id == current_user.id,
        models.ChatGroupMember.is_admin == True
    ).first()
    if not is_admin:
        raise HTTPException(status_code=403, detail="Only group admins can add members")

    # Add new members
    for member_id in member_ids:
        # Check if user exists
        user = db.query(models.User).filter(models.User.id == member_id).first()
        if not user:
            continue

        # Check if already a member
        existing_member = db.query(models.ChatGroupMember).filter(
            models.ChatGroupMember.group_id == group_id,
            models.ChatGroupMember.user_id == member_id
        ).first()
        if not existing_member:
            new_member = models.ChatGroupMember(
                group_id=group_id,
                user_id=member_id
            )
            db.add(new_member)

    db.commit()
    return {"message": "Members added successfully"}

@app.get("/api/users", response_model=List[schemas.User])
async def get_users(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    users = db.query(models.User).filter(models.User.id != current_user.id).all()
    return users

@app.get("/api/emails/{email_id}/attachments/{filename}")
async def get_email_attachment(
    email_id: int,
    filename: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Get the email and verify access
    email = db.query(models.Email).filter(models.Email.id == email_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    if email.recipient_id != current_user.id and email.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this email")

    # Find the attachment
    attachment = db.query(models.Attachment).filter(
        models.Attachment.email_id == email_id,
        models.Attachment.filename == filename
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Check if file exists
    if not os.path.exists(attachment.file_path):
        raise HTTPException(status_code=404, detail="Attachment file not found")

    return FileResponse(
        attachment.file_path,
        filename=attachment.filename,
        media_type=attachment.content_type or "application/octet-stream"
    )

@app.get("/api/users/me", response_model=schemas.User)
async def get_current_user_details(
    current_user: models.User = Depends(get_current_user)
):
    return current_user

@app.put("/api/chat/messages/mark-read")
async def mark_messages_as_read(
    message_ids: List[int],
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark multiple messages as read"""
    try:
        # Update messages where the current user is the recipient
        db.query(models.ChatMessage).filter(
            models.ChatMessage.id.in_(message_ids),
            models.ChatMessage.recipient_id == current_user.id
        ).update({"is_read": True}, synchronize_session=False)
        
        db.commit()
        return {"message": "Messages marked as read"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chat/unread-counts")
async def get_unread_counts(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get unread message counts for each sender"""
    try:
        # Get all unread messages where current user is recipient
        unread_messages = db.query(
            models.ChatMessage.sender_id,
            func.count(models.ChatMessage.id).label('count')
        ).filter(
            models.ChatMessage.recipient_id == current_user.id,
            models.ChatMessage.is_read == False
        ).group_by(
            models.ChatMessage.sender_id
        ).all()
        
        # Convert to dictionary with sender_id as key
        unread_counts = {str(sender_id): count for sender_id, count in unread_messages}
        
        return unread_counts
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
