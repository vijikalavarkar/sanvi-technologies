import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from typing import List, Dict, Tuple
from .config import get_settings
import os
import logging
import ssl

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

settings = get_settings()

def send_email(to_email: str, subject: str, content: str, attachments: List[Dict] = None, cc_list: List[str] = None) -> Tuple[bool, str]:
    server = None
    try:
        logger.debug(f"Preparing to send email to {to_email}")
        logger.debug(f"SMTP Settings - Host: {settings.SMTP_HOST}, Port: {settings.SMTP_PORT}")
        
        # Create message container
        msg = MIMEMultipart()
        msg['From'] = f"{settings.FROM_NAME} <{settings.FROM_EMAIL}>"
        msg['To'] = to_email
        if cc_list:
            msg['Cc'] = ", ".join(cc_list)
            logger.debug(f"CC recipients: {cc_list}")
        msg['Subject'] = subject

        # Add body to email
        msg.attach(MIMEText(content, 'plain'))
        logger.debug("Email body attached")

        # Add attachments
        if attachments:
            logger.debug(f"Processing {len(attachments)} attachments")
            for attachment in attachments:
                try:
                    with open(attachment['path'], 'rb') as f:
                        part = MIMEApplication(f.read(), _subtype="octet-stream")
                        part.add_header(
                            'Content-Disposition',
                            'attachment',
                            filename=attachment['filename']
                        )
                        msg.attach(part)
                        logger.debug(f"Attached file: {attachment['filename']}")
                except Exception as e:
                    error_msg = f"Error attaching file {attachment['filename']}: {str(e)}"
                    logger.error(error_msg)
                    return False, error_msg

        try:
            # Create SMTP connection
            logger.debug("Establishing SMTP connection...")
            context = ssl.create_default_context()
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30)
            server.set_debuglevel(1)  # Enable SMTP debug output
            
            # Start TLS for security
            if settings.SMTP_TLS:
                logger.debug("Starting TLS...")
                server.starttls(context=context)
            
            # Login if credentials are provided
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                logger.debug(f"Logging in as {settings.SMTP_USERNAME}...")
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            
            # Send email
            all_recipients = [to_email] + (cc_list or [])
            logger.debug(f"Sending email to recipients: {all_recipients}")
            server.sendmail(settings.FROM_EMAIL, all_recipients, msg.as_string())
            logger.debug("Email sent successfully")
            
            return True, "Email sent successfully"

        except smtplib.SMTPAuthenticationError as e:
            error_msg = f"SMTP Authentication failed: {str(e)}"
            logger.error(error_msg)
            return False, error_msg
        
        except smtplib.SMTPConnectError as e:
            error_msg = f"Failed to connect to SMTP server: {str(e)}"
            logger.error(error_msg)
            return False, error_msg
        
        except smtplib.SMTPException as e:
            error_msg = f"SMTP error occurred: {str(e)}"
            logger.error(error_msg)
            return False, error_msg
        
        except ssl.SSLError as e:
            error_msg = f"SSL/TLS error: {str(e)}"
            logger.error(error_msg)
            return False, error_msg
        
        except Exception as e:
            error_msg = f"Unexpected error while sending email: {str(e)}"
            logger.error(error_msg)
            return False, error_msg

    finally:
        if server:
            try:
                server.quit()
            except Exception as e:
                logger.error(f"Error closing SMTP connection: {str(e)}") 