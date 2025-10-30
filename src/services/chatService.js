const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const pushNotificationService = require('./pushNotificationService');
const logger = require('../utils/logger');

class ChatService {
    /**
     * Create or get existing chat between two users
     */
    async createOrGetChat(userId1, userType1, userId2, userType2) {
        try {
            // Look for existing chat between these users
            const existingChat = await prisma.chat.findFirst({
                where: {
                    participants: {
                        every: {
                            OR: [
                                { userId: userId1 },
                                { userId: userId2 }
                            ]
                        }
                    }
                },
                include: {
                    participants: true
                }
            });

            if (existingChat && existingChat.participants.length === 2) {
                return existingChat;
            }

            // Create new chat
            const chat = await prisma.chat.create({
                data: {
                    type: 'direct',
                    participants: {
                        create: [
                            {
                                userId: userId1,
                                userType: userType1,
                                role: 'member'
                            },
                            {
                                userId: userId2,
                                userType: userType2,
                                role: 'member'
                            }
                        ]
                    }
                },
                include: {
                    participants: true
                }
            });

            return chat;
        } catch (error) {
            logger.error('Create/get chat error:', error);
            throw error;
        }
    }

    /**
     * Create a new message in a chat
     */
    async createMessage(messageData) {
        try {
            const {
                chatId,
                senderId,
                senderType,
                content,
                type = 'text',
                recipientId,
                recipientType,
                metadata = {}
            } = messageData;

            const message = await prisma.message.create({
                data: {
                    chatId,
                    senderId,
                    senderType,
                    content,
                    type,
                    recipientId,
                    recipientType,
                    metadata,
                    status: 'sent'
                }
            });

            // Update chat's last message
            await prisma.chat.update({
                where: { id: chatId },
                data: {
                    lastMessageId: message.id,
                    lastMessageTime: message.createdAt
                }
            });

            return message;
        } catch (error) {
            logger.error('Create message error:', error);
            throw error;
        }
    }

    /**
     * Get chat history with pagination
     */
    async getChatHistory(chatId, page = 1, limit = 50) {
        try {
            const offset = (page - 1) * limit;

            const messages = await prisma.message.findMany({
                where: { chatId },
                orderBy: { createdAt: 'desc' },
                skip: offset,
                take: limit,
                include: {
                    sender: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            profileImage: true
                        }
                    }
                }
            });

            return messages.reverse(); // Return in chronological order
        } catch (error) {
            logger.error('Get chat history error:', error);
            throw error;
        }
    }

    /**
     * Verify user has access to a chat
     */
    async verifyUserAccess(userId, chatId) {
        try {
            const participant = await prisma.chatParticipant.findFirst({
                where: {
                    chatId,
                    userId
                }
            });

            return !!participant;
        } catch (error) {
            logger.error('Verify user access error:', error);
            return false;
        }
    }

    /**
     * Mark messages as read
     */
    async markMessagesAsRead(chatId, userId) {
        try {
            await prisma.message.updateMany({
                where: {
                    chatId,
                    recipientId: userId,
                    status: { not: 'read' }
                },
                data: {
                    status: 'read',
                    readAt: new Date()
                }
            });

            return true;
        } catch (error) {
            logger.error('Mark messages as read error:', error);
            throw error;
        }
    }

    /**
     * Update message status
     */
    async updateMessageStatus(messageId, status) {
        try {
            const updateData = { status };

            if (status === 'delivered') {
                updateData.deliveredAt = new Date();
            } else if (status === 'read') {
                updateData.readAt = new Date();
            }

            await prisma.message.update({
                where: { id: messageId },
                data: updateData
            });

            return true;
        } catch (error) {
            logger.error('Update message status error:', error);
            throw error;
        }
    }

    /**
     * Delete a message
     */
    async deleteMessage(messageId) {
        try {
            await prisma.message.update({
                where: { id: messageId },
                data: {
                    deleted: true,
                    deletedAt: new Date()
                }
            });

            return true;
        } catch (error) {
            logger.error('Delete message error:', error);
            throw error;
        }
    }

    /**
     * Check if user can delete a message
     */
    async canUserDeleteMessage(messageId, userId) {
        try {
            const message = await prisma.message.findUnique({
                where: { id: messageId }
            });

            return message && message.senderId === userId;
        } catch (error) {
            logger.error('Can user delete message error:', error);
            return false;
        }
    }

    /**
     * Get offline participants in a chat
     */
    async getOfflineParticipants(chatId, excludeUserId) {
        try {
            // This would integrate with your online user tracking system
            // For now, we'll return all participants except the sender
            const participants = await prisma.chatParticipant.findMany({
                where: {
                    chatId,
                    userId: { not: excludeUserId }
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            deviceTokens: true
                        }
                    }
                }
            });

            return participants.map(p => p.user);
        } catch (error) {
            logger.error('Get offline participants error:', error);
            return [];
        }
    }

    /**
     * Send push notification
     */
    async sendPushNotification(user, notificationData) {
        try {
            if (user.deviceTokens && user.deviceTokens.length > 0) {
                await pushNotificationService.sendToTokens(
                    user.deviceTokens,
                    notificationData
                );
            }
        } catch (error) {
            logger.error('Send push notification error:', error);
        }
    }

    /**
     * Get user chats with unread counts
     */
    async getUserChats(userId) {
        try {
            const chats = await prisma.chat.findMany({
                where: {
                    participants: {
                        some: {
                            userId
                        }
                    }
                },
                include: {
                    participants: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    profileImage: true
                                }
                            }
                        }
                    },
                    lastMessage: true,
                    _count: {
                        select: {
                            messages: {
                                where: {
                                    recipientId: userId,
                                    status: { not: 'read' }
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    lastMessageTime: 'desc'
                }
            });

            return chats.map(chat => ({
                id: chat.id,
                type: chat.type,
                participants: chat.participants.map(p => ({
                    id: p.user.id,
                    name: `${p.user.firstName} ${p.user.lastName}`,
                    type: p.userType,
                    profileImage: p.user.profileImage
                })),
                lastMessage: chat.lastMessage,
                lastMessageTime: chat.lastMessageTime,
                unreadCount: chat._count.messages
            }));
        } catch (error) {
            logger.error('Get user chats error:', error);
            throw error;
        }
    }

    /**
     * Get total unread message count for user
     */
    async getTotalUnreadCount(userId) {
        try {
            const count = await prisma.message.count({
                where: {
                    recipientId: userId,
                    status: { not: 'read' }
                }
            });

            return count;
        } catch (error) {
            logger.error('Get total unread count error:', error);
            return 0;
        }
    }

    /**
     * Search messages
     */
    async searchMessages(userId, query, chatId = null) {
        try {
            const whereClause = {
                content: {
                    contains: query,
                    mode: 'insensitive'
                },
                chat: {
                    participants: {
                        some: {
                            userId
                        }
                    }
                }
            };

            if (chatId) {
                whereClause.chatId = chatId;
            }

            const messages = await prisma.message.findMany({
                where: whereClause,
                include: {
                    chat: {
                        include: {
                            participants: {
                                include: {
                                    user: {
                                        select: {
                                            id: true,
                                            firstName: true,
                                            lastName: true
                                        }
                                    }
                                }
                            }
                        }
                    },
                    sender: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                },
                take: 50
            });

            return messages;
        } catch (error) {
            logger.error('Search messages error:', error);
            throw error;
        }
    }
}

module.exports = new ChatService();