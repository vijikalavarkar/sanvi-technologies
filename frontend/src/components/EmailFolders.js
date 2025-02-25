import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Typography,
  Paper,
  Box,
  IconButton,
  Divider,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  Person,
  Delete,
  Report as SpamIcon,
  AttachFile,
  Description,
  Image,
  PictureAsPdf,
  RestoreFromTrash,
  Restore,
} from '@mui/icons-material';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const getAttachmentIcon = (contentType) => {
  if (contentType.startsWith('image/')) {
    return <Image fontSize="small" />;
  } else if (contentType === 'application/pdf') {
    return <PictureAsPdf fontSize="small" />;
  }
  return <Description fontSize="small" />;
};

const EmailFolders = ({ folder }) => {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchEmails();
  }, [folder]);

  const fetchEmails = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Authentication token not found');
        return;
      }

      let endpoint = `${API_URL}/api/folders/${folder}`;
      
      const response = await axios.get(endpoint, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (response.data) {
        setEmails(response.data);
      } else {
        setEmails([]);
      }
    } catch (err) {
      console.error(`Error fetching ${folder} emails:`, err);
      let errorMessage = 'Failed to fetch emails';
      
      if (err.response) {
        if (err.response.status === 422) {
          errorMessage = `Invalid folder type: ${folder}`;
        } else if (err.response.status === 401) {
          errorMessage = 'Please login again to continue';
          navigate('/login');
        } else if (err.response.data?.detail) {
          errorMessage = err.response.data.detail;
        }
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailClick = (emailId) => {
    navigate(`/dashboard/email/${emailId}`);
  };

  const handleMoveToTrash = async (emailId, event) => {
    event.stopPropagation();
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
      fetchEmails();
    } catch (err) {
      console.error('Error moving email to trash:', err);
      setError('Failed to move email to trash');
    }
  };

  const handleMarkAsSpam = async (emailId, event) => {
    event.stopPropagation();
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
      fetchEmails();
    } catch (err) {
      console.error('Error marking email as spam:', err);
      setError('Failed to mark email as spam');
    }
  };

  const handleRestoreEmail = async (emailId, event) => {
    event.stopPropagation();
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
      fetchEmails();
    } catch (err) {
      console.error('Error restoring email:', err);
      setError('Failed to restore email');
    }
  };

  const handleDeletePermanently = async (emailId, event) => {
    event.stopPropagation();
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
      fetchEmails();
    } catch (err) {
      console.error('Error deleting email permanently:', err);
      setError('Failed to delete email permanently');
    }
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

  const renderActionButtons = (email) => {
    if (folder === 'trash' || folder === 'spam') {
      return (
        <Box>
          <Tooltip title="Restore to inbox">
            <IconButton
              onClick={(e) => handleRestoreEmail(email.id, e)}
              size="small"
              color="primary"
            >
              <Restore />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete permanently">
            <IconButton
              onClick={(e) => handleDeletePermanently(email.id, e)}
              size="small"
              color="error"
            >
              <Delete />
            </IconButton>
          </Tooltip>
        </Box>
      );
    }

    return (
      <Box>
        <Tooltip title="Mark as spam">
          <IconButton
            onClick={(e) => handleMarkAsSpam(email.id, e)}
            size="small"
            color="warning"
          >
            <SpamIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Move to trash">
          <IconButton
            onClick={(e) => handleMoveToTrash(email.id, e)}
            size="small"
            color="error"
          >
            <Delete />
          </IconButton>
        </Tooltip>
      </Box>
    );
  };

  return (
    <Paper elevation={3}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" component="h2">
          {folder.charAt(0).toUpperCase() + folder.slice(1)}
        </Typography>
      </Box>
      <List>
        {emails.length === 0 ? (
          <ListItem>
            <ListItemText
              primary={`No emails in ${folder}`}
              sx={{ textAlign: 'center' }}
            />
          </ListItem>
        ) : (
          emails.map((email) => (
            <React.Fragment key={email.id}>
              <ListItem
                button
                onClick={() => handleEmailClick(email.id)}
                sx={{
                  bgcolor: !email.is_read ? 'action.hover' : 'inherit',
                  '&:hover': {
                    bgcolor: 'action.selected',
                  },
                }}
              >
                <ListItemAvatar>
                  <Avatar>
                    <Person />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography
                        component="span"
                        variant="subtitle1"
                        fontWeight={!email.is_read ? 'bold' : 'normal'}
                      >
                        {email.subject}
                      </Typography>
                      {email.attachments?.length > 0 && (
                        <Tooltip title={`${email.attachments.length} attachment(s)`}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <AttachFile fontSize="small" color="action" />
                            <Typography variant="caption" color="text.secondary">
                              ({email.attachments.length})
                            </Typography>
                          </Box>
                        </Tooltip>
                      )}
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography variant="body2" color="text.secondary">
                        {folder === 'sent' ? `To: ${email.recipient_email}` : `From: ${email.sender_email}`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {new Date(email.created_at).toLocaleString()}
                      </Typography>
                      {email.attachments?.length > 0 && (
                        <Box sx={{ mt: 0.5, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {email.attachments.map((attachment, index) => (
                            <Chip
                              key={index}
                              size="small"
                              icon={getAttachmentIcon(attachment.content_type)}
                              label={`${attachment.filename} (${(attachment.size / 1024).toFixed(1)} KB)`}
                              variant="outlined"
                              sx={{ maxWidth: 200 }}
                            />
                          ))}
                        </Box>
                      )}
                    </Box>
                  }
                />
                {renderActionButtons(email)}
              </ListItem>
              <Divider />
            </React.Fragment>
          ))
        )}
      </List>
    </Paper>
  );
};

export default EmailFolders;
