const chatService = require('../services/chatService');
const { validateSocketAuth } = require('../middleware/socketAuth');
const logger = require('../utils/logger');

const setupChatEvents = (io) => {
    // Chat namespace for real-time messaging
    const chatNamespace = io.of('/chat');

    chatNamespace.use(validateSocketAuth);

    chatNamespace.on('connection', (socket) => {
        logger.info(`User ${socket.userId} connected to chat`);

        // Join user to their personal room for direct messages
        socket.join(`user_${socket.userId}`);

        // Handle joining chat rooms
        socket.on('chat:join', async (data) => {
            try {
                const { chatId } = data;

                // Verify user has access to this chat
                const hasAccess = await chatService.verifyUserAccess(socket.userId, chatId);
                if (!hasAccess) {
                    socket.emit('chat:error', { message: 'Access denied to chat' });
                    return;
                }

                socket.join(chatId);

                // Mark messages as read when joining
                await chatService.markMessagesAsRead(chatId, socket.userId);

                socket.emit('chat:joined', { chatId });
                logger.info(`User ${socket.userId} joined chat ${chatId}`);
            } catch (error) {
                logger.error('Chat join error:', error);
                socket.emit('chat:error', { message: 'Failed to join chat' });
            }
        });

        // Handle leaving chat rooms
        socket.on('chat:leave', (data) => {
            const { chatId } = data;
            socket.leave(chatId);
            socket.emit('chat:left', { chatId });
            logger.info(`User ${socket.userId} left chat ${chatId}`);
        });

        // Handle sending messages
        socket.on('chat:message', async (data) => {
            try {
                const {
                    chatId,
                    content,
                    type = 'text',
                    recipientId,
                    recipientType,
                    metadata = {}
                } = data;

                // Create message in database
                const message = await chatService.createMessage({
                    chatId,
                    senderId: socket.userId,
                    senderType: socket.userType,
                    content,
                    type,
                    recipientId,
                    recipientType,
                    metadata
                });

                // Emit to all participants in the chat
                chatNamespace.to(chatId).emit('chat:message', {
                    id: message.id,
                    chatId,
                    senderId: socket.userId,
                    senderName: socket.userName,
                    senderType: socket.userType,
                    content,
                    type,
                    timestamp: message.createdAt,
                    status: 'sent',
                    metadata
                });

                // Send push notification to offline users
                const offlineParticipants = await chatService.getOfflineParticipants(chatId, socket.userId);
                for (const participant of offlineParticipants) {
                    await chatService.sendPushNotification(participant, {
                        title: `Message from ${socket.userName}`,
                        body: type === 'text' ? content : `${type.charAt(0).toUpperCase() + type.slice(1)} message`,
                        data: { chatId, senderId: socket.userId, type: 'chat_message' }
                    });
                }

                // Acknowledge message sent
                socket.emit('chat:message:sent', {
                    tempId: data.tempId,
                    messageId: message.id,
                    timestamp: message.createdAt
                });

                logger.info(`Message sent in chat ${chatId} by user ${socket.userId}`);
            } catch (error) {
                logger.error('Chat message error:', error);
                socket.emit('chat:message:failed', {
                    tempId: data.tempId,
                    error: 'Failed to send message'
                });
            }
        });

        // Handle typing indicators
        socket.on('chat:typing:start', (data) => {
            const { chatId } = data;
            socket.to(chatId).emit('chat:typing:start', {
                userId: socket.userId,
                userName: socket.userName
            });
        });

        socket.on('chat:typing:stop', (data) => {
            const { chatId } = data;
            socket.to(chatId).emit('chat:typing:stop', {
                userId: socket.userId
            });
        });

        // Handle message status updates (delivered, read)
        socket.on('chat:message:delivered', async (data) => {
            try {
                const { messageId, chatId } = data;

                await chatService.updateMessageStatus(messageId, 'delivered');

                // Notify sender about delivery
                chatNamespace.to(chatId).emit('chat:message:status', {
                    messageId,
                    status: 'delivered',
                    userId: socket.userId
                });
            } catch (error) {
                logger.error('Message delivery update error:', error);
            }
        });

        socket.on('chat:message:read', async (data) => {
            try {
                const { messageId, chatId } = data;

                await chatService.updateMessageStatus(messageId, 'read');

                // Notify sender about read receipt
                chatNamespace.to(chatId).emit('chat:message:status', {
                    messageId,
                    status: 'read',
                    userId: socket.userId
                });
            } catch (error) {
                logger.error('Message read update error:', error);
            }
        });

        // Handle message deletion
        socket.on('chat:message:delete', async (data) => {
            try {
                const { messageId, chatId } = data;

                // Verify user owns the message
                const canDelete = await chatService.canUserDeleteMessage(messageId, socket.userId);
                if (!canDelete) {
                    socket.emit('chat:error', { message: 'Cannot delete this message' });
                    return;
                }

                await chatService.deleteMessage(messageId);

                // Notify all participants
                chatNamespace.to(chatId).emit('chat:message:deleted', {
                    messageId,
                    deletedBy: socket.userId
                });

                logger.info(`Message ${messageId} deleted by user ${socket.userId}`);
            } catch (error) {
                logger.error('Message delete error:', error);
                socket.emit('chat:error', { message: 'Failed to delete message' });
            }
        });

        // Handle creating new chats
        socket.on('chat:create', async (data) => {
            try {
                const { participantId, participantType, initialMessage } = data;

                // Create or get existing chat
                const chat = await chatService.createOrGetChat(
                    socket.userId,
                    socket.userType,
                    participantId,
                    participantType
                );

                // Join the chat room
                socket.join(chat.id);

                // Notify participant about new chat
                chatNamespace.to(`user_${participantId}`).emit('chat:created', {
                    chatId: chat.id,
                    participant: {
                        id: socket.userId,
                        name: socket.userName,
                        type: socket.userType
                    }
                });

                socket.emit('chat:created', {
                    chatId: chat.id,
                    participant: {
                        id: participantId,
                        name: data.participantName,
                        type: participantType
                    }
                });

                // Send initial message if provided
                if (initialMessage) {
                    socket.emit('chat:message', {
                        ...initialMessage,
                        chatId: chat.id
                    });
                }

                logger.info(`Chat created between ${socket.userId} and ${participantId}`);
            } catch (error) {
                logger.error('Chat creation error:', error);
                socket.emit('chat:error', { message: 'Failed to create chat' });
            }
        });

        // Handle getting chat history
        socket.on('chat:history', async (data) => {
            try {
                const { chatId, page = 1, limit = 50 } = data;

                // Verify access
                const hasAccess = await chatService.verifyUserAccess(socket.userId, chatId);
                if (!hasAccess) {
                    socket.emit('chat:error', { message: 'Access denied to chat' });
                    return;
                }

                const messages = await chatService.getChatHistory(chatId, page, limit);

                socket.emit('chat:history', {
                    chatId,
                    messages,
                    page,
                    hasMore: messages.length === limit
                });
            } catch (error) {
                logger.error('Chat history error:', error);
                socket.emit('chat:error', { message: 'Failed to load chat history' });
            }
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            logger.info(`User ${socket.userId} disconnected from chat`);
        });
    });
};

module.exports = { setupChatEvents };