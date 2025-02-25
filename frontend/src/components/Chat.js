import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Paper,
  Box,
  TextField,
  Button,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  IconButton,
  Input,
  CircularProgress,
  Divider,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Chip,
  Collapse,
  Badge,
  Tabs,
  Tab,
  ListItemIcon,
  useTheme,
  Popover,
  Alert,
  Link,
} from '@mui/material';
import {
  Send,
  AttachFile,
  InsertDriveFile,
  Image,
  Download,
  Delete,
  Reply,
  EmojiEmotions,
  MoreVert,
  Edit,
  ContentCopy,
  Search,
  Gif,
  VideoCall,
  Call,
  KeyboardVoice,
  Stop,
  Poll,
  Group,
  PersonAdd,
  Person,
  Circle as CircleIcon,
  Phone,
  CallEnd,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { debounce } from 'lodash';
import axios from 'axios';
import EmojiPicker from 'emoji-picker-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

const VideoCallDialog = ({ open, onClose, user, selectedUser }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const websocket = useRef(null);

  useEffect(() => {
    if (open) {
      const roomId = `private_${user.id}_${selectedUser.id}`;
      const wsUrl = `${API_URL.replace('http', 'ws')}/ws/meeting/${roomId}?user_id=${user.id}&user_name=${encodeURIComponent(user.full_name)}`;
      websocket.current = new WebSocket(wsUrl);

      websocket.current.onopen = () => {
        startLocalVideo();
      };

      websocket.current.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'offer' && data.sender !== user.id) {
          handleOffer(data.offer);
        } else if (data.type === 'answer' && data.sender !== user.id) {
          handleAnswer(data.answer);
        } else if (data.type === 'ice-candidate' && data.sender !== user.id) {
          handleIceCandidate(data.candidate);
        }
      };
    }

    return () => cleanup();
  }, [open]);

  const startLocalVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
          setLocalStream(stream);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
      }
      initializePeerConnection(stream);
    } catch (err) {
      console.error('Error accessing media devices:', err);
    }
  };

  const initializePeerConnection = (stream) => {
    const configuration = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    const pc = new RTCPeerConnection(configuration);
    setPeerConnection(pc);

    // Add local stream tracks to peer connection
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    // Handle incoming stream
    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && websocket.current?.readyState === WebSocket.OPEN) {
        websocket.current.send(JSON.stringify({
          type: 'ice-candidate',
          candidate: event.candidate,
          sender: user.id,
          recipient: selectedUser.id
        }));
      }
    };

    // Create and send offer
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        if (websocket.current?.readyState === WebSocket.OPEN) {
          websocket.current.send(JSON.stringify({
            type: 'offer',
            offer: pc.localDescription,
            sender: user.id,
            recipient: selectedUser.id
          }));
        }
      })
      .catch(err => console.error('Error creating offer:', err));
  };

  const handleOffer = async (offer) => {
    if (!peerConnection) return;
    
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      if (websocket.current?.readyState === WebSocket.OPEN) {
        websocket.current.send(JSON.stringify({
          type: 'answer',
          answer: peerConnection.localDescription,
          sender: user.id,
          recipient: selectedUser.id
        }));
      }
    } catch (err) {
      console.error('Error handling offer:', err);
    }
  };

  const handleAnswer = async (answer) => {
    if (!peerConnection) return;
    
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error('Error handling answer:', err);
    }
  };

  const handleIceCandidate = async (candidate) => {
    if (!peerConnection) return;
    
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('Error handling ICE candidate:', err);
    }
  };

  const cleanup = () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
      peerConnection.close();
    }
    if (websocket.current) {
      websocket.current.close();
    }
    setLocalStream(null);
    setRemoteStream(null);
    setPeerConnection(null);
  };

  return (
    <Dialog open={open} onClose={() => {
      cleanup();
      onClose();
    }} maxWidth="lg" fullWidth>
      <DialogTitle>Video Call with {selectedUser?.full_name}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
          <Box>
            <Typography variant="subtitle1">You</Typography>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '400px', height: '300px', backgroundColor: '#000', borderRadius: '8px' }}
            />
          </Box>
          <Box>
            <Typography variant="subtitle1">{selectedUser?.full_name}</Typography>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              style={{ width: '400px', height: '300px', backgroundColor: '#000', borderRadius: '8px' }}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button 
          variant="contained" 
          color="error" 
          onClick={() => {
            cleanup();
            onClose();
          }}
        >
          End Call
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const PollDialog = ({ open, onClose, onSubmit }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  const handleAddOption = () => {
    setOptions([...options, '']);
  };

  const handleOptionChange = (index, value) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleSubmit = () => {
    onSubmit({ question, options: options.filter(opt => opt.trim()) });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Create Poll</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          label="Question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          margin="normal"
        />
        {options.map((option, index) => (
          <TextField
            key={index}
            fullWidth
            label={`Option ${index + 1}`}
            value={option}
            onChange={(e) => handleOptionChange(index, e.target.value)}
            margin="dense"
          />
        ))}
        <Button onClick={handleAddOption} sx={{ mt: 1 }}>
          Add Option
        </Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} color="primary">
          Create Poll
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const GifPicker = ({ open, onClose, onSelect }) => {
  const [gifs, setGifs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    if (open) {
      loadGifs();
    }
  }, [open]);

  const loadGifs = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/chat/gifs/list`);
      const data = await response.json();
      setGifs(data);
    } catch (err) {
      console.error('Error loading GIFs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/gif')) {
      alert('Please select a GIF file');
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch(`${API_URL}/api/chat/gifs/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      setGifs(prev => [...prev, data]);
      setSelectedFile(null);
      loadGifs(); // Refresh the list
    } catch (err) {
      console.error('Error uploading GIF:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Select or Upload a GIF</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <input
            accept="image/gif"
            type="file"
            id="gif-upload"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <label htmlFor="gif-upload">
            <Button
              variant="contained"
              component="span"
              disabled={loading}
            >
              Choose GIF
            </Button>
          </label>
          {selectedFile && (
            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center' }}>
              <Typography sx={{ mr: 1 }}>{selectedFile.name}</Typography>
              <Button
                onClick={handleUpload}
                variant="contained"
                color="primary"
                disabled={loading}
              >
                Upload
              </Button>
            </Box>
          )}
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {gifs.map((gif) => (
            <Box
              key={gif.filename}
              component="img"
              src={`${API_URL}/chat_gifs/${gif.filename}`}
              alt={gif.filename}
              sx={{
                cursor: 'pointer',
                '&:hover': { opacity: 0.8 },
                height: 150,
                objectFit: 'cover',
              }}
              onClick={() => {
                onSelect(`${API_URL}/chat_gifs/${gif.filename}`);
                onClose();
              }}
            />
          ))}
        </Box>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <CircularProgress />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};

const AudioCallDialog = ({ open, onClose, selectedUser }) => {
  const [isCallStarted, setIsCallStarted] = useState(false);
  const [error, setError] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (!open) {
      cleanup();
    }
  }, [open]);

  const cleanup = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    setIsCallStarted(false);
    setError('');
  };

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setLocalStream(stream);
      if (audioRef.current) {
        audioRef.current.srcObject = stream;
      }
      setIsCallStarted(true);
    } catch (err) {
      setError('Failed to access microphone');
      console.error('Error accessing microphone:', err);
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      aria-labelledby="audio-call-dialog-title"
      disablePortal={false}
      keepMounted={false}
    >
      <DialogTitle id="audio-call-dialog-title">
        Audio Call with {selectedUser?.full_name}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <audio ref={audioRef} autoPlay muted style={{ display: 'none' }} />
          {!isCallStarted ? (
            <Button
              variant="contained"
              color="primary"
              onClick={startCall}
              startIcon={<Phone />}
            >
              Start Call
            </Button>
          ) : (
            <Button
              variant="contained"
              color="error"
              onClick={cleanup}
              startIcon={<CallEnd />}
            >
              End Call
            </Button>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

const Chat = () => {
  const theme = useTheme();
  const { user } = useAuth();
  const [selectedTab, setSelectedTab] = useState(0);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [createGroupDialog, setCreateGroupDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [showPollDialog, setShowPollDialog] = useState(false);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiAnchorEl, setEmojiAnchorEl] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioCallDialogOpen, setAudioCallDialogOpen] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingInterval, setRecordingInterval] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});

  useEffect(() => {
    fetchGroups();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedGroup) {
      fetchGroupMessages(selectedGroup.id);
    } else if (selectedUser) {
      fetchPrivateMessages(selectedUser.id);
    }
  }, [selectedGroup, selectedUser]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchGroups = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/chat/groups`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setGroups(response.data);
    } catch (error) {
      setError('Failed to fetch groups');
      console.error('Error fetching groups:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setUsers(response.data.filter(u => u.id !== user.id));
    } catch (error) {
      setError('Failed to fetch users');
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGroupMessages = async (groupId) => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/chat/groups/${groupId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setMessages(response.data);
      
      // Mark messages as read when fetched
      markMessagesAsRead(response.data);
    } catch (error) {
      setError('Failed to fetch group messages');
      console.error('Error fetching group messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPrivateMessages = async (userId) => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/chat/messages/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setMessages(response.data);
      
      // Mark messages as read when fetched
      markMessagesAsRead(response.data);
    } catch (error) {
      setError('Failed to fetch private messages');
      console.error('Error fetching private messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmojiClick = (emojiData) => {
    setNewMessage(prev => prev + emojiData.emoji);
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('content', ''); // Always send empty content for file-only messages
      
      if (selectedGroup) {
        formData.append('group_id', selectedGroup.id);
      } else if (selectedUser) {
        formData.append('recipient_id', selectedUser.id);
      }

      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/chat/messages`, formData, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      // Add the new message to the messages array immediately
      const newMessageObj = {
        ...response.data,
        sender_id: user.id,
        sender_email: user.email,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, newMessageObj]);
      setNewMessage('');
      setSelectedFile(null);
    } catch (error) {
      console.error('Error sending file:', error);
      setError('Failed to send file');
      setSelectedFile(null);
    }
  };

  const handleSendMessage = async (file = null) => {
    if ((!newMessage.trim() && !file)) return;

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      
      if (file) {
        formData.append('file', file);
      }
      
      formData.append('content', newMessage.trim());
      
      if (selectedGroup) {
        formData.append('group_id', selectedGroup.id);
      } else if (selectedUser) {
        formData.append('recipient_id', selectedUser.id);
      }

      const response = await axios.post(`${API_URL}/api/chat/messages`, formData, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      // Add the new message to the messages array immediately
      const newMessageObj = {
        ...response.data,
        sender_id: user.id,
        sender_email: user.email,
        content: newMessage.trim(),
        created_at: new Date().toISOString(),
        file_path: file ? response.data.file_path : null,
        file_name: file ? file.name : null
      };
      setMessages(prev => [...prev, newMessageObj]);

      setNewMessage('');
      setSelectedFile(null);
    } catch (error) {
      setError('Failed to send message');
      console.error('Error sending message:', error);
    }
  };

  const handleCreateGroup = async () => {
    try {
      const token = localStorage.getItem('token');
      const groupData = {
        name: newGroupName,
        description: newGroupDescription,
        member_ids: selectedMembers.map(member => member.id)
      };

      await axios.post(`${API_URL}/api/chat/groups`, groupData, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      setCreateGroupDialog(false);
      setNewGroupName('');
      setNewGroupDescription('');
      setSelectedMembers([]);
      fetchGroups();
    } catch (error) {
      setError('Failed to create group');
      console.error('Error creating group:', error);
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString();
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      // Reset and start duration counter
      setRecordingDuration(0);
      const interval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      setRecordingInterval(interval);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        try {
          // Clear the duration interval
          if (recordingInterval) {
            clearInterval(recordingInterval);
            setRecordingInterval(null);
          }

          const duration = recordingDuration; // Capture the final duration
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
          const file = new File([audioBlob], `voice-message-${Date.now()}.webm`, { 
            type: 'audio/webm;codecs=opus'
          });
          
          const formData = new FormData();
          formData.append('file', file);
          formData.append('content', '');
          formData.append('is_voice_message', 'true');
          formData.append('voice_duration', duration.toString());
          
          if (selectedGroup) {
            formData.append('group_id', selectedGroup.id);
          } else if (selectedUser) {
            formData.append('recipient_id', selectedUser.id);
          }

          const token = localStorage.getItem('token');
          const response = await axios.post(`${API_URL}/api/chat/messages`, formData, {
            headers: { 
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'multipart/form-data'
            }
          });

          // Add the new message to the messages array
          const newMessageObj = {
            ...response.data,
            sender_id: user.id,
            sender_email: user.email,
            created_at: new Date().toISOString(),
            is_voice_message: true,
            voice_duration: duration,
            file_path: response.data.file_path,
            file_name: response.data.file_name
          };
          setMessages(prev => [...prev, newMessageObj]);
        } catch (error) {
          console.error('Error sending voice message:', error);
          setError('Failed to send voice message');
        } finally {
          stream.getTracks().forEach(track => track.stop());
          setIsRecording(false);
          setRecordingDuration(0);
          audioChunksRef.current = [];
        }
      };

      mediaRecorder.start(1000); // Start recording with 1-second timeslices
      setIsRecording(true);
    } catch (err) {
      console.error('Error starting voice recording:', err);
      setError('Failed to start voice recording');
      setIsRecording(false);
      setRecordingDuration(0);
      if (recordingInterval) {
        clearInterval(recordingInterval);
        setRecordingInterval(null);
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current = null;
      }
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop();
        if (recordingInterval) {
          clearInterval(recordingInterval);
          setRecordingInterval(null);
        }
      } catch (err) {
        console.error('Error stopping voice recording:', err);
        setError('Failed to stop voice recording');
      }
      setIsRecording(false);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const MessageBubble = ({ message, isOwn }) => (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isOwn ? 'flex-end' : 'flex-start',
        mb: 2,
        maxWidth: '70%',
        alignSelf: isOwn ? 'flex-end' : 'flex-start',
      }}
    >
      {!isOwn && (
        <Typography variant="caption" sx={{ ml: 2, mb: 0.5, color: 'text.secondary' }}>
          {message.sender_email}
        </Typography>
      )}
      <Box
        sx={{
          p: 2,
          borderRadius: 2,
          bgcolor: isOwn ? 'primary.main' : 'grey.100',
          color: isOwn ? 'white' : 'text.primary',
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            [isOwn ? 'right' : 'left']: -10,
            borderStyle: 'solid',
            borderWidth: '10px 10px 0',
            borderColor: `${isOwn ? theme.palette.primary.main : theme.palette.grey[100]} transparent transparent`,
            transform: 'rotate(45deg)',
            transformOrigin: isOwn ? 'right top' : 'left top',
          }
        }}
      >
        {message.content && (
          <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>
            {message.content}
          </Typography>
        )}
        {message.is_voice_message && (
          <Box sx={{ mt: message.content ? 2 : 0 }}>
            <audio
              controls
              preload="metadata"
              style={{ width: '250px' }}
            >
              <source 
                src={`${API_URL}/api/chat/files/${message.voice_message_path}`} 
                type="audio/webm;codecs=opus"
              />
              Your browser does not support the audio element.
            </audio>
            {message.voice_duration && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: isOwn ? 'rgba(255,255,255,0.7)' : 'text.secondary' }}>
                Duration: {formatDuration(message.voice_duration)}
              </Typography>
            )}
          </Box>
        )}
        {message.file_path && !message.is_voice_message && (
          <Box sx={{ mt: message.content ? 2 : 0 }}>
            {message.file_type?.startsWith('audio/') ? (
              <>
                <audio
                  controls
                  preload="metadata"
                  style={{ width: '250px' }}
                >
                  <source 
                    src={`${API_URL}/api/chat/files/${message.file_path}`}
                    type={message.file_type}
                  />
                  Your browser does not support the audio element.
                </audio>
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: isOwn ? 'rgba(255,255,255,0.7)' : 'text.secondary' }}>
                  {message.file_name}
                </Typography>
              </>
            ) : (
              <Link
                href={`${API_URL}/api/chat/files/${message.file_path}`}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: isOwn ? 'inherit' : 'primary.main', textDecoration: 'none' }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AttachFile />
                  <Typography variant="body2">
                    {message.file_name}
                  </Typography>
                </Box>
              </Link>
            )}
          </Box>
        )}
      </Box>
      <Typography variant="caption" sx={{ mt: 0.5, color: 'text.secondary' }}>
        {formatTime(message.created_at)}
      </Typography>
    </Box>
  );

  const markMessagesAsRead = async (messages) => {
    try {
      const unreadMessages = messages.filter(m => !m.is_read && m.recipient_id === user.id);
      if (unreadMessages.length === 0) return;

      const token = localStorage.getItem('token');
      await axios.put(
        `${API_URL}/api/chat/messages/mark-read`,
        { message_ids: unreadMessages.map(m => m.id) },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      // Update local state for messages
      setMessages(prev => prev.map(m => 
        unreadMessages.some(um => um.id === m.id) ? { ...m, is_read: true } : m
      ));

      // Update unread counts state
      setUnreadCounts(prev => {
        const newCounts = { ...prev };
        unreadMessages.forEach(msg => {
          if (newCounts[msg.sender_id]) {
            newCounts[msg.sender_id] = Math.max(0, newCounts[msg.sender_id] - 1);
            if (newCounts[msg.sender_id] === 0) {
              delete newCounts[msg.sender_id];
            }
          }
        });
        return newCounts;
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  // Add this effect to update unread counts
  useEffect(() => {
    const fetchUnreadCounts = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/api/chat/unread-counts`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        setUnreadCounts(response.data);
      } catch (error) {
        console.error('Error fetching unread counts:', error);
      }
    };

    fetchUnreadCounts();
    const interval = setInterval(fetchUnreadCounts, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
      {/* Sidebar */}
      <Paper 
        sx={{ 
          width: 300, 
          borderRadius: 0,
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={selectedTab} 
            onChange={(e, newValue) => setSelectedTab(newValue)}
            variant="fullWidth"
          >
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Person sx={{ mr: 1 }} />
                  Private
                </Box>
              } 
            />
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Group sx={{ mr: 1 }} />
                  Groups
                </Box>
              }
            />
        </Tabs>
        </Box>

        {/* Search Box */}
        <Box sx={{ p: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search..."
            InputProps={{
              startAdornment: <Search sx={{ color: 'text.secondary', mr: 1 }} />,
            }}
          />
        </Box>

        {/* Users/Groups List */}
        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {selectedTab === 0 ? (
            <List>
            {users.map(user => (
              <ListItem
                key={user.id}
                button
                selected={selectedUser?.id === user.id}
                onClick={() => {
                  setSelectedUser(user);
                  setSelectedGroup(null);
                }}
              >
                <ListItemAvatar>
                  <Badge 
                    badgeContent={unreadCounts[user.id] || 0} 
                    color="primary"
                    invisible={!unreadCounts[user.id]}
                  >
                    <Avatar sx={{ bgcolor: theme.palette.primary.main }}>
                      {user.full_name[0].toUpperCase()}
                    </Avatar>
                  </Badge>
                </ListItemAvatar>
                  <ListItemText 
                    primary={user.full_name}
                    secondary={user.email}
                    primaryTypographyProps={{
                      variant: 'subtitle2',
                      fontWeight: selectedUser?.id === user.id ? 600 : 400
                    }}
                  />
                  <CircleIcon 
                    sx={{ 
                      fontSize: 12,
                      color: 'success.main',
                      opacity: 0.8
                    }} 
                  />
              </ListItem>
            ))}
          </List>
        ) : (
          <>
            <Box sx={{ p: 1 }}>
                  <Button
                    fullWidth
                variant="contained"
                onClick={() => setCreateGroupDialog(true)}
                startIcon={<Group />}
                  sx={{ mb: 1 }}
              >
                Create Group
                  </Button>
            </Box>
            <List>
              {groups.map(group => (
                <ListItem
                  key={group.id}
                  button
                  selected={selectedGroup?.id === group.id}
                  onClick={() => {
                    setSelectedGroup(group);
                    setSelectedUser(null);
                  }}
                >
                  <ListItemAvatar>
                      <Avatar sx={{ bgcolor: theme.palette.secondary.main }}>
                        <Group />
                      </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={group.name}
                    secondary={`${group.members.length} members`}
                      primaryTypographyProps={{
                        variant: 'subtitle2',
                        fontWeight: selectedGroup?.id === group.id ? 600 : 400
                      }}
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}
        </Box>
      </Paper>

      {/* Chat Area */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Chat Header */}
        {(selectedGroup || selectedUser) && (
          <Paper 
            sx={{ 
              p: 2, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              borderBottom: 1,
              borderColor: 'divider'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Avatar 
                sx={{ 
                  bgcolor: selectedGroup ? theme.palette.secondary.main : theme.palette.primary.main,
                  mr: 2
                }}
              >
                {selectedGroup ? <Group /> : selectedUser?.full_name[0].toUpperCase()}
              </Avatar>
              <Box>
            <Typography variant="h6">
                  {selectedGroup ? selectedGroup.name : selectedUser?.full_name}
            </Typography>
                <Typography variant="caption" color="text.secondary">
                  {selectedGroup 
                    ? `${selectedGroup.members.length} members`
                    : selectedUser?.email}
                </Typography>
              </Box>
            </Box>
            <Box>
              <Tooltip title="Audio Call">
                <IconButton onClick={() => setAudioCallDialogOpen(true)}>
                  <Call />
                </IconButton>
              </Tooltip>
              <Tooltip title="Video Call">
                <IconButton onClick={() => setShowVideoCall(true)}>
                  <VideoCall />
                </IconButton>
              </Tooltip>
              <Tooltip title="Create Poll">
                <IconButton onClick={() => setShowPollDialog(true)}>
                  <Poll />
                </IconButton>
              </Tooltip>
            {selectedGroup && (
              <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
                <MoreVert />
              </IconButton>
            )}
            </Box>
          </Paper>
        )}

        {/* Messages Area */}
            <Box
              sx={{
            flexGrow: 1, 
            overflow: 'auto', 
            p: 3,
            bgcolor: 'grey.50',
                display: 'flex',
            flexDirection: 'column'
          }}
        >
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Typography color="error">{error}</Typography>
            </Box>
          ) : messages.length === 0 ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Typography color="text.secondary">No messages yet</Typography>
            </Box>
          ) : (
            messages.map((message, index) => {
              const isOwn = message.sender_id === user.id;
              const showDate = index === 0 || 
                formatDate(message.created_at) !== formatDate(messages[index - 1].created_at);

              return (
                <React.Fragment key={message.id}>
                  {showDate && (
                    <Box 
            sx={{
                        display: 'flex', 
                        justifyContent: 'center', 
                        mb: 2, 
                        mt: index === 0 ? 0 : 2 
                      }}
                    >
                      <Chip 
                        label={formatDate(message.created_at)}
                        size="small"
                        sx={{ bgcolor: 'background.paper' }}
                      />
          </Box>
                  )}
                  <MessageBubble message={message} isOwn={isOwn} />
                </React.Fragment>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </Box>

        {/* Message Input */}
        {(selectedGroup || selectedUser) && (
          <Paper 
            sx={{ 
              p: 2, 
              display: 'flex', 
              gap: 1, 
              alignItems: 'center',
              borderTop: 1,
              borderColor: 'divider'
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
            <IconButton 
              size="small"
              onClick={(e) => {
                setEmojiAnchorEl(e.currentTarget);
                setShowEmojiPicker(true);
              }}
            >
              <EmojiEmotions />
            </IconButton>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <IconButton 
                size="small"
                color={isRecording ? 'error' : 'default'}
                onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
              >
                {isRecording ? <Stop /> : <KeyboardVoice />}
              </IconButton>
              {isRecording && (
                <Typography 
                  variant="caption" 
                  color="error"
                  sx={{ 
                    animation: 'pulse 1s infinite',
                    '@keyframes pulse': {
                      '0%': { opacity: 1 },
                      '50%': { opacity: 0.5 },
                      '100%': { opacity: 1 },
                    },
                  }}
                >
                  Recording... {formatDuration(recordingDuration)}
                </Typography>
              )}
            </Box>
            <IconButton 
              size="small"
              onClick={() => fileInputRef.current?.click()}
            >
              <AttachFile />
            </IconButton>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Type a message..."
              size="small"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              multiline
              maxRows={4}
            />
            <IconButton 
              color="primary"
              onClick={() => handleSendMessage()}
              disabled={!newMessage.trim() && !selectedFile}
            >
              <Send />
            </IconButton>

            <Popover
              open={showEmojiPicker}
              anchorEl={emojiAnchorEl}
              onClose={() => {
                setShowEmojiPicker(false);
                setEmojiAnchorEl(null);
              }}
              anchorOrigin={{
                vertical: 'top',
                horizontal: 'left',
              }}
              transformOrigin={{
                vertical: 'bottom',
                horizontal: 'left',
              }}
            >
              <EmojiPicker onEmojiClick={handleEmojiClick} />
            </Popover>
          </Paper>
        )}
      </Box>

      {/* Create Group Dialog */}
      <Dialog 
        open={createGroupDialog} 
        onClose={() => setCreateGroupDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Group</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Group Name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            sx={{ mb: 2, mt: 2 }}
          />
          <TextField
            fullWidth
            label="Description"
            value={newGroupDescription}
            onChange={(e) => setNewGroupDescription(e.target.value)}
            multiline
            rows={2}
            sx={{ mb: 2 }}
          />
          <Typography variant="subtitle1" sx={{ mb: 1 }}>Add Members:</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {users.map(user => (
              <Chip
                key={user.id}
                label={user.full_name}
                onClick={() => {
                  if (selectedMembers.find(m => m.id === user.id)) {
                    setSelectedMembers(selectedMembers.filter(m => m.id !== user.id));
                  } else {
                    setSelectedMembers([...selectedMembers, user]);
                  }
                }}
                color={selectedMembers.find(m => m.id === user.id) ? 'primary' : 'default'}
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateGroupDialog(false)}>Cancel</Button>
          <Button
            onClick={handleCreateGroup}
            variant="contained"
            disabled={!newGroupName.trim() || selectedMembers.length === 0}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Group Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem onClick={() => {
          setAnchorEl(null);
          // Open add members dialog
        }}>
          <ListItemIcon>
            <PersonAdd fontSize="small" />
          </ListItemIcon>
          Add Members
        </MenuItem>
      </Menu>

      {/* Video Call Dialog */}
      {selectedUser && (
        <VideoCallDialog
          open={showVideoCall}
          onClose={() => setShowVideoCall(false)}
          user={user}
          selectedUser={selectedUser}
        />
      )}

      {/* Audio Call Dialog */}
      {selectedUser && (
        <AudioCallDialog
          open={audioCallDialogOpen}
          onClose={() => setAudioCallDialogOpen(false)}
          selectedUser={selectedUser}
        />
      )}
      </Box>
  );
};

export default Chat;
