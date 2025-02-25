from sqlalchemy.orm import Session
from . import models, schemas

def get_email(db: Session, email_id: int):
    return db.query(models.Email).filter(models.Email.id == email_id).first()

def get_emails(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Email).offset(skip).limit(limit).all()

def create_email(db: Session, email: schemas.EmailCreate):
    db_email = models.Email(
        sender=email.sender,
        recipient=email.recipient,
        subject=email.subject,
        content=email.content
    )
    db.add(db_email)
    db.commit()
    db.refresh(db_email)
    return db_email
