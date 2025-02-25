import React, { useState, useEffect } from 'react';
import {
  List,
  ListItem,
  ListItemText,
  Typography,
  Paper,
  Divider,
} from '@mui/material';
import axios from 'axios';

const EmailList = () => {
  const [emails, setEmails] = useState([]);

  useEffect(() => {
    const fetchEmails = async () => {
      try {
        const response = await axios.get('http://localhost:8000/emails/');
        setEmails(response.data);
      } catch (error) {
        console.error('Error fetching emails:', error);
      }
    };

    fetchEmails();
  }, []);

  return (
    <Paper elevation={3}>
      <Typography variant="h5" sx={{ p: 2 }}>
        Inbox
      </Typography>
      <Divider />
      <List>
        {emails.map((email) => (
          <React.Fragment key={email.id}>
            <ListItem button>
              <ListItemText
                primary={email.subject}
                secondary={
                  <>
                    <Typography component="span" variant="body2" color="text.primary">
                      {email.sender}
                    </Typography>
                    {` — ${email.content.substring(0, 100)}...`}
                  </>
                }
              />
            </ListItem>
            <Divider />
          </React.Fragment>
        ))}
      </List>
    </Paper>
  );
};

export default EmailList;
