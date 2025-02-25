import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Grid,
  IconButton,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Alert,
  Chip,
  Autocomplete,
  Snackbar,
  Card,
  CardContent,
  CardActions,
} from '@mui/material';
import {
  VideoCall,
  Add,
  KeyboardArrowRight,
  Schedule,
  CalendarToday,
  AccessTime,
  ContentCopy,
  People,
  Delete,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const MeetingsHome = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitedEmails, setInvitedEmails] = useState([]);
  const [error, setError] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [scheduledMeetings, setScheduledMeetings] = useState([]);
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);

  useEffect(() => {
    fetchRegisteredUsers();
    fetchScheduledMeetings();
  }, []);

  const fetchRegisteredUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setRegisteredUsers(response.data);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const fetchScheduledMeetings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/meetings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setScheduledMeetings(response.data);
    } catch (err) {
      console.error('Error fetching meetings:', err);
    }
  };

  const handleCreateMeeting = async () => {
    try {
      if (!meetingTitle.trim()) {
        setError('Meeting title is required');
        return;
      }

      if (!scheduledTime) {
        setError('Meeting time is required');
        return;
      }

      // Convert local datetime to UTC ISO string
      const scheduledDate = new Date(scheduledTime);
      if (isNaN(scheduledDate.getTime())) {
        setError('Invalid date format');
        return;
      }

      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/meetings`,
        {
          title: meetingTitle.trim(),
          scheduled_time: scheduledDate.toISOString(), // This ensures UTC format
          invited_emails: invitedEmails
        },
        {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );
      
      if (response.data) {
        setShowCreateDialog(false);
        await fetchScheduledMeetings(); // Refresh the meetings list
        setMeetingTitle('');
        setScheduledTime('');
        setInvitedEmails([]);
        setError('');
      }
    } catch (err) {
      console.error('Error creating meeting:', err);
      setError(err.response?.data?.detail || 'Failed to create meeting');
    }
  };

  const handleJoinMeeting = () => {
    if (joinCode.trim()) {
      navigate(`/dashboard/meeting/${joinCode.trim()}`);
    }
  };

  const handleCopyMeetingLink = (roomId) => {
    const link = `${window.location.origin}/dashboard/meeting/${roomId}`;
    navigator.clipboard.writeText(link);
    setShowCopySuccess(true);
  };

  const handleDeleteMeeting = async (meeting) => {
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/meetings/${meeting.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      // Refresh meetings list
      fetchScheduledMeetings();
      setDeleteConfirmOpen(false);
      setSelectedMeeting(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete meeting');
    }
  };

  const formatDateTime = (dateTimeStr) => {
    try {
      const date = new Date(dateTimeStr);
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }
      
      // Convert UTC to local time
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: userTimezone
      }).format(date);
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Hero Section */}
      <Grid container spacing={4} alignItems="center" sx={{ mb: 6 }}>
        <Grid item xs={12} md={6}>
          <Typography variant="h3" gutterBottom>
            Premium video meetings.
          </Typography>
          <Typography variant="h6" color="text.secondary" paragraph>
            Now free for everyone. Secure video conferencing with screen sharing and chat.
          </Typography>
          <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              size="large"
              startIcon={<VideoCall />}
              onClick={() => setShowCreateDialog(true)}
            >
              New Meeting
            </Button>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField
                placeholder="Enter meeting code"
                size="small"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
              />
              <Button
                variant="outlined"
                endIcon={<KeyboardArrowRight />}
                onClick={handleJoinMeeting}
                disabled={!joinCode.trim()}
              >
                Join
              </Button>
            </Box>
          </Box>
        </Grid>
      </Grid>

      {/* Scheduled Meetings Section */}
      <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
        Your Scheduled Meetings
      </Typography>
      <Grid container spacing={3}>
        {scheduledMeetings.map((meeting) => (
          <Grid item xs={12} sm={6} md={4} key={meeting.id}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {meeting.title}
                </Typography>
                <Typography color="textSecondary" gutterBottom>
                  <Schedule sx={{ mr: 1, verticalAlign: 'middle' }} />
                  {formatDateTime(meeting.scheduled_time)}
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <Chip
                    icon={<People />}
                    label={`${meeting.participant_count || 0} participants`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                </Box>
              </CardContent>
              <CardActions sx={{ justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => navigate(`/dashboard/meeting/${meeting.room_id}`)}
                >
                  Join
                </Button>
                <IconButton
                  onClick={() => handleCopyMeetingLink(meeting.room_id)}
                  color="primary"
                >
                  <ContentCopy />
                </IconButton>
                {meeting.host_id === user.id && (
                  <IconButton
                    onClick={() => {
                      setSelectedMeeting(meeting);
                      setDeleteConfirmOpen(true);
                    }}
                    color="error"
                  >
                    <Delete />
                  </IconButton>
                )}
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Create Meeting Dialog */}
      <Dialog 
        open={showCreateDialog} 
        onClose={() => setShowCreateDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Schedule New Meeting</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            fullWidth
            label="Meeting Title"
            value={meetingTitle}
            onChange={(e) => setMeetingTitle(e.target.value)}
            sx={{ mb: 2, mt: 2 }}
          />
          <TextField
            fullWidth
            label="Schedule Time"
            type="datetime-local"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          <Autocomplete
            multiple
            options={registeredUsers}
            getOptionLabel={(option) => option.email}
            value={registeredUsers.filter(user => invitedEmails.includes(user.email))}
            onChange={(event, newValue) => {
              setInvitedEmails(newValue.map(user => user.email));
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Invite Participants"
                placeholder="Select users to invite"
              />
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  label={option.email}
                  {...getTagProps({ index })}
                  key={option.id}
                />
              ))
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCreateDialog(false)}>Cancel</Button>
          <Button
            onClick={handleCreateMeeting}
            variant="contained"
            disabled={!meetingTitle.trim() || !scheduledTime}
          >
            Schedule Meeting
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setSelectedMeeting(null);
        }}
      >
        <DialogTitle>Delete Meeting</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this meeting? This action cannot be undone.
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setDeleteConfirmOpen(false);
              setSelectedMeeting(null);
              setError('');
            }}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (selectedMeeting) {
                handleDeleteMeeting(selectedMeeting);
              }
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={showCopySuccess}
        autoHideDuration={3000}
        onClose={() => setShowCopySuccess(false)}
        message="Meeting link copied to clipboard"
      />
    </Box>
  );
};

export default MeetingsHome; 