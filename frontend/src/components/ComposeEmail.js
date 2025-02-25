import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Input,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Tooltip,
  Snackbar,
} from '@mui/material';
import {
  AttachFile,
  Delete,
  Save,
  Description,
  Schedule,
  FormatBold,
  FormatItalic,
  FormatUnderlined,
  FormatListBulleted,
  FormatListNumbered,
  Link as LinkIcon,
  Image as ImageIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { debounce } from 'lodash';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const EMAIL_TEMPLATES = [
  {
    name: 'Meeting Invitation',
    subject: 'Invitation: Team Meeting',
    content: 'Dear [Name],\n\nI would like to invite you to a team meeting...',
  },
  {
    name: 'Project Update',
    subject: 'Project Status Update',
    content: 'Hi team,\n\nHere is the latest update on our project...',
  },
  // Add more templates
];

const ComposeEmail = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState({
    recipient_email: '',
    cc: [],
    bcc: [],
    subject: '',
    content: '',
    scheduled_time: null,
  });
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState('');
  const [templateMenu, setTemplateMenu] = useState(null);
  const [scheduleDialog, setScheduleDialog] = useState(false);
  const [scheduledTime, setScheduledTime] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [bccInput, setBccInput] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });
  const [isDraft, setIsDraft] = useState(false);

  useEffect(() => {
    // Load draft from localStorage
    const draft = localStorage.getItem('emailDraft');
    if (draft) {
      const parsedDraft = JSON.parse(draft);
      setEmail(parsedDraft);
      setIsDraft(true);
    }
  }, []);

  // Auto-save draft
  const saveDraft = debounce(() => {
    localStorage.setItem('emailDraft', JSON.stringify(email));
    setIsDraft(true);
    setSnackbar({ open: true, message: 'Draft saved' });
  }, 1000);

  useEffect(() => {
    if (email.content || email.subject || email.recipient_email) {
      saveDraft();
    }
  }, [email]);

  const handleAttachmentChange = (event) => {
    const files = Array.from(event.target.files);
    const totalSize = [...attachments, ...files].reduce((sum, file) => sum + file.size, 0);
    
    if (totalSize > 25 * 1024 * 1024) { // 25MB limit
      setError('Total attachment size cannot exceed 25MB');
      return;
    }
    
    setAttachments([...attachments, ...files]);
  };

  const removeAttachment = (index) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleTemplateSelect = (template) => {
    setEmail({
      ...email,
      subject: template.subject,
      content: template.content,
    });
    setTemplateMenu(null);
  };

  const handleSchedule = () => {
    setEmail({ ...email, scheduled_time: scheduledTime });
    setScheduleDialog(false);
    setSnackbar({ open: true, message: 'Email scheduled' });
  };

  const handleCcKeyPress = (e) => {
    if (e.key === 'Enter' && ccInput.trim()) {
      setEmail({
        ...email,
        cc: [...email.cc, ccInput.trim()],
      });
      setCcInput('');
    }
  };

  const handleBccKeyPress = (e) => {
    if (e.key === 'Enter' && bccInput.trim()) {
      setEmail({
        ...email,
        bcc: [...email.bcc, bccInput.trim()],
      });
      setBccInput('');
    }
  };

  const removeCc = (index) => {
    setEmail({
      ...email,
      cc: email.cc.filter((_, i) => i !== index),
    });
  };

  const removeBcc = (index) => {
    setEmail({
      ...email,
      bcc: email.bcc.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Please login to send emails');
      }

      const formData = new FormData();
      formData.append('subject', email.subject);
      formData.append('content', email.content);
      formData.append('recipient_email', email.recipient_email);
      formData.append('cc_emails', JSON.stringify(email.cc));
      formData.append('bcc_emails', JSON.stringify(email.bcc));
      if (email.scheduled_time) {
        formData.append('scheduled_for', email.scheduled_time);
      }
      
      attachments.forEach((file) => {
        formData.append('attachments', file);
      });

      const response = await axios.post(
        `${API_URL}/api/emails`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          }
        }
      );

      // Clear draft after successful send
      localStorage.removeItem('emailDraft');
      setIsDraft(false);

      console.log('Email sent successfully:', response.data);
      setSnackbar({ open: true, message: 'Email sent successfully!' });
      navigate('/dashboard/sent');
    } catch (err) {
      console.error('Error sending email:', err);
      
      if (err.response) {
        // Server responded with an error
        if (err.response.status === 404) {
          setError('Recipient not found. Please check the email address.');
        } else if (err.response.status === 401) {
          setError('Please login again to send emails.');
          navigate('/login');
        } else {
          setError(err.response.data?.detail || 'Failed to send email. Please try again.');
        }
      } else if (err.request) {
        // Request was made but no response
        setError('Network error. Please check your connection and try again.');
      } else {
        // Something else happened
        setError('An error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setEmail({
      ...email,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <Paper elevation={3}>
      <Box component="form" onSubmit={handleSubmit} sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
          <Typography variant="h5">
            Compose Email
            {isDraft && (
              <Chip
                label="Draft"
                size="small"
                color="primary"
                sx={{ ml: 1 }}
              />
            )}
          </Typography>
          <Box>
            <Tooltip title="Use Template">
              <IconButton onClick={(e) => setTemplateMenu(e.currentTarget)}>
                <Description />
              </IconButton>
            </Tooltip>
            <Tooltip title="Schedule Send">
              <IconButton onClick={() => setScheduleDialog(true)}>
                <Schedule />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        <TextField
          fullWidth
          label="To"
          name="recipient_email"
          type="email"
          value={email.recipient_email}
          onChange={handleChange}
          margin="normal"
          required
          disabled={loading}
        />

        <TextField
          fullWidth
          label="Cc"
          value={ccInput}
          onChange={(e) => setCcInput(e.target.value)}
          onKeyPress={handleCcKeyPress}
          margin="normal"
          disabled={loading}
          helperText="Press Enter to add multiple recipients"
        />
        {email.cc.length > 0 && (
          <Box sx={{ mt: 1 }}>
            {email.cc.map((cc, index) => (
              <Chip
                key={index}
                label={cc}
                onDelete={() => removeCc(index)}
                sx={{ mr: 1, mb: 1 }}
              />
            ))}
          </Box>
        )}

        <TextField
          fullWidth
          label="Bcc"
          value={bccInput}
          onChange={(e) => setBccInput(e.target.value)}
          onKeyPress={handleBccKeyPress}
          margin="normal"
          disabled={loading}
          helperText="Press Enter to add multiple recipients"
        />
        {email.bcc.length > 0 && (
          <Box sx={{ mt: 1 }}>
            {email.bcc.map((bcc, index) => (
              <Chip
                key={index}
                label={bcc}
                onDelete={() => removeBcc(index)}
                sx={{ mr: 1, mb: 1 }}
              />
            ))}
          </Box>
        )}

        <TextField
          fullWidth
          label="Subject"
          name="subject"
          value={email.subject}
          onChange={handleChange}
          margin="normal"
          required
          disabled={loading}
        />

        <TextField
          fullWidth
          multiline
          rows={4}
          value={email.content}
          onChange={(e) => setEmail({ ...email, content: e.target.value })}
          placeholder="Write your email content here..."
          variant="outlined"
          margin="normal"
        />

        <Box sx={{ mt: 2, mb: 2 }}>
          <Input
            type="file"
            id="attachment-input"
            multiple
            onChange={handleAttachmentChange}
            style={{ display: 'none' }}
          />
          <label htmlFor="attachment-input">
            <Button
              component="span"
              variant="outlined"
              startIcon={<AttachFile />}
              disabled={loading}
            >
              Attach Files
            </Button>
          </label>
        </Box>

        {attachments.length > 0 && (
          <List>
            {attachments.map((file, index) => (
              <ListItem key={index}>
                <ListItemText
                  primary={file.name}
                  secondary={`${(file.size / 1024).toFixed(2)} KB`}
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    onClick={() => removeAttachment(index)}
                    disabled={loading}
                  >
                    <Delete />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}

        <Box sx={{ mt: 2 }}>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={loading}
            sx={{ mr: 2 }}
          >
            {loading ? <CircularProgress size={24} /> : 'Send'}
          </Button>
          <Button
            variant="outlined"
            onClick={() => navigate('/dashboard')}
            disabled={loading}
          >
            Cancel
          </Button>
        </Box>
      </Box>

      {/* Template Menu */}
      <Menu
        anchorEl={templateMenu}
        open={Boolean(templateMenu)}
        onClose={() => setTemplateMenu(null)}
      >
        {EMAIL_TEMPLATES.map((template, index) => (
          <MenuItem
            key={index}
            onClick={() => handleTemplateSelect(template)}
          >
            {template.name}
          </MenuItem>
        ))}
      </Menu>

      {/* Schedule Dialog */}
      <Dialog
        open={scheduleDialog}
        onClose={() => setScheduleDialog(false)}
      >
        <DialogTitle>Schedule Email</DialogTitle>
        <DialogContent>
          <TextField
            type="datetime-local"
            fullWidth
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScheduleDialog(false)}>Cancel</Button>
          <Button onClick={handleSchedule} color="primary">
            Schedule
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        message={snackbar.message}
      />
    </Paper>
  );
};

export default ComposeEmail;
