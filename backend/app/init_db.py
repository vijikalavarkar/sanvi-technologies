from sqlalchemy.orm import Session
from . import models, auth
from .database import engine, SessionLocal

def init_db():
    models.Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # Check if test user exists
        test_user = db.query(models.User).filter(models.User.email == "test@example.com").first()
        if not test_user:
            # Create test user
            hashed_password = auth.get_password_hash("password123")
            test_user = models.User(
                email="test@example.com",
                full_name="Test User",
                hashed_password=hashed_password
            )
            db.add(test_user)
            
            # Create some test emails
            test_email = models.Email(
                subject="Welcome to Mail Service",
                content="This is a test email to get you started.",
                sender_id=test_user.id,
                recipient_id=test_user.id,
                status="inbox",
                category="primary",
                thread_id="test-thread-1"
            )
            db.add(test_email)
            
            db.commit()
            print("Test user and sample data created successfully!")
        else:
            print("Test user already exists!")
    except Exception as e:
        print(f"Error initializing database: {str(e)}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    init_db()
