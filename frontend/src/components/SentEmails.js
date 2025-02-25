import React, { useState, useEffect } from 'react';
import {
  Paper,
  List,
  ListItem,
  ListItemText,
  Typography,
  Divider,
  CircularProgress,
  Alert,
} from '@mui/material';
import axios from 'axios';
import { format } from 'date-fns';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const SentEmails = () => {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSentEmails = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('No authentication token found');
        }

        const response = await axios.get(`${API_URL}/api/emails/sent`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        setEmails(response.data);
      } catch (err) {
        console.error('Error fetching sent emails:', err);
        setError(
          err.response?.data?.detail ||
          err.message ||
          'Failed to fetch sent emails'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchSentEmails();
  }, []);

  if (loading) {
    return (
      <Paper elevation={3} sx={{ p: 3, textAlign: 'center' }}>
        <CircularProgress />
      </Paper>
    );
  }

  return (
    <Paper elevation={3}>
      <Typography variant="h5" sx={{ p: 2 }}>
        Sent Emails
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mx: 2, mb: 2 }}>
          {error}
        </Alert>
      )}

      <Divider />
      
      <List>
        {emails.length === 0 ? (
          <ListItem>
            <ListItemText primary="No sent emails found" />
          </ListItem>
        ) : (
          emails.map((email) => (
            <React.Fragment key={email.id}>
              <ListItem>
                <ListItemText
                  primary={
                    <Typography variant="subtitle1">
                      {email.subject || '(No subject)'}
                    </Typography>
                  }
                  secondary={
                    <>
                      <Typography component="span" variant="body2" color="text.primary">
                        To: {email.recipient_email}
                      </Typography>
                      <br />
                      <Typography component="span" variant="body2">
                        {format(new Date(email.created_at), 'PPpp')}
                      </Typography>
                    </>
                  }
                />
              </ListItem>
              <Divider />
            </React.Fragment>
          ))
        )}
      </List>
    </Paper>
  );
};

export default SentEmails;
