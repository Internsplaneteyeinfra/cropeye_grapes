import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  Send,
  Loader2,
  Search,
  MessageCircle,
  Mail,
  User,
  Shield,
  Users,
  MapPin,
  CheckCircle,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
  Star
} from 'lucide-react';
import { getContactDetails, sendMessage, getConversationWithUser, getConversations, getMessages } from '../api';
import { getUserRole, getUserData } from '../utils/auth';




interface Contact {
  id: number;
  name: string;
  phone: string;
  email: string;
  role: string;
  username: string;
  isOnline?: boolean;
  lastSeen?: string;
  avatar?: string;
}

interface Message {
  id: number;
  conversation: number;
  sender: {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
    role_name: string;
  };
  content: string;
  read_at: string | null;
  is_read: boolean;
  created_at: string;
  updated_at: string;
}

interface Conversation {
  id: number;
  participant1: any;
  participant2: any;
  other_participant: any;
  last_message: Message | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
  last_message_at: string;
}

interface ContactuserProps {
  users?: any[];
  setUsers?: React.Dispatch<React.SetStateAction<any[]>>;
}

// Role-based filtering function
const filterContactsByRole = (contacts: Contact[], currentUserRole: string): Contact[] => {
  switch (currentUserRole.toLowerCase()) {
    case 'fieldofficer':
      // Field Officer can see: Farmers, Managers, Owners, Field Officers
      const fieldOfficerContacts = contacts.filter(contact => {
        const role = contact.role?.toLowerCase() || '';
        return role === 'farmer' || role === 'manager' || role === 'owner' || role === 'admin' || role === 'fieldofficer' || role === 'field_officer';
      });
      return fieldOfficerContacts;

    case 'manager':
      // Manager can see: Owners, Field Officers
      const managerContacts = contacts.filter(contact => {
        const role = contact.role?.toLowerCase() || '';
        return role === 'owner' || role === 'admin' || role === 'fieldofficer' || role === 'field_officer';
      });
      return managerContacts;

    case 'owner':
    case 'admin':
      // Owner/Admin can see: Field Officers, Managers, Farmers
      const ownerContacts = contacts.filter(contact => {
        const role = contact.role?.toLowerCase() || '';
        return role === 'fieldofficer' || role === 'field_officer' || role === 'manager' || role === 'farmer';
      });
      return ownerContacts;

    case 'farmer':
      // Farmer can see: Field Officers, Managers, Owners
      const farmerContacts = contacts.filter(contact => {
        const role = contact.role?.toLowerCase() || '';
        return role === 'fieldofficer' || role === 'field_officer' || role === 'manager' || role === 'owner' || role === 'admin';
      });
      return farmerContacts;

    default:
      // Default: show all contacts
      return contacts;
  }
};

// Get role-based description for header
const getRoleBasedDescription = (currentUserRole: string): string => {
  switch (currentUserRole.toLowerCase()) {
    case 'fieldofficer':
      return 'Connect with farmers, managers, owners, and other field officers in your network';
    case 'manager':
      return 'Connect with owners and field officers under your management';
    case 'owner':
    case 'admin':
      return 'Connect with field officers, managers, and farmers in your organization';
    case 'farmer':
      return 'Connect with field officers, managers, and owners for support';
    default:
      return 'Connect with your team members and send messages';
  }
};

