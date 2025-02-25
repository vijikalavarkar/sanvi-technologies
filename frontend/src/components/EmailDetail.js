import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Paper,
  Typography,
  Box,
  IconButton,
  Divider,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Avatar,
  Chip,
} from '@mui/material';
import {
  ArrowBack,
  Delete,
  Report as SpamIcon,
  Download,
  Reply,
  Forward,
  AttachFile,
  Person,
  Description,
  Image as ImageIcon,
  PictureAsPdf,
  Restore,
} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const EmailDetail = () => {
  const { emailId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchEmailDetails();
  }, [emailId]);

  const fetchEmailDetails = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/emails/${emailId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      setEmail(response.data);
    } catch (err) {
      console.error('Error fetching email:', err);
      setError(err.response?.data?.detail || 'Failed to fetch email details');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadAttachment = async (attachmentId, filename) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/emails/${emailId}/attachments/${filename}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          responseType: 'blob'
        }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading attachment:', err);
      alert('Failed to download attachment. Please try again.');
    }
  };

  const handleMoveToTrash = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/api/emails/${emailId}/status`,
        { status: 'trash' },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      navigate(-1);
    } catch (err) {
      console.error('Error moving email to trash:', err);
      setError('Failed to move email to trash');
    }
  };

  const handleMarkAsSpam = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/api/emails/${emailId}/status`,
        { status: 'spam' },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      navigate(-1);
    } catch (err) {
      console.error('Error marking email as spam:', err);
      setError('Failed to mark email as spam');
    }
  };

  const handleReply = () => {
    navigate('/dashboard/compose', {
      state: {
        replyTo: email,
        subject: `Re: ${email.subject}`,
        recipient: email.sender_email,
        content: `\n\nOn ${new Date(email.created_at).toLocaleString()}, ${email.sender_email} wrote:\n> ${email.content}`
      }
    });
  };

  const handleForward = () => {
    navigate('/dashboard/compose', {
      state: {
        subject: `Fwd: ${email.subject}`,
        content: `\n\n-------- Forwarded Message --------\nFrom: ${email.sender_email}\nDate: ${new Date(email.created_at).toLocaleString()}\nSubject: ${email.subject}\n\n${email.content}`
      }
    });
  };

  const handleRestoreEmail = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/api/emails/${emailId}/status`,
        { status: 'inbox' },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      navigate(-1);
    } catch (err) {
      console.error('Error restoring email:', err);
      setError('Failed to restore email');
    }
  };

  const handleDeletePermanently = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${API_URL}/api/emails/${emailId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      navigate(-1);
    } catch (err) {
      console.error('Error deleting email permanently:', err);
      setError('Failed to delete email permanently');
    }
  };

  const getAttachmentIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
      return <ImageIcon />;
    } else if (ext === 'pdf') {
      return <PictureAsPdf />;
    }
    return <Description />;
  };

  const renderActionButtons = () => {
    if (email.status === 'trash' || email.status === 'spam') {
      return (
        <>
          <Button
            startIcon={<Restore />}
            variant="outlined"
            onClick={handleRestoreEmail}
            color="primary"
          >
            Restore to Inbox
          </Button>
          <Button
            startIcon={<Delete />}
            variant="outlined"
            onClick={handleDeletePermanently}
            color="error"
          >
            Delete Permanently
          </Button>
        </>
      );
    }

    return (
      <>
        <Button
          startIcon={<Reply />}
          variant="outlined"
          onClick={handleReply}
        >
          Reply
        </Button>
        <Button
          startIcon={<Forward />}
          variant="outlined"
          onClick={handleForward}
        >
          Forward
        </Button>
        <IconButton onClick={handleMarkAsSpam} color="warning">
          <SpamIcon />
        </IconButton>
        <IconButton onClick={handleMoveToTrash} color="error">
          <Delete />
        </IconButton>
      </>
    );
  };

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!email) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography>Email not found</Typography>
      </Box>
    );
  }

  return (
    <Paper elevation={3} sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <IconButton onClick={() => navigate(-1)} sx={{ mr: 2 }}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {email.subject}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {renderActionButtons()}
        </Box>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Email Details */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Avatar sx={{ mr: 2 }}>
            <Person />
          </Avatar>
          <Box>
            <Typography variant="subtitle1">
              From: {email.sender_email}
            </Typography>
            <Typography variant="subtitle2" color="textSecondary">
              To: {email.recipient_email}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {new Date(email.created_at).toLocaleString()}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Attachments */}
      {email.attachments && email.attachments.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Attachments ({email.attachments.length}):
          </Typography>
          <List>
            {email.attachments.map((attachment) => (
              <ListItem
                key={attachment.id}
                sx={{
                  border: '1px solid #e0e0e0',
                  borderRadius: 1,
                  mb: 1,
                }}
              >
                <ListItemIcon>
                  {getAttachmentIcon(attachment.filename)}
                </ListItemIcon>
                <ListItemText
                  primary={attachment.filename}
                  secondary={`${(attachment.size / 1024).toFixed(1)} KB`}
                />
                <IconButton
                  onClick={() => handleDownloadAttachment(attachment.id, attachment.filename)}
                  color="primary"
                >
                  <Download />
                </IconButton>
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      <Divider sx={{ my: 2 }} />

      {/* Email Content */}
      <Box sx={{ whiteSpace: 'pre-wrap' }}>
        <Typography>{email.content}</Typography>
      </Box>
    </Paper>
  );
};

export default EmailDetail; 