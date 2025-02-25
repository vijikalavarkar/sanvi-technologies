import React, { useEffect, useRef, useState } from 'react';
import {
  Paper,
  Button,
  Typography,
  Box,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  ListItemAvatar,
  Avatar,
} from '@mui/material';
import {
  Videocam,
  VideocamOff,
  Mic,
  MicOff,
  ScreenShare,
  StopScreenShare,
  ContentCopy,
  People,
  Delete,
  Chat as ChatIcon,
  Settings,
  CallEnd,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const getWebSocketUrl = (roomId, user) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = process.env.REACT_APP_API_URL?.replace(/^https?:\/\//, '') || 'localhost:8000';
  return `${protocol}//${host}/ws/meeting/${roomId}?user_id=${user.id}&name=${encodeURIComponent(user.full_name)}`;
};

const Meeting = () => {
  const { roomId } = useParams();
  const { user } = useAuth();
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState({});
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(!roomId);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitedEmails, setInvitedEmails] = useState([]);
  const [error, setError] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const navigate = useNavigate();
  
  const localVideoRef = useRef(null);
  const localStream = useRef(null);
  const peerConnections = useRef({});
  const websocket = useRef(null);
  const messagesEndRef = useRef(null);

  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  };

  useEffect(() => {
    if (!user || !roomId) return;

    const setupMeeting = async () => {
      try {
        // First initialize the stream
        await initializeStream();

        // Then set up the WebSocket connection
        const wsUrl = `${API_URL.replace('http', 'ws')}/ws/meeting/${roomId}?user_id=${user.id}&user_name=${encodeURIComponent(user.full_name)}`;
        websocket.current = new WebSocket(wsUrl);

        websocket.current.onopen = () => {
          console.log('Meeting WebSocket Connected');
        };

        websocket.current.onmessage = async (event) => {
          const data = JSON.parse(event.data);
          
          switch (data.type) {
            case 'room_state':
              setParticipants(data.data.participants);
              setMessages(data.data.messages);
              // Initialize peer connections for existing participants
              if (localStream.current) {
                Object.keys(data.data.participants).forEach(participantId => {
                  if (participantId !== user.id) {
                    createPeerConnection(participantId);
                  }
                });
              }
              break;
              
            case 'user_joined':
              setParticipants(prev => ({
                ...prev,
                [data.user.id]: data.user
              }));
              if (data.user.id !== user.id && localStream.current) {
                createPeerConnection(data.user.id);
              }
              break;
              
            case 'user_left':
              setParticipants(prev => {
                const newParticipants = { ...prev };
                delete newParticipants[data.user_id];
                return newParticipants;
              });
              if (peerConnections.current[data.user_id]) {
                peerConnections.current[data.user_id].close();
                delete peerConnections.current[data.user_id];
              }
              break;
              
            case 'offer':
              await handleOffer(data);
              break;
              
            case 'answer':
              await handleAnswer(data);
              break;
              
            case 'ice-candidate':
              await handleIceCandidate(data);
              break;
              
            case 'media_state':
              handleMediaStateUpdate(data);
              break;
              
            case 'chat':
              setMessages(prev => [...prev, data]);
              break;
          }
        };

        websocket.current.onclose = () => {
          console.log('Meeting WebSocket Disconnected');
          cleanup();
        };
      } catch (err) {
        console.error('Error setting up meeting:', err);
        setError('Failed to initialize meeting');
      }
    };

    setupMeeting();

    return () => cleanup();
  }, [user, roomId]);

  const initializeStream = async () => {
    try {
      console.log('Initializing media stream...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      console.log('Stream obtained:', stream);
      localStream.current = stream;

      if (localVideoRef.current) {
        console.log('Setting video source...');
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play().catch(e => console.error('Error playing video:', e));
      } else {
        console.error('Video element reference not found');
      }

      sendMediaState();
      return true;
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setError('Error accessing camera/microphone. Please ensure you have granted permission.');
      return false;
    }
  };

  const createPeerConnection = (participantId) => {
    try {
      if (peerConnections.current[participantId]) {
        console.log('Peer connection already exists for:', participantId);
        return peerConnections.current[participantId];
      }

      console.log('Creating new peer connection for:', participantId);
      const pc = new RTCPeerConnection(configuration);
      peerConnections.current[participantId] = pc;

      if (localStream.current) {
        console.log('Adding local tracks to peer connection');
        localStream.current.getTracks().forEach(track => {
          pc.addTrack(track, localStream.current);
        });
      } else {
        console.warn('No local stream available when creating peer connection');
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendWebSocketMessage({
            type: 'ice-candidate',
            candidate: event.candidate,
            target_user_id: participantId
          });
        }
      };

      pc.ontrack = (event) => {
        console.log('Received remote track from:', participantId);
        const [remoteStream] = event.streams;
        setRemoteStreams(prev => ({
          ...prev,
          [participantId]: remoteStream
        }));
      };

      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendWebSocketMessage({
            type: 'offer',
            offer: pc.localDescription,
            target_user_id: participantId
          });
        } catch (err) {
          console.error('Error creating offer:', err);
        }
      };

      return pc;
    } catch (err) {
      console.error('Error creating peer connection:', err);
      return null;
    }
  };

  const handleOffer = async (data) => {
    try {
      console.log('Handling offer from:', data.user_id);
      const pc = createPeerConnection(data.user_id);
      
      if (!pc) {
        console.error('Failed to create peer connection for offer');
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      sendWebSocketMessage({
        type: 'answer',
        answer,
        target_user_id: data.user_id
      });
    } catch (err) {
      console.error('Error handling offer:', err);
    }
  };

  const handleAnswer = async (data) => {
    try {
      console.log('Handling answer from:', data.user_id);
      const pc = peerConnections.current[data.user_id];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      } else {
        console.warn('No peer connection found for answer from:', data.user_id);
      }
    } catch (err) {
      console.error('Error handling answer:', err);
    }
  };

  const handleIceCandidate = async (data) => {
    try {
      console.log('Handling ICE candidate from:', data.user_id);
      const pc = peerConnections.current[data.user_id];
      if (pc) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        console.warn('No peer connection found for ICE candidate from:', data.user_id);
      }
    } catch (err) {
      console.error('Error handling ICE candidate:', err);
    }
  };

  const sendWebSocketMessage = (message) => {
    if (websocket.current?.readyState === WebSocket.OPEN) {
      websocket.current.send(JSON.stringify({
        ...message,
        user_id: user.id,
        user_name: user.full_name
      }));
    }
  };

  const sendMediaState = () => {
    sendWebSocketMessage({
      type: 'media_state',
      state: {
        video: isCameraOn,
        audio: isMicOn,
        screen: isScreenSharing
      }
    });
  };

  const handleMediaStateUpdate = (data) => {
    const { user_id, state } = data;
    setParticipants(prev => ({
      ...prev,
      [user_id]: {
        ...prev[user_id],
        mediaState: state
      }
    }));
  };

  const cleanup = () => {
    // Stop all tracks in the local stream
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        track.stop();
      });
      localStream.current = null;
    }

    // Close all peer connections
    Object.values(peerConnections.current).forEach(pc => {
      if (pc) {
        pc.close();
      }
    });
    peerConnections.current = {};

    // Close websocket connection
    if (websocket.current) {
      websocket.current.close();
      websocket.current = null;
    }

    // Clear video element
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  };

  const addInvitedEmail = () => {
    if (inviteEmail && !invitedEmails.includes(inviteEmail)) {
      setInvitedEmails([...invitedEmails, inviteEmail]);
      setInviteEmail('');
    }
  };

  const removeInvitedEmail = (email) => {
    setInvitedEmails(invitedEmails.filter(e => e !== email));
  };

  const createMeeting = async () => {
    try {
      if (!meetingTitle.trim()) {
        setError('Meeting title is required');
        return;
      }

      if (!scheduledTime) {
        setError('Meeting time is required');
        return;
      }

      const token = localStorage.getItem('token');
      if (!token) {
        setError('You must be logged in to create a meeting');
        return;
      }

      const response = await axios.post(
        `${API_URL}/api/meetings`,
        {
          title: meetingTitle.trim(),
          scheduled_time: scheduledTime,
          invited_emails: invitedEmails
        },
        {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          withCredentials: true
        }
      );
      
      if (response.data && response.data.room_id) {
        const joinUrl = `/dashboard/meeting/${response.data.room_id}`;
        window.location.href = joinUrl;
      } else {
        setError('Invalid response from server');
      }
    } catch (err) {
      console.error('Error creating meeting:', err);
      setError(
        err.response?.data?.detail || 
        err.message || 
        'Failed to create meeting'
      );
    }
  };

  const toggleCamera = async () => {
    if (localStream.current) {
      const videoTrack = localStream.current.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsCameraOn(videoTrack.enabled);
      sendMediaState();
    }
  };

  const toggleMicrophone = async () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicOn(audioTrack.enabled);
      sendMediaState();
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        // Stop screen sharing
        localStream.current.getTracks().forEach(track => {
          if (track.kind === 'video') {
            track.stop();
          }
        });
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = newStream.getVideoTracks()[0];
        replaceTrack(videoTrack);
      } else {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia();
        const screenTrack = screenStream.getVideoTracks()[0];
        replaceTrack(screenTrack);
      }
      setIsScreenSharing(!isScreenSharing);
      sendMediaState();
    } catch (err) {
      console.error('Error toggling screen share:', err);
    }
  };

  const replaceTrack = (newTrack) => {
    if (localStream.current) {
      const oldTrack = localStream.current.getVideoTracks()[0];
      localStream.current.removeTrack(oldTrack);
      localStream.current.addTrack(newTrack);
      
      Object.values(peerConnections.current).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(newTrack);
        }
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream.current;
      }
    }
  };

  const copyMeetingLink = () => {
    const link = `${window.location.origin}/dashboard/meeting/${roomId}`;
    navigator.clipboard.writeText(link);
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || !websocket.current) return;

    const message = {
      type: 'chat',
      content: newMessage.trim(),
      sender: user.full_name,
      timestamp: new Date().toISOString(),
    };

    websocket.current.send(JSON.stringify(message));
    setNewMessage('');
  };

  const handleLeaveMeeting = () => {
    cleanup();
    navigate('/dashboard');  // Navigate back to dashboard after leaving
  };

  const generateMeetingLink = () => {
    return `${window.location.origin}/dashboard/meeting/${roomId}`;
  };

  const handleCopyLink = async () => {
    const link = generateMeetingLink();
    try {
      await navigator.clipboard.writeText(link);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  // Add Share Dialog component
  const ShareDialog = () => (
    <Dialog open={showShareDialog} onClose={() => setShowShareDialog(false)}>
      <DialogTitle>Share Meeting Link</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <TextField
            fullWidth
            value={generateMeetingLink()}
            InputProps={{
              readOnly: true,
              endAdornment: (
                <IconButton onClick={handleCopyLink}>
                  <ContentCopy />
                </IconButton>
              ),
            }}
          />
          {copySuccess && (
            <Typography color="success" variant="caption" sx={{ mt: 1 }}>
              Link copied to clipboard!
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setShowShareDialog(false)}>Close</Button>
      </DialogActions>
    </Dialog>
  );

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {error && (
        <Box sx={{ p: 2, bgcolor: 'error.light', color: 'error.contrastText' }}>
          <Typography>{error}</Typography>
        </Box>
      )}

      <Box sx={{ flexGrow: 1, p: 2 }}>
        <Grid container spacing={2}>
          {/* Local video */}
          <Grid item xs={12} md={3}>
            <Paper elevation={3} sx={{ p: 1, position: 'relative' }}>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                style={{ width: '100%', borderRadius: 8 }}
              />
              <Typography
                variant="caption"
                sx={{
                  position: 'absolute',
                  bottom: 8,
                  left: 8,
                  color: 'white',
                  bgcolor: 'rgba(0,0,0,0.5)',
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
              >
                You
              </Typography>
            </Paper>
          </Grid>

          {/* Remote videos */}
          {Object.entries(remoteStreams).map(([userId, stream]) => (
            <Grid item xs={12} md={3} key={userId}>
              <Paper elevation={3} sx={{ p: 1, position: 'relative' }}>
                <video
                  autoPlay
                  playsInline
                  style={{ width: '100%', borderRadius: 8 }}
                  srcObject={stream}
                />
                <Typography
                  variant="caption"
                  sx={{
                    position: 'absolute',
                    bottom: 8,
                    left: 8,
                    color: 'white',
                    bgcolor: 'rgba(0,0,0,0.5)',
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}
                >
                  {participants[userId]?.name || 'Participant'}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* Controls */}
      <Paper
        elevation={3}
        sx={{
          p: 2,
          display: 'flex',
          justifyContent: 'center',
          gap: 2,
          alignItems: 'center',
        }}
      >
        <IconButton onClick={toggleCamera} color={isCameraOn ? 'primary' : 'error'}>
          {isCameraOn ? <Videocam /> : <VideocamOff />}
        </IconButton>
        <IconButton onClick={toggleMicrophone} color={isMicOn ? 'primary' : 'error'}>
          {isMicOn ? <Mic /> : <MicOff />}
        </IconButton>
        <IconButton onClick={toggleScreenShare} color={isScreenSharing ? 'primary' : 'inherit'}>
          {isScreenSharing ? <StopScreenShare /> : <ScreenShare />}
        </IconButton>
        <IconButton onClick={() => setShowChat(!showChat)} color={showChat ? 'primary' : 'inherit'}>
          <ChatIcon />
        </IconButton>
        <IconButton onClick={() => setShowSettings(!showSettings)}>
          <Settings />
        </IconButton>
        <Button
          variant="contained"
          color="primary"
          startIcon={<ContentCopy />}
          onClick={() => setShowShareDialog(true)}
        >
          Share Link
        </Button>
        <Button
          variant="contained"
          color="error"
          startIcon={<CallEnd />}
          onClick={handleLeaveMeeting}
        >
          Leave Meeting
        </Button>
      </Paper>

      {/* Add Share Dialog */}
      <ShareDialog />

      {/* Chat Dialog */}
      <Dialog
        open={showChat}
        onClose={() => setShowChat(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Meeting Chat</DialogTitle>
        <DialogContent>
          <List sx={{ height: 400, overflow: 'auto' }}>
            {messages.map((message, index) => (
              <ListItem key={index}>
                <ListItemAvatar>
                  <Avatar>{message.sender[0]}</Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={message.content}
                  secondary={`${message.sender} - ${new Date(message.timestamp).toLocaleTimeString()}`}
                />
              </ListItem>
            ))}
            <div ref={messagesEndRef} />
          </List>
          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <TextField
              fullWidth
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              placeholder="Type a message..."
              variant="outlined"
              size="small"
            />
            <Button
              variant="contained"
              onClick={handleSendMessage}
              disabled={!newMessage.trim()}
            >
              Send
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Settings</DialogTitle>
        <DialogContent>
          {/* Add settings controls here */}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSettings(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Meeting;
