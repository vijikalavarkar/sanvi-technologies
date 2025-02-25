import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Box,
  IconButton,
  Menu,
  MenuItem,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Link,
} from '@mui/material';
import {
  Email as EmailIcon,
  Chat as ChatIcon,
  VideoCall as VideoCallIcon,
  Home as HomeIcon,
  AccountCircle,
  Send as SendIcon,
  Inbox as InboxIcon,
  Delete as DeleteIcon,
  Report as SpamIcon,
  Edit as EditIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

const Layout = ({ children }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [anchorEl, setAnchorEl] = React.useState(null);

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleClose();
    logout();
    navigate('/login');
  };

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <IconButton
            size="large"
            edge="start"
            color="inherit"
            aria-label="home"
            sx={{ mr: 2 }}
            onClick={() => navigate('/')}
          >
            <HomeIcon />
          </IconButton>
          
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Communication Hub
          </Typography>

          <Button 
            color="inherit" 
            onClick={() => navigate('/dashboard')}
            startIcon={<EmailIcon />}
            sx={{ mx: 1 }}
          >
            Emails
          </Button>
          
          <Button 
            color="inherit" 
            onClick={() => navigate('/dashboard/compose')}
            sx={{ mx: 1 }}
          >
            Compose
          </Button>
          
          <Button 
            color="inherit" 
            onClick={() => navigate('/dashboard/sent')}
            startIcon={<SendIcon />}
            sx={{ mx: 1 }}
          >
            Sent Emails
          </Button>
          
          <Button 
            color="inherit" 
            onClick={() => navigate('/dashboard/chat/general')}
            startIcon={<ChatIcon />}
            sx={{ mx: 1 }}
          >
            Chat
          </Button>
          
          <Button 
            color="inherit" 
            onClick={() => navigate('/dashboard/meeting/general')}
            startIcon={<VideoCallIcon />}
            sx={{ mx: 1 }}
          >
            Meeting
          </Button>

          <IconButton
            size="large"
            aria-label="account of current user"
            aria-controls="menu-appbar"
            aria-haspopup="true"
            onClick={handleMenu}
            color="inherit"
          >
            <AccountCircle />
          </IconButton>
          <Menu
            id="menu-appbar"
            anchorEl={anchorEl}
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            keepMounted
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            open={Boolean(anchorEl)}
            onClose={handleClose}
          >
            <MenuItem onClick={handleLogout}>Logout</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg">
        <Box sx={{ mt: 4 }}>
          <List>
            <ListItem button component={Link} to="/dashboard">
              <ListItemIcon>
                <InboxIcon />
              </ListItemIcon>
              <ListItemText primary="Inbox" />
            </ListItem>
            
            <ListItem button component={Link} to="/dashboard/sent">
              <ListItemIcon>
                <SendIcon />
              </ListItemIcon>
              <ListItemText primary="Sent" />
            </ListItem>

            <ListItem button component={Link} to="/dashboard/spam">
              <ListItemIcon>
                <SpamIcon />
              </ListItemIcon>
              <ListItemText primary="Spam" />
            </ListItem>

            <ListItem button component={Link} to="/dashboard/trash">
              <ListItemIcon>
                <DeleteIcon />
              </ListItemIcon>
              <ListItemText primary="Trash" />
            </ListItem>

            <Divider sx={{ my: 1 }} />

            <ListItem button component={Link} to="/dashboard/compose">
              <ListItemIcon>
                <EditIcon />
              </ListItemIcon>
              <ListItemText primary="Compose" />
            </ListItem>
          </List>
          {children}
        </Box>
      </Container>
    </>
  );
};

export default Layout;
