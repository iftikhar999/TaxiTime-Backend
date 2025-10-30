/**
 * Prisma Query Logger
 * 
 * Intercepts all Prisma queries to log them for analysis
 */

const { logDatabaseQuery } = require('./performanceLogger');

/**
 * Create Prisma middleware for query logging
 */
function createPrismaLoggingMiddleware() {
    return async (params, next) => {
        const startTime = Date.now();
        
        try {
            const result = await next(params);
            const duration = Date.now() - startTime;
            
            // Log the query
            logDatabaseQuery(
                `${params.action} ${params.model || 'unknown'}`,
                duration,
                {
                    model: params.model,
                    action: params.action,
                    args: params.args ? Object.keys(params.args) : [],
                }
            );
            
            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            
            // Log failed query
            logDatabaseQuery(
                `${params.action} ${params.model || 'unknown'} [FAILED]`,
                duration,
                {
                    model: params.model,
                    action: params.action,
                    error: error.message,
                }
            );
            
            throw error;
        }
    };
}

module.exports = {
    createPrismaLoggingMiddleware,
};

