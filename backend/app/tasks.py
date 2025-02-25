from datetime import datetime, timedelta
import asyncio
from sqlalchemy.orm import Session
from . import models
from .database import SessionLocal
import os

async def cleanup_old_trash():
    """
    Periodically clean up emails that have been in trash for more than 30 days
    """
    while True:
        try:
            db = SessionLocal()
            try:
                # Find emails in trash older than 30 days
                thirty_days_ago = datetime.now() - timedelta(days=30)
                old_trash = db.query(models.Email).filter(
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
                if deleted_count > 0:
                    print(f"Cleaned up {deleted_count} old emails from trash")

            finally:
                db.close()

            # Run every 24 hours
            await asyncio.sleep(24 * 60 * 60)

        except Exception as e:
            print(f"Error in cleanup_old_trash task: {str(e)}")
            # If there's an error, wait 1 hour before retrying
            await asyncio.sleep(60 * 60) 