const Contactuser: React.FC<ContactuserProps> = () => {
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [message, setMessage] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [messageSent, setMessageSent] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Message view states
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showMessageView, setShowMessageView] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Store messages locally by conversation ID (fallback when API fails)
  const [localMessages, setLocalMessages] = useState<Record<number, Message[]>>({});

  // Ref for auto-scrolling to latest message
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current && messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages]);

  // Fetch contacts from API
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getContactDetails();

        let usersData = response.data;

        // Handle different API response formats
        if (usersData && typeof usersData === 'object') {
          // If response has a 'results' property (common in paginated APIs)
          if (Array.isArray(usersData.results)) {
            usersData = usersData.results;
          }
          // If response has a 'data' property
          else if (Array.isArray(usersData.data)) {
            usersData = usersData.data;
          }
          // If response has a 'users' property
          else if (Array.isArray(usersData.users)) {
            usersData = usersData.users;
          }
          // If response has a 'contacts' property with role-based structure
          else if (usersData.contacts && typeof usersData.contacts === 'object') {
            // Handle role-based contacts structure: {owner: {...}, field_officers: [...], farmers: [...]}
            const allContacts: any[] = [];

            // Process each role category
            Object.keys(usersData.contacts).forEach(roleKey => {
              const roleData = usersData.contacts[roleKey];

              if (Array.isArray(roleData)) {
                // If it's an array (like field_officers: [], farmers: [])
                roleData.forEach(contact => {
                  allContacts.push({
                    ...contact,
                    role: roleKey === 'field_officers' ? 'fieldofficer' :
                          roleKey === 'farmers' ? 'farmer' :
                          roleKey === 'managers' ? 'manager' :
                          roleKey.replace('_', '') // Convert 'field_officers' to 'fieldofficer', 'farmers' to 'farmer', 'managers' to 'manager'
                  });
                });
              } else if (roleData && typeof roleData === 'object' && roleData.id) {
                // If it's a single object (like owner: {...})
                allContacts.push({
                  ...roleData,
                  role: roleKey
                });
              }
            });

            usersData = allContacts;
          }
          // If response has a 'contact_details' property
          else if (Array.isArray(usersData.contact_details)) {
            usersData = usersData.contact_details;
          }
          // If it's an object with user properties, try to extract users
          else if (usersData.user_list && Array.isArray(usersData.user_list)) {
            usersData = usersData.user_list;
          }
        }

        // Check if usersData is an array
        if (!Array.isArray(usersData)) {
          setError(`Invalid data format received from server. Expected an array of users, but got: ${typeof usersData}. Please check the API response format.`);
          return;
        }

        // Transform API data to Contact format
        const contactsData: Contact[] = usersData.map((user: any) => {
          return {
            id: user.id,
            name: user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'Unknown',
            phone: user.phone || user.phone_number || 'N/A',
            email: user.email || 'N/A',
            role: typeof user.role === 'object' ? (user.role?.name || user.role?.display_name || 'user') : (user.role || 'user'),
            username: user.username || user.name || 'unknown',
            // isOnline: Math.random() > 0.5, // Simulate online status
            lastSeen: new Date(Date.now() - Math.random() * 86400000).toLocaleTimeString(),
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.username || 'User')}&background=random&color=fff&size=128`
          };
        });

        // Apply role-based filtering
        const currentUserRole = getUserRole();
        const filteredContacts = filterContactsByRole(contactsData, currentUserRole || '');

        setContacts(filteredContacts);
        setFilteredContacts(filteredContacts);
      } catch (err: any) {
        setError(`Failed to load contacts: ${err.message || 'Please try again.'}`);
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();
  }, []);

  // Filter contacts based on search and role
  useEffect(() => {
    let filtered = contacts;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(contact =>
        contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by role
    if (selectedRole !== 'all') {
      filtered = filtered.filter(contact => contact.role === selectedRole);
    }

    setFilteredContacts(filtered);
  }, [contacts, searchTerm, selectedRole]);

  // Fetch conversations on component mount
  useEffect(() => {
    fetchConversations();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (showMessageView && messages.length > 0) {
      const messagesContainer = document.querySelector('.messages-container');
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }
  }, [messages, showMessageView]);

  const fetchConversations = async () => {
    try {
      const response = await getConversations();
      const conversationsData = response.data.results || response.data || [];
      setConversations(Array.isArray(conversationsData) ? conversationsData : []);
    } catch (error) {
    }
  };

  const fetchConversationMessages = async (userId: number, mergeWithExisting: boolean = true) => {
    setLoadingMessages(true);
    try {
      const response = await getConversationWithUser(userId);
      const conversation = response.data;
      setSelectedConversation(conversation);

      let allMessages: Message[] = [];

      // PRIORITY 1: Use GET /conversations/{id}/messages/ to fetch ALL messages from backend
      if (conversation.id) {
        try {
          const messagesResponse = await getMessages(conversation.id);

          // Handle different response formats
          if (messagesResponse.data) {
            // Check if it's paginated (has results array)
            if (Array.isArray(messagesResponse.data.results)) {
              allMessages = messagesResponse.data.results;
            }
            // Check if it's a direct array
            else if (Array.isArray(messagesResponse.data)) {
              allMessages = messagesResponse.data;
            }
            // Check if messages are in a messages property
            else if (Array.isArray(messagesResponse.data.messages)) {
              allMessages = messagesResponse.data.messages;
            }
          }

          // Log all message details for debugging
          if (allMessages.length > 0) {
          }
        } catch (err: any) {
          // If endpoint fails, continue with fallback methods
          if (err.response?.status !== 500 && err.response?.status !== 404) {
          }
        }
      }

      // FALLBACK 1: If no messages from API, check conversation.messages
      if (allMessages.length === 0 && conversation.messages && Array.isArray(conversation.messages)) {
        allMessages = conversation.messages;
      }

      // FALLBACK 2: Merge with local storage (but prioritize backend messages)
      if (conversation.id && localMessages[conversation.id] && allMessages.length === 0) {
        allMessages = [...localMessages[conversation.id]];
      } else if (conversation.id && localMessages[conversation.id] && allMessages.length > 0) {
        // Merge: backend messages are source of truth, but add any local messages not in backend
        const backendIds = new Set(allMessages.map((m: Message) => m.id));
        const uniqueLocal = localMessages[conversation.id].filter((m: Message) => !backendIds.has(m.id));
        if (uniqueLocal.length > 0) {
          allMessages = [...allMessages, ...uniqueLocal];
        }
      }

      // FALLBACK 3: If we have last_message, include it if not already present
      if (conversation.last_message) {
        const lastMsgId = conversation.last_message.id;
        if (!allMessages.some((m: Message) => m.id === lastMsgId)) {
          allMessages.push(conversation.last_message);
        }
      }

      // Merge with existing messages in state (if merging is enabled)
      if (mergeWithExisting && messages.length > 0) {
        const newIds = new Set(allMessages.map((m: Message) => m.id));
        const uniqueExisting = messages.filter((m: Message) => !newIds.has(m.id));
        if (uniqueExisting.length > 0) {
          allMessages = [...allMessages, ...uniqueExisting];
        }
      }

      // Sort messages by created_at (oldest first) to show conversation history
      allMessages.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateA - dateB;
      });

      // Remove duplicates based on message ID
      const uniqueMessages = allMessages.filter((msg, index, self) =>
        index === self.findIndex((m: Message) => m.id === msg.id)
      );

      console.log('�� Message details:', uniqueMessages.map(m => ({
        id: m.id,
        sender: m.sender?.first_name + ' ' + m.sender?.last_name,
        recipient: m.recipient?.first_name || m.recipients?.[0]?.first_name,
        content: m.content?.substring(0, 30),
        created_at: m.created_at
      })));

      // Store in local storage for this conversation (as backup)
      if (conversation.id) {
        setLocalMessages(prev => ({
          ...prev,
          [conversation.id]: uniqueMessages
        }));
      }

      // Always update the messages state with all messages
      setMessages(uniqueMessages);
    } catch (error: any) {
      // If conversation doesn't exist, check local storage
      if (localMessages[userId]) {
        const localMsgs = localMessages[userId];
        // Merge with existing if needed
        if (mergeWithExisting && messages.length > 0) {
          const localIds = new Set(localMsgs.map((m: Message) => m.id));
          const uniqueExisting = messages.filter((m: Message) => !localIds.has(m.id));
          setMessages([...localMsgs, ...uniqueExisting].sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return dateA - dateB;
          }));
        } else {
          setMessages(localMsgs);
        }
      } else if (!mergeWithExisting) {
        setSelectedConversation(null);
        setMessages([]);
      }
    } finally {
      setLoadingMessages(false);
    }
  };

  // Update handleOpenConversation to always fetch from backend first
  const handleOpenConversation = async (contact: Contact) => {
    setShowMessageView(true);
    try {
      const convResponse = await getConversationWithUser(contact.id);
      const conversation = convResponse.data;
      setSelectedConversation(conversation);

      // Always fetch from backend first using GET /conversations/{id}/messages/
      // This ensures we get ALL stored messages from the backend
      await fetchConversationMessages(contact.id, false); // Don't merge initially, use backend as source of truth

      // After fetching from backend, merge with local storage if needed
      if (conversation.id && localMessages[conversation.id]) {
        const localMsgs = localMessages[conversation.id];
        setMessages(prev => {
          const backendIds = new Set(prev.map((m: Message) => m.id));
          const uniqueLocal = localMsgs.filter((m: Message) => !backendIds.has(m.id));
          if (uniqueLocal.length > 0) {
            const combined = [...prev, ...uniqueLocal];
            combined.sort((a, b) => {
              const dateA = new Date(a.created_at).getTime();
              const dateB = new Date(b.created_at).getTime();
              return dateA - dateB;
            });
            return combined;
          }
          return prev;
        });
      }
    } catch (error) {
      // If conversation doesn't exist, check if we have local messages by user ID
      if (localMessages[contact.id]) {
        setMessages(localMessages[contact.id]);
      } else {
        setMessages([]);
      }
    }
  };

  // Update handleSendReply to refresh from backend after sending
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation || !replyMessage.trim()) return;

    setSendingReply(true);
    setSendError(null);

    try {
      const otherParticipant = selectedConversation.other_participant;
      if (!otherParticipant) return;

      const response = await sendMessage({
        recipient_id: [otherParticipant.id],
        content: replyMessage.trim()
      });


      setReplyMessage('');

      // IMPORTANT: Always refresh from backend after sending to get ALL messages
      // This ensures both sender and receiver see the complete conversation
      if (selectedConversation.id) {
        try {
          // Wait a moment for backend to process, then fetch ALL messages
          setTimeout(async () => {
            await fetchConversationMessages(otherParticipant.id, false); // Fetch fresh from backend
          }, 1000);
        } catch (refreshErr) {
        }
      }

      // Refresh conversations
      await fetchConversations();
    } catch (error: any) {
      setSendError(error.response?.data?.detail || error.message || 'Failed to send reply. Please try again.');
    } finally {
      setSendingReply(false);
    }
  };

  // Update handleSubmit to refresh from backend after sending
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedContacts.length > 0 && message.trim()) {
      setSendingMessage(true);
      setSendError(null);

      try {
        const recipientIds = selectedContacts.map(c => c.id);
        const response = await sendMessage({
          recipient_id: recipientIds,
          content: message.trim()
        });


        setMessage('');
        setMessageSent(true);
        setTimeout(() => setMessageSent(false), 3000);

        // Refresh conversations
        await fetchConversations();

        // If viewing a conversation, refresh ALL messages from backend
        if (selectedConversation && showMessageView) {
          const otherParticipant = selectedConversation.other_participant;
          if (otherParticipant && recipientIds.includes(otherParticipant.id)) {
            setTimeout(async () => {
              try {
                // Fetch ALL messages from backend to ensure complete history
                await fetchConversationMessages(otherParticipant.id, false);
              } catch (refreshErr) {
              }
            }, 1000);
          }
        }
      } catch (error: any) {
        setSendError(error.response?.data?.detail || error.message || 'Failed to send message. Please try again.');
      } finally {
        setSendingMessage(false);
      }
    }
  };

  const toggleContactSelection = (contact: Contact) => {
    setSelectedContacts(prev => {
      const isSelected = prev.some(c => c.id === contact.id);
      if (isSelected) {
        return prev.filter(c => c.id !== contact.id);
      } else {
        return [...prev, contact];
      }
    });
  };

  const toggleSelectAllForRole = (roleContacts: Contact[]) => {
    const allSelected = roleContacts.every(contact =>
      selectedContacts.some(c => c.id === contact.id)
    );

    if (allSelected) {
      // Deselect all contacts in this role
      setSelectedContacts(prev =>
        prev.filter(contact => !roleContacts.some(roleContact => roleContact.id === contact.id))
      );
    } else {
      // Select all contacts in this role
      setSelectedContacts(prev => {
        const newSelections = roleContacts.filter(contact =>
          !prev.some(c => c.id === contact.id)
        );
        return [...prev, ...newSelections];
      });
    }
  };

  const toggleRoleExpansion = (role: string) => {
    const newExpanded = new Set(expandedRoles);
    if (newExpanded.has(role)) {
      newExpanded.delete(role);
    } else {
      newExpanded.add(role);
    }
    setExpandedRoles(newExpanded);
  };

  const getRoleIcon = (role: string) => {
    switch (role.toLowerCase()) {
      case 'superadmin':
        return <Shield className="w-4 h-4" />;
      case 'owner':
        return <Star className="w-4 h-4" />;
      case 'fieldofficer':
        return <User className="w-4 h-4" />;
      default:
        return <Users className="w-4 h-4" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'superadmin':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'owner':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'fieldofficer':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Group filtered contacts by role
  const contactsByRole = filteredContacts.reduce((acc, contact) => {
    const role = String(contact.role); // Ensure role is always a string
    if (!acc[role]) {
      acc[role] = [];
    }
    acc[role].push(contact);
    return acc;
  }, {} as Record<string, Contact[]>);

  const uniqueRoles = Array.from(new Set(contacts.map(c => c.role)));

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-700">Loading contacts...</h3>
                <p className="text-gray-500 mt-2">Fetching the latest team information</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center py-20">
              <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-6" />
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Oops! Something went wrong</h3>
              <p className="text-red-600 mb-6 max-w-md mx-auto">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="bg-red-600 text-white px-6 py-3 rounded-xl hover:bg-red-700 transition-colors duration-200 flex items-center gap-2 mx-auto"
              >
                <AlertCircle className="w-4 h-4" />
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen dashboard-bg-bleed"
    >
      <div className="min-h-screen bg-black bg-opacity-40">
        <div className="max-w-7xl mx-auto px-4 py-12">
          {/* Title Section */}
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center space-x-4 mb-4">
              <MessageCircle className="h-12 w-12 text-white" />
              <h1 className="text-4xl font-bold text-white">Team Contacts</h1>
            </div>
            <p className="text-white text-lg">
              {getRoleBasedDescription(getUserRole() || '')}
            </p>
          </div>

          {/* Content Card */}
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 bg-opacity-95">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div>

            {/* Stats */}
            {/* <div className="flex gap-4">
              <div className="bg-blue-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{contacts.length}</div>
                <div className="text-sm text-gray-600">Total Contacts</div>
              </div>
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {contacts.filter(c => c.isOnline).length}
                </div>
                <div className="text-sm text-gray-600">Online Now</div>
              </div>
            </div> */}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Contact List */}
          <div className="xl:col-span-2">
            <div className="bg-white rounded-2xl shadow-xl p-6">
              {/* Search and Filter Bar */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search contacts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  />
                </div>

                <div className="flex gap-2">
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All Roles</option>
                    {uniqueRoles.map(role => (
                      <option key={role} value={role}>
                        {role.replace(/([A-Z])/g, ' $1').trim()}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                    className="px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    {viewMode === 'grid' ? 'List' : 'Grid'}
                  </button>
                </div>
              </div>

              {/* Contacts List */}
              <div className="space-y-6">
                {Object.keys(contactsByRole).length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-600 mb-2">No contacts found</h3>
                    <p className="text-gray-500">Try adjusting your search or filter criteria</p>
                  </div>
                ) : (
                  Object.entries(contactsByRole).map(([role, roleContacts]) => (
                    <div key={role} className="border border-gray-100 rounded-xl overflow-hidden">
                      {/* Role Header */}
                      <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-4">
                        <div className="flex items-center justify-between">
                          <div
                            className="flex items-center gap-3 cursor-pointer hover:from-gray-100 hover:to-gray-200 transition-all duration-200 flex-1"
                            onClick={() => toggleRoleExpansion(role)}
                          >
                            {getRoleIcon(role)}
                            <h3 className="text-lg font-semibold text-gray-800 capitalize">
                              {role.replace(/([A-Z])/g, ' $1').trim()}
                            </h3>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleColor(role)}`}>
                              {roleContacts.length}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSelectAllForRole(roleContacts);
                              }}
                              className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors duration-200"
                            >
                              {roleContacts.every(contact =>
                                selectedContacts.some(c => c.id === contact.id)
                              ) ? 'Deselect All' : 'Select All'}
                            </button>
                            {expandedRoles.has(role) ?
                              <ChevronUp className="w-5 h-5 text-gray-500 cursor-pointer" onClick={() => toggleRoleExpansion(role)} /> :
                              <ChevronDown className="w-5 h-5 text-gray-500 cursor-pointer" onClick={() => toggleRoleExpansion(role)} />
                            }
                          </div>
                        </div>
                      </div>

                      {/* Contacts Grid */}
                      {expandedRoles.has(role) && (
                        <div className={`p-4 ${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'space-y-3'}`}>
                          {roleContacts.map((contact) => (
                            <div
                              key={contact.id}
                              onClick={() => {
                                toggleContactSelection(contact);
                              }}
                              className={`group relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 hover:shadow-lg ${
                                selectedContacts.some(c => c.id === contact.id)
                                  ? 'border-blue-500 bg-blue-50 shadow-lg'
                                  : 'border-gray-100 hover:border-blue-300 bg-white'
                              }`}
                            >
                              <div className="flex items-start gap-4">
                                {/* Avatar */}
                                <div className="relative">
                                  <img
                                    src={contact.avatar}
                                    alt={contact.name}
                                    className="w-12 h-12 rounded-full object-cover"
                                  />
                                  {/* {contact.isOnline && (
                                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
                                  )} */}
                                </div>

                                {/* Contact Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="font-semibold text-gray-900 truncate">{contact.name}</h4>
                                    {/* {contact.isOnline && (
                                      <span className="text-xs text-green-600 font-medium">Online</span>
                                    )} */}
                                  </div>
                                  <p className="text-sm text-gray-600 mb-2">@{contact.username}</p>

                                  <div className="flex flex-col gap-1">
                                    {contact.phone !== 'N/A' && (
                                      <a
                                        href={`tel:${contact.phone}`}
                                        className="text-blue-600 hover:text-blue-800 flex items-center gap-2 text-sm transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Phone size={14} />
                      {contact.phone}
                    </a>
                                    )}
                                    {contact.email !== 'N/A' && (
                                      <a
                                        href={`mailto:${contact.email}`}
                                        className="text-gray-600 hover:text-gray-800 flex items-center gap-2 text-sm transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Mail size={14} />
                                        {contact.email}
                                      </a>
                                    )}
                                  </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenConversation(contact);
                                    }}
                                    className="p-2 text-green-600 hover:text-green-800 hover:bg-green-100 rounded-lg transition-all duration-200"
                                    title="View Messages"
                                  >
                                    <MessageCircle size={18} />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleContactSelection(contact);
                                    }}
                                    className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-all duration-200"
                                    title="Select for Message"
                                  >
                                    <Send size={18} />
                                  </button>
                                </div>
                              </div>
                  </div>
                ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
        </div>

        {/* Message Form & Map */}
        <div className="space-y-6">
            {/* Message Form */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <MessageCircle className="w-6 h-6 text-blue-600" />
                <h3 className="text-xl font-semibold text-gray-800">Send Message</h3>
              </div>

              {selectedContacts.length > 0 ? (
                <div className="space-y-6">
                  {/* Selected Contacts */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900">
                        Selected Contacts ({selectedContacts.length})
                      </h4>
                      <button
                        onClick={() => setSelectedContacts([])}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedContacts.map((contact) => (
                        <div key={contact.id} className="flex items-center gap-2 bg-white rounded-lg p-2 border">
                          <img
                            src={contact.avatar}
                            alt={contact.name}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
                            <p className="text-xs text-gray-500">@{contact.username}</p>
                          </div>
                          <button
                            onClick={() => toggleContactSelection(contact)}
                            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
            </div>

                  {/* Message Form */}
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
                        Your Message
                      </label>
              <textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                        className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all duration-200"
                rows={4}
                placeholder="Type your message here..."
              />
            </div>

            <button
              type="submit"
                      disabled={!message.trim() || sendingMessage}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-6 rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all duration-200 font-medium"
            >
                      {sendingMessage ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send size={18} />
                          Send Message
                        </>
                      )}
            </button>

            {sendError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <span className="text-red-800 text-sm">{sendError}</span>
              </div>
            )}
          </form>

                  {/* Success Message */}
                  {messageSent && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="text-green-800 font-medium">Message sent successfully!</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <MessageCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h4 className="text-lg font-semibold text-gray-600 mb-2">Select contacts</h4>
                  <p className="text-gray-500">Choose one or more team members to start a conversation</p>
                </div>
              )}
            </div>

            {/* Map */}
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-800">Office Location</h3>
                </div>
              </div>
              <div className="h-64">
            <iframe
              className="w-full h-full"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d4651.900710373046!2d73.73536247598082!3d20.014558521837216!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bdded0040680497%3A0x76c25323ee3fdc14!2sPlanetEye%20Farm%20AI%20ltd!5e1!3m2!1sen!2sin!4v1765186331122!5m2!1sen!2sin"
              allowFullScreen
              loading="lazy"
              style={{ border: 0 }}
              referrerPolicy="no-referrer-when-downgrade"
            ></iframe>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Message View Modal/Card */}
      {showMessageView && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => {
                    setShowMessageView(false);
                    setSelectedConversation(null);
                    setMessages([]);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
                <div>
                  <h2 className="text-xl font-semibold text-gray-800">
                    {selectedConversation?.other_participant
                      ? `${selectedConversation.other_participant.first_name} ${selectedConversation.other_participant.last_name}`
                      : 'Messages'}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {selectedConversation?.other_participant?.role_display || ''}
                  </p>
                </div>
              </div>
              {selectedConversation && (
                <button
                  onClick={() => {
                    const otherParticipant = selectedConversation.other_participant;
                    if (otherParticipant) {
                      fetchConversationMessages(otherParticipant.id);
                    }
                  }}
                  disabled={loadingMessages}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  title="Refresh Messages"
                >
                  <Loader2 className={`w-5 h-5 text-blue-600 ${loadingMessages ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>

            {/* Messages List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50 messages-container">
              {/* Debug: Show message count */}
              {messages.length > 0 && (
                <div className="text-xs text-gray-400 mb-2 text-center">
                  Showing {messages.length} message{messages.length !== 1 ? 's' : ''}
                </div>
              )}
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                <>
                  {messages.map((msg, index) => {
                    const currentUser = getUserData();
                    const isCurrentUser = currentUser && msg.sender && msg.sender.id === currentUser.id;

                    return (
                      <div
                        key={msg.id || `msg-${index}-${msg.created_at}`}
                        className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-2xl p-4 ${
                            isCurrentUser
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-gray-800 border border-gray-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-sm">
                              {msg.sender?.first_name || ''} {msg.sender?.last_name || ''}
                            </span>
                            <span className={`text-xs ${isCurrentUser ? 'text-blue-100' : 'text-gray-500'}`}>
                              {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{msg.content || ''}</p>
                          {msg.is_read && isCurrentUser && (
                            <div className="mt-2 text-xs text-blue-100 flex items-center gap-1">
                              <CheckCircle size={12} />
                              Read
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {/* Scroll anchor */}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Reply Form */}
            {selectedConversation && (
              <div className="p-6 border-t border-gray-200 bg-white">
                <form onSubmit={handleSendReply} className="flex gap-3">
                  <textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Type your reply..."
                    className="flex-1 p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={2}
                    disabled={sendingReply}
                  />
                  <button
                    type="submit"
                    disabled={!replyMessage.trim() || sendingReply}
                    className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  >
                    {sendingReply ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Send size={18} />
                        Send
                      </>
                    )}
                  </button>
                </form>
                {sendError && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span className="text-red-800 text-sm">{sendError}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
};

export default Contactuser;